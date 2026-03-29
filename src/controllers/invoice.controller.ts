import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { InvoiceStatus, LedgerRefType, LedgerType, PaymentMode, StockRefType } from "@prisma/client";
import { getLastPartyBalanceTx } from "../services/ledger.service";

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
const deriveStatus = (received: number, total: number): InvoiceStatus => {
  if (received <= 0)     return InvoiceStatus.OPEN;
  if (received >= total) return InvoiceStatus.PAID;
  return InvoiceStatus.PARTIAL;
};

/** Coerce any frontend string → Prisma PaymentMode enum (or null if not provided) */
const toPaymentMode = (mode?: string): PaymentMode | null => {
  if (!mode) return null;
  const map: Record<string, PaymentMode> = {
    cash:          PaymentMode.CASH,
    upi:           PaymentMode.UPI,
    card:          PaymentMode.CARD,
    netbanking:    PaymentMode.NETBANKING,
    bank_transfer: PaymentMode.BANK_TRANSFER,
    cheque:        PaymentMode.CHEQUE,
  };
  return map[mode.trim().toLowerCase()] ?? PaymentMode.CASH;
};

/**
 * Extract numeric tax rate from a label like "GST 18%" → 18
 * Returns 0 for "No Tax Applicable" or any unrecognised string.
 */
function extractTaxRate(taxLabel: string): number {
  const m = (taxLabel ?? "").match(/(\d+)%/);
  return m ? Number(m[1]) : 0;
}

/* ═══════════════════════════════════════════════════════════
   CREATE INVOICE
   POST /api/invoices
═══════════════════════════════════════════════════════════ */
export const createInvoice = async (req: Request, res: Response) => {
  const {
    partyId,
    branchCode,
    invoiceDate,
    dueDate,
    items              = [],
    additionalCharges  = [],
    discountAmount     = 0,
    roundOff           = 0,
    paymentMode,
    receivedAmount     = 0,
    notes,
    termsConditions,
    ewayBillNo,
    challanNo,
    financedBy,
    salesman,
    emailId,
    warrantyPeriod,
    applyTcs           = false,
    autoRoundOff       = false,
    signatureUrl,
    showEmptySignatureBox = false,
    // ── NEW extended fields ──────────────────────────────────
    poNumber,
    vehicleNo,
    dispatchedThrough,
    transportName,
    customFieldValues,
    paymentDetails,
    financeDetails,
  } = req.body;

  if (!partyId || !items || items.length === 0) {
    return res.status(400).json({ success: false, message: "partyId and items are required" });
  }

  try {
    // ── PRE-FETCH: Read all products + stocks + settings BEFORE the transaction ──
    // Filter out null/undefined productIds (free-text items have no linked product)
    const productIds = items
      .map((i: any) => i.productId)
      .filter((id: any) => id != null && !isNaN(Number(id)))
      .map(Number);

    const [allProducts, invoiceSettings] = await Promise.all([
      productIds.length > 0
        ? prisma.product.findMany({ where: { id: { in: productIds } } })
        : Promise.resolve([]),
      prisma.invoiceSettings.findFirst({ orderBy: { id: "asc" } }),
    ]);

    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    // Validate only items that have a productId (skip free-text items)
    for (const item of items) {
      if (item.productId != null && !productMap.has(Number(item.productId))) {
        return res.status(400).json({
          success: false,
          message: `Product not found (ID: ${item.productId})`,
        });
      }
    }

    // Pre-fetch stocks for product items only (not Services, not free-text)
    const productTypeItems = items.filter(
      (i: any) => i.productId != null && productMap.get(Number(i.productId))?.itemType === "Product"
    );

    const stockChecks = await Promise.all(
      productTypeItems.map((item: any) =>
        item.godownId
          ? prisma.productStock.findUnique({
              where: { productId_godownId: { productId: Number(item.productId), godownId: item.godownId } },
            })
          : prisma.productStock.findFirst({ where: { productId: Number(item.productId) } })
      )
    );

    // Validate stock availability
    for (let i = 0; i < productTypeItems.length; i++) {
      const item    = productTypeItems[i];
      const stock   = stockChecks[i];
      const product = productMap.get(Number(item.productId))!;
      const available = Number(stock?.currentStock ?? stock?.openingStock ?? 0);

      if (!stock || available < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}" (available: ${available}, requested: ${item.quantity})`,
        });
      }
    }

    // ════════════════════════════════════════════════════════════════
    // COMPUTE TOTALS — same model as frontend (SISummary / CreateSalesInvoice)
    //
    // NEW MODEL: Invoice-level discount reduces the GST-inclusive total,
    // then reverse-calculation splits the reduced total into taxable + tax.
    //
    // Step 1: Per-line taxable and tax (discount per line applied first)
    // Step 2: preTotalAmount = itemsTaxableSum + itemsTaxSum + chargesTotal
    // Step 3: afterDiscTotal = preTotalAmount - discountAmount (invoice-level disc)
    // Step 4: Reverse-calculate:
    //   scaleFactor = afterDiscTotal / preTotalAmount
    //   subTotal    = itemsTaxableSum × scaleFactor  (stored as taxable)
    //   taxAmount   = itemsTaxSum     × scaleFactor  (stored as tax)
    // ════════════════════════════════════════════════════════════════

    // ── Per-line taxable and tax (before invoice-level discount) ──────────────
    let itemsTaxableSum = 0;
    let itemsTaxSum     = 0;

    for (const item of items) {
      const lineGross     = Number(item.price) * Number(item.quantity);
      const discPct       = Number(item.discountPct ?? 0);
      const discAmt       = Number(item.discount    ?? 0);
      // discPct takes priority: when % is set, flat amount is ignored
      const lineDiscAmt   = discPct > 0
        ? Math.round(lineGross * (discPct / 100) * 100) / 100
        : Math.round(discAmt * 100) / 100;
      const taxableBase   = Math.max(0, lineGross - lineDiscAmt);
      const lineTax       = Math.round(taxableBase * ((item.taxRate || 0) / 100) * 100) / 100;
      itemsTaxableSum    += taxableBase;
      itemsTaxSum        += lineTax;
    }

    // ── Additional charges total ──────────────────────────────────────────────
    let chargesBase = 0;
    let chargesTax  = 0;
    for (const c of additionalCharges as { name: string; amount: number; taxLabel?: string }[]) {
      const rate   = extractTaxRate(c.taxLabel ?? "");
      const taxAmt = Math.round((c.amount ?? 0) * rate / 100 * 100) / 100;
      chargesBase += (c.amount ?? 0);
      chargesTax  += taxAmt;
    }
    const additionalChargesTotal = Math.round((chargesBase + chargesTax) * 100) / 100;

    // ── GST-inclusive total before invoice-level discount ─────────────────────
    const preTotalAmount = Math.round(
      (itemsTaxableSum + itemsTaxSum + additionalChargesTotal) * 100
    ) / 100;

    // ── Invoice-level discount (applied on GST-inclusive total) ───────────────
    // discountAmount is passed from the frontend already computed (invoiceDiscAmt)
    const invDiscAmt    = Math.min(Number(discountAmount) || 0, preTotalAmount);
    const afterDiscTotal = Math.max(0, Math.round((preTotalAmount - invDiscAmt) * 100) / 100);

    // ── Reverse-calculate: split afterDiscTotal into taxable + tax ─────────────
    // scaleFactor = afterDiscTotal / preTotalAmount
    // subTotal    = itemsTaxableSum × scaleFactor   (= stored taxable amount)
    // taxAmount   = itemsTaxSum     × scaleFactor   (= stored tax amount)
    let subTotal  = itemsTaxableSum;
    let taxAmount = itemsTaxSum;
    if (preTotalAmount > 0 && invDiscAmt > 0) {
      const scaleFactor = afterDiscTotal / preTotalAmount;
      subTotal  = Math.round(itemsTaxableSum * scaleFactor * 100) / 100;
      taxAmount = Math.round(itemsTaxSum     * scaleFactor * 100) / 100;
    }

    // ── Final totals ──────────────────────────────────────────────────────────
    const taxableAmount     = subTotal;   // already reverse-calculated
    const totalAmount       = Math.round((afterDiscTotal + Number(roundOff)) * 100) / 100;
    const outstandingAmount = Math.max(0, Math.round((totalAmount - Number(receivedAmount)) * 100) / 100);

    // ── Build invoice number OUTSIDE tx ──────────────────────────────────────
    const usePrefix       = invoiceSettings?.enablePrefix ?? false;
    const prefix          = usePrefix && invoiceSettings?.prefix?.trim()
                              ? invoiceSettings.prefix.trim()
                              : "INV-";
    const seqFromSettings = invoiceSettings?.sequenceNumber ?? 1;

    const allNos = await prisma.invoice.findMany({ select: { invoiceNo: true } });
    let maxExistingSeq = 0;
    for (const inv of allNos) {
      if (inv.invoiceNo?.startsWith(prefix)) {
        const m = inv.invoiceNo.slice(prefix.length).match(/^(\d+)$/);
        if (m) maxExistingSeq = Math.max(maxExistingSeq, parseInt(m[1], 10));
      }
    }
    let nextSeq   = Math.max(seqFromSettings, maxExistingSeq + 1);
    let invoiceNo = `${prefix}${String(nextSeq).padStart(5, "0")}`;
    while (await prisma.invoice.findUnique({ where: { invoiceNo } })) {
      nextSeq++;
      invoiceNo = `${prefix}${String(nextSeq).padStart(5, "0")}`;
    }

    // Build stock-update map
    const stockUpdateMap = new Map<
      number,
      { stockId: number; newBalance: number; productId: number; godownId: number | null }
    >();
    for (let i = 0; i < productTypeItems.length; i++) {
      const item  = productTypeItems[i];
      const stock = stockChecks[i]!;
      const pid   = Number(item.productId);
      const newBalance = Number(stock.currentStock ?? stock.openingStock ?? 0) - Number(item.quantity);
      stockUpdateMap.set(pid, {
        stockId:   stock.id,
        newBalance,
        productId: pid,
        godownId:  stock.godownId,
      });
    }

    // ── TRANSACTION — only critical DB writes ─────────────────────────────────
    const created = await prisma.$transaction(
      async (tx) => {
        // 1. Create invoice + items + additional charges (with taxLabel/taxAmount)
        const inv = await (tx.invoice.create as any)({
          data: {
            invoiceNo,
            partyId,
            branchCode:  branchCode ?? null,
            invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
            dueDate:     dueDate    ? new Date(dueDate)     : null,
            ewayBillNo:     ewayBillNo     ?? null,
            challanNo:      challanNo      ?? null,
            financedBy:     financedBy     ?? null,
            salesman:       salesman       ?? null,
            emailId:        emailId        ?? null,
            warrantyPeriod: warrantyPeriod ?? null,
            notes:          notes          ?? null,
            termsConditions: termsConditions ?? null,
            // ── NEW extended fields ──────────────────────────────
            poNumber:          poNumber          ?? null,
            vehicleNo:         vehicleNo         ?? null,
            dispatchedThrough: dispatchedThrough ?? null,
            transportName:     transportName     ?? null,
            customFieldValues: customFieldValues ?? {},
            paymentDetails:    paymentDetails    ?? null,
            financeDetails:    (financeDetails?.enabled === true) ? financeDetails : null,
            // ── Financials ───────────────────────────────────────
            subTotal,
            taxableAmount,
            discountAmount,
            additionalChargesTotal,
            taxAmount,
            roundOff,
            totalAmount,
            receivedAmount,
            outstandingAmount,
            paymentMode: toPaymentMode(paymentMode),
            applyTcs,
            autoRoundOff,
            signatureUrl:          signatureUrl          ?? null,
            showEmptySignatureBox: showEmptySignatureBox ?? false,
            status: deriveStatus(Number(receivedAmount), totalAmount),
          },
        });

        // ── 1b. Insert items — use createMany so we can skip relation
        //        validation for free-text items (no productId).
        //        We must use $executeRaw because Prisma's typed createMany
        //        still enforces the NOT NULL productId from the OLD generated
        //        client until `prisma generate` is re-run after migration.
        //        This raw insert works with BOTH the old and new schema.
        for (const item of items) {
          const lineGross     = Number(item.price) * Number(item.quantity);
          const discPct       = Number(item.discountPct ?? 0);
          const discAmt       = Number(item.discount    ?? 0);
          const pctDiscount   = Math.round(lineGross * (discPct / 100) * 100) / 100;
          const totalDiscount = Math.round((pctDiscount + discAmt) * 100) / 100;
          const taxableBase   = Math.max(0, lineGross - totalDiscount);
          const taxAmt        = Math.round(taxableBase * ((item.taxRate || 0) / 100) * 100) / 100;
          const lineTotal     = Math.round((taxableBase + taxAmt) * 100) / 100;
          const resolvedProductId = item.productId != null ? Number(item.productId) : null;
          const resolvedProductName = item.productName ?? item.name ?? null;

          await tx.$executeRaw`
            INSERT INTO "InvoiceItem"
              ("invoiceId", "productId", "productName", "godownId",
               "quantity", "price", "discountPct", "discount",
               "taxRate", "taxAmount", "total")
            VALUES
              (${inv.id}, ${resolvedProductId}, ${resolvedProductName}, ${item.godownId ?? null},
               ${Number(item.quantity)}, ${Number(item.price)}, ${discPct}, ${totalDiscount},
               ${Number(item.taxRate ?? 0)}, ${taxAmt}, ${lineTotal})
          `;
        }

        // ── 1c. Additional charges
        if (additionalCharges.length > 0) {
          await tx.invoiceAdditionalCharge.createMany({
            data: additionalCharges.map((c: { name: string; amount: number; taxLabel?: string }) => {
              const rate   = extractTaxRate(c.taxLabel ?? "");
              const taxAmt = Math.round((c.amount ?? 0) * rate / 100 * 100) / 100;
              return {
                invoiceId: inv.id,
                name:      c.name,
                amount:    c.amount,
                taxLabel:  c.taxLabel ?? "No Tax Applicable",
                taxAmount: taxAmt,
              };
            }),
          });
        }

        // 2. Stock updates — all in PARALLEL
        if (stockUpdateMap.size > 0) {
          await Promise.all(
            Array.from(stockUpdateMap.values()).map(({ stockId, newBalance }) =>
              tx.productStock.update({
                where: { id: stockId },
                data:  { currentStock: newBalance },
              })
            )
          );
        }

        // 3. Party ledger DEBIT
        const balanceAfterDebit = (await getLastPartyBalanceTx(tx, partyId)) + totalAmount;
        await tx.partyLedger.create({
          data: {
            partyId,
            refType:   LedgerRefType.Invoice,
            refId:     inv.id,
            reference: inv.invoiceNo,
            type:      LedgerType.DEBIT,
            debit:     totalAmount,
            credit:    null,
            balance:   balanceAfterDebit,
          },
        });

        // 4. If upfront payment — CREDIT immediately
        if (Number(receivedAmount) > 0) {
          await tx.partyLedger.create({
            data: {
              partyId,
              refType:   LedgerRefType.Payment,
              refId:     inv.id,
              reference: inv.invoiceNo,
              type:      LedgerType.CREDIT,
              debit:     null,
              credit:    receivedAmount,
              balance:   balanceAfterDebit - Number(receivedAmount),
            },
          });
        }

        // 5. Increment sequence atomically
        if (invoiceSettings?.id) {
          await tx.invoiceSettings.update({
            where: { id: invoiceSettings.id },
            data:  { sequenceNumber: nextSeq + 1 },
          });
        }

        // ✅ UPDATE PROFORMA STATUS AFTER INVOICE SAVE
if (req.body.proformaId) {
  await tx.proformaInvoice.update({
    where: { id: Number(req.body.proformaId) },
    data: {
      status: "CONVERTED",
      convertedToInvoiceId: inv.id
    }
  });
}
        return inv;

      },
      { timeout: 15000 }
    );

    // ── OUTSIDE TRANSACTION — StockLedger (non-critical) ─────────────────────
    if (stockUpdateMap.size > 0) {
      await prisma.stockLedger.createMany({
        data: Array.from(stockUpdateMap.values()).map(({ productId, godownId, newBalance }) => {
          const item = items.find((i: any) => Number(i.productId) === productId)!;
          return {
            productId,
            godownId:    godownId ?? null,
            date:        new Date(),
            refType:     StockRefType.SALE,
            refId:       created.id,
            quantityIn:  0,
            quantityOut: Number(item.quantity),
            balance:     newBalance,
            remarks:     `Sales Invoice ${invoiceNo}`,
          };
        }),
      });
    }

    return res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      data: created,
    });
  } catch (error: any) {
    console.error("❌ Create Invoice Error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   GET ALL INVOICES
   GET /api/invoices
═══════════════════════════════════════════════════════════ */
export const getInvoices = async (req: Request, res: Response) => {
  try {
    const { partyId, status, limit, page, from, to, search, sortField, sortDir } = req.query;

    const where: any = {};
    if (partyId) where.partyId = Number(partyId);
    if (status) {
      const statuses = String(status).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      where.status   = statuses.length === 1 ? statuses[0] : { in: statuses };
    }

    // ── Date range filter ────────────────────────────────────────────────────
    if (from || to) {
      where.invoiceDate = {};
      if (from) where.invoiceDate.gte = new Date(String(from));
      if (to) {
        const toDate = new Date(String(to));
        toDate.setHours(23, 59, 59, 999);
        where.invoiceDate.lte = toDate;
      }
    }

    // ── Search filter ────────────────────────────────────────────────────────
    if (search) {
      const q = String(search).trim();
      where.OR = [
        { invoiceNo:  { contains: q, mode: "insensitive" } },
        { party:      { name:     { contains: q, mode: "insensitive" } } },
        { party:      { partyName:{ contains: q, mode: "insensitive" } } },
        { salesman:   { contains: q, mode: "insensitive" } },
      ];
    }

    // ── Sorting ──────────────────────────────────────────────────────────────
    const dir = sortDir === "asc" ? "asc" : "desc";
    const allowedSortFields: Record<string, string> = {
      date:       "invoiceDate",
      invoiceNo:  "invoiceNo",
      amount:     "totalAmount",
      status:     "status",
      createdAt:  "createdAt",
    };
    const orderByField = allowedSortFields[String(sortField ?? "date")] ?? "invoiceDate";
    const orderBy = { [orderByField]: dir };

    const take = limit ? Math.min(500, Number(limit)) : 50;
    const skip = page ? (Number(page) - 1) * take : 0;

    // ── Fetch invoices + total count in parallel ──────────────────────────────
    const [invoices, total] = await Promise.all([
      (prisma.invoice.findMany as any)({
        where,
        include: {
          party:             true,
          // Use items without joining product — product may be null for free-text items.
          // The frontend mapper (fromSaleInvoice) already handles missing product gracefully.
          items:             true,
          additionalCharges: true,
          allocations:       true,
          salesReturns:      true,
        },
        orderBy,
        take,
        skip,
      }),
      prisma.invoice.count({ where }),
    ]);

    const pages = Math.ceil(total / take);

    return res.json({
      success: true,
      data: { invoices, total, page: Number(page ?? 1), pages },
    });
  } catch (error: any) {
    console.error("❌ Fetch Invoices Error:", error);
    return res.status(500).json({ success: false, message: error.message ?? "Failed to fetch invoices" });
  }
};

/* ═══════════════════════════════════════════════════════════
   GET SINGLE INVOICE
   GET /api/invoices/:id
═══════════════════════════════════════════════════════════ */
export const getInvoiceById = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid invoice ID" });

  try {
    const invoice = await (prisma.invoice.findUnique as any)({
      where: { id },
      include: {
        party:             true,
        // Fetch items without joining product — productId may be null for free-text items.
        // Fetch product separately only for items that have a productId.
        items:             true,
        additionalCharges: true,
        allocations:       true,
        salesReturns:      true,
      },
    });

    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    // Enrich items with product data where productId exists
    const productIds = (invoice.items ?? [])
      .map((i: any) => i.productId)
      .filter((id: any) => id != null)
      .map(Number);

    const products = productIds.length > 0
      ? await prisma.product.findMany({ where: { id: { in: productIds } } })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    invoice.items = (invoice.items ?? []).map((item: any) => ({
      ...item,
      product: item.productId != null ? (productMap.get(Number(item.productId)) ?? null) : null,
    }));

    return res.json({ success: true, data: invoice });
  } catch (error: any) {
    console.error("❌ Fetch Invoice Error:", error);
    return res.status(500).json({ success: false, message: error.message ?? "Failed to fetch invoice" });
  }
};

/* ═══════════════════════════════════════════════════════════
   UPDATE INVOICE  (non-financial meta fields only)
   PUT /api/invoices/:id
═══════════════════════════════════════════════════════════ */
export const updateInvoice = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid invoice ID" });

  const {
    dueDate, ewayBillNo, challanNo, financedBy,
    salesman, emailId, warrantyPeriod,
    notes, termsConditions,
    signatureUrl, showEmptySignatureBox,
    // ── NEW extended fields ──────────────────────────────────
    poNumber,
    vehicleNo,
    dispatchedThrough,
    transportName,
    customFieldValues,
    paymentDetails,
    financeDetails,
  } = req.body;

  try {
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing)
      return res.status(404).json({ success: false, message: "Invoice not found" });
    if (existing.status === InvoiceStatus.CANCELLED)
      return res.status(400).json({ success: false, message: "Cannot update a cancelled invoice" });

    const updated = await (prisma.invoice.update as any)({
      where: { id },
      data: {
        dueDate:               dueDate ? new Date(dueDate) : undefined,
        ewayBillNo:            ewayBillNo            ?? undefined,
        challanNo:             challanNo             ?? undefined,
        financedBy:            financedBy            ?? undefined,
        salesman:              salesman              ?? undefined,
        emailId:               emailId               ?? undefined,
        warrantyPeriod:        warrantyPeriod        ?? undefined,
        notes:                 notes                 ?? undefined,
        termsConditions:       termsConditions       ?? undefined,
        signatureUrl:          signatureUrl          !== undefined ? signatureUrl          : undefined,
        showEmptySignatureBox: showEmptySignatureBox !== undefined ? showEmptySignatureBox : undefined,
        // ── NEW extended fields ──────────────────────────────
        poNumber:          poNumber          !== undefined ? (poNumber          || null) : undefined,
        vehicleNo:         vehicleNo         !== undefined ? (vehicleNo         || null) : undefined,
        dispatchedThrough: dispatchedThrough !== undefined ? (dispatchedThrough || null) : undefined,
        transportName:     transportName     !== undefined ? (transportName     || null) : undefined,
        customFieldValues: customFieldValues !== undefined ? customFieldValues             : undefined,
        paymentDetails:    paymentDetails    !== undefined ? (paymentDetails    || null) : undefined,
        financeDetails:    financeDetails    !== undefined
                             ? (financeDetails?.enabled === true ? financeDetails : null)
                             : undefined,
      },
    });

    return res.json({ success: true, message: "Invoice updated", data: updated });
  } catch (error: any) {
    console.error("❌ Update Invoice Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   CANCEL INVOICE
   PATCH /api/invoices/:id/cancel
═══════════════════════════════════════════════════════════ */
export const cancelInvoice = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid invoice ID" });

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const invoice = await tx.invoice.findUnique({
          where:   { id },
          include: { items: true },
        });

        if (!invoice)
          throw new Error("Invoice not found");
        if (invoice.status === InvoiceStatus.CANCELLED)
          throw new Error("Invoice is already cancelled");

        // Restore stock in PARALLEL — skip free-text items (no productId)
        await Promise.all(
          invoice.items
            .filter((item) => item.productId != null)
            .map(async (item) => {
              const stock = await tx.productStock.findFirst({ where: { productId: item.productId! } });
              if (stock) {
                await tx.productStock.update({
                  where: { id: stock.id },
                  data:  { currentStock: { increment: item.quantity } },
                });
              }
            })
        );

        // Reversal ledger entry
        const newBalance =
          (await getLastPartyBalanceTx(tx, invoice.partyId)) -
          invoice.totalAmount.toNumber();

        await tx.partyLedger.create({
          data: {
            partyId:   invoice.partyId,
            refType:   LedgerRefType.Return,
            refId:     invoice.id,
            reference: invoice.invoiceNo,
            type:      LedgerType.CREDIT,
            debit:     null,
            credit:    invoice.totalAmount,
            balance:   newBalance,
          },
        });

        return tx.invoice.update({
          where: { id },
          data:  { status: InvoiceStatus.CANCELLED },
        });
      },
      { timeout: 15000 }
    );

    return res.json({ success: true, message: "Invoice cancelled", data: result });
  } catch (error: any) {
    console.error("❌ Cancel Invoice Error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   RECORD PAYMENT ON INVOICE
   PATCH /api/invoices/:id/payment
═══════════════════════════════════════════════════════════ */
export const recordInvoicePayment = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid invoice ID" });

  const { amount, paymentMode } = req.body;
  if (!amount || amount <= 0)
    return res.status(400).json({ success: false, message: "Invalid payment amount" });

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const invoice: any = await tx.invoice.findUnique({ where: { id } });

        if (!invoice)
          throw new Error("Invoice not found");
        if (invoice.status === InvoiceStatus.CANCELLED)
          throw new Error("Cannot pay a cancelled invoice");
        if (invoice.status === InvoiceStatus.PAID)
          throw new Error("Invoice is already fully paid");

        const currentOutstanding = Number(invoice.outstandingAmount ?? 0);
        if (amount > currentOutstanding)
          throw new Error(`Payment (${amount}) exceeds outstanding amount (${currentOutstanding})`);

        const newReceived    = Number(invoice.receivedAmount ?? 0) + amount;
        const newOutstanding = currentOutstanding - amount;
        const newStatus      = deriveStatus(newReceived, Number(invoice.totalAmount));

        const updated = await (tx.invoice.update as any)({
          where: { id },
          data: {
            receivedAmount:    newReceived,
            outstandingAmount: newOutstanding,
            paymentMode:       toPaymentMode(paymentMode) ?? toPaymentMode(invoice.paymentMode) ?? null,
            status:            newStatus,
          },
        });

        const newBalance = (await getLastPartyBalanceTx(tx, invoice.partyId)) - amount;
        await tx.partyLedger.create({
          data: {
            partyId:   invoice.partyId,
            refType:   LedgerRefType.Payment,
            refId:     invoice.id,
            reference: invoice.invoiceNo,
            type:      LedgerType.CREDIT,
            debit:     null,
            credit:    amount,
            balance:   newBalance,
          },
        });

        return updated;
      },
      { timeout: 15000 }
    );

    return res.json({ success: true, message: "Payment recorded", data: result });
  } catch (error: any) {
    console.error("❌ Record Payment Error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   INVOICE SUMMARY
   GET /api/invoices/summary
═══════════════════════════════════════════════════════════ */
export const getInvoiceSummary = async (_req: Request, res: Response) => {
  try {
    const [totalAgg, statusCounts, extraAgg, cancelledAgg] = await Promise.all([
      prisma.invoice.aggregate({
        where: { status: { not: InvoiceStatus.CANCELLED } },
        _sum:  { totalAmount: true },
      }),
      prisma.invoice.groupBy({ by: ["status"], _count: { id: true } }),
      (prisma.invoice.aggregate as any)({
        where: { status: { not: InvoiceStatus.CANCELLED } },
        _sum:  { receivedAmount: true, outstandingAmount: true },
      }),
      prisma.invoice.aggregate({
        where: { status: InvoiceStatus.CANCELLED },
        _sum:  { totalAmount: true },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    statusCounts.forEach((c) => { statusMap[c.status] = c._count.id; });

    return res.json({
      success: true,
      data: {
        totalInvoiced:    totalAgg._sum?.totalAmount          ?? 0,
        totalReceived:    extraAgg?._sum?.receivedAmount      ?? 0,
        totalOutstanding: extraAgg?._sum?.outstandingAmount   ?? 0,
        totalCancelled:   cancelledAgg._sum?.totalAmount      ?? 0,
        openCount:        statusMap[InvoiceStatus.OPEN]       ?? 0,
        partialCount:     statusMap[InvoiceStatus.PARTIAL]    ?? 0,
        paidCount:        statusMap[InvoiceStatus.PAID]       ?? 0,
        cancelledCount:   statusMap[InvoiceStatus.CANCELLED]  ?? 0,
      },
    });
  } catch (error) {
    console.error("❌ Invoice Summary Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch invoice summary" });
  }
};

/* ═══════════════════════════════════════════════════════════
   PARTY ITEM-WISE REPORT
   GET /api/invoices/party-item-wise/:id
═══════════════════════════════════════════════════════════ */
export const getPartyItemWiseReport = async (req: Request, res: Response) => {
  const partyId = Number(req.params.id);
  if (isNaN(partyId))
    return res.status(400).json({ success: false, message: "Invalid party ID" });

  try {
    const invoices = await prisma.invoice.findMany({
      where:   { partyId },
      include: { items: true },   // no product join — productId may be null
      orderBy: { createdAt: "desc" },
    });

    // Collect all non-null productIds and fetch in one query
    const productIds = invoices
      .flatMap((inv) => inv.items.map((i: any) => i.productId))
      .filter((id: any) => id != null)
      .map(Number);

    const products = productIds.length > 0
      ? await prisma.product.findMany({ where: { id: { in: productIds } } })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    const data = invoices.flatMap((invoice) =>
      invoice.items.map((item: any) => {
        const product = item.productId != null ? productMap.get(Number(item.productId)) : null;
        return {
          partyId,
          invoiceNo: invoice.invoiceNo,
          itemName:  product?.name ?? item.productName ?? "Free-text Item",
          itemCode:  product?.itemCode ?? null,
          quantity:  item.quantity,
          price:     Number(item.price),
          amount:    Number(item.total),
          type:      "Sale",
          date:      invoice.createdAt,
        };
      })
    );

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error("❌ Item-wise Report Error:", error);
    return res.status(500).json({ success: false, message: error.message ?? "Failed to fetch item-wise report" });
  }
};

/* ═══════════════════════════════════════════════════════════
   DELETE INVOICE
   DELETE /api/invoices/:id
═══════════════════════════════════════════════════════════ */
export const deleteInvoice = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid invoice ID" });

  try {
    await prisma.$transaction(
      async (tx) => {
        const invoice = await tx.invoice.findUnique({ where: { id } });
        if (!invoice) throw new Error("Invoice not found");

        await tx.partyLedger.deleteMany({ where: { refType: "Invoice", refId: id } });
        await (tx as any).paymentAllocation?.deleteMany?.({ where: { invoiceId: id } }).catch(() => {});
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
        await tx.invoice.delete({ where: { id } });
      },
      { timeout: 15000 }
    );

    return res.json({ success: true, message: "Invoice deleted successfully" });
  } catch (error: any) {
    console.error("❌ Delete Invoice Error:", error);
    if (error.message === "Invoice not found")
      return res.status(404).json({ success: false, message: "Invoice not found" });
    return res.status(500).json({ success: false, message: "Failed to delete invoice" });
  }
};
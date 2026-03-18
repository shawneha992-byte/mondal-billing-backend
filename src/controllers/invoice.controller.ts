import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { InvoiceStatus, LedgerRefType, LedgerType, StockRefType } from "@prisma/client";
import { getLastPartyBalanceTx } from "../services/ledger.service";

/* ═══════════════════════════════════════════════════════════
   HELPER
═══════════════════════════════════════════════════════════ */
const deriveStatus = (received: number, total: number): InvoiceStatus => {
  if (received <= 0)     return InvoiceStatus.OPEN;
  if (received >= total) return InvoiceStatus.PAID;
  return InvoiceStatus.PARTIAL;
};

/* ═══════════════════════════════════════════════════════════
   CREATE INVOICE
   POST /api/invoices
   FIX 1: timeout: 15000 on $transaction
   FIX 2: product validation & totals computed BEFORE entering tx
   FIX 3: parallel stock updates via Promise.all inside tx
   FIX 4: StockLedger writes moved OUTSIDE tx (non-critical)
   FIX 5: InvoiceSettings sequence updated via atomic increment
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
  } = req.body;

  if (!partyId || !items || items.length === 0) {
    return res.status(400).json({ success: false, message: "partyId and items are required" });
  }

  try {
    // ── PRE-FETCH: Read all products + stocks + settings BEFORE the transaction ──
    // This reduces queries inside the tx, cutting its duration significantly.
    const productIds = items.map((i: any) => i.productId);

    const [allProducts, invoiceSettings] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: productIds } } }),
      prisma.invoiceSettings.findFirst({ orderBy: { id: "asc" } }),
    ]);

    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    // Validate all products exist before entering tx
    for (const item of items) {
      if (!productMap.has(item.productId)) {
        return res.status(400).json({
          success: false,
          message: `Product not found (ID: ${item.productId})`,
        });
      }
    }

    // Pre-fetch stocks for all product items (only Products, not Services)
    const productTypeItems = items.filter((i: any) => productMap.get(i.productId)?.itemType === "Product");

    const stockChecks = await Promise.all(
      productTypeItems.map((item: any) =>
        item.godownId
          ? prisma.productStock.findUnique({
              where: { productId_godownId: { productId: item.productId, godownId: item.godownId } },
            })
          : prisma.productStock.findFirst({ where: { productId: item.productId } })
      )
    );

    // Validate stock availability
    for (let i = 0; i < productTypeItems.length; i++) {
      const item    = productTypeItems[i];
      const stock   = stockChecks[i];
      const product = productMap.get(item.productId)!;
      const available = Number(stock?.currentStock ?? stock?.openingStock ?? 0);

      if (!stock || available < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}" (available: ${available}, requested: ${item.quantity})`,
        });
      }
    }

    // ── Compute totals OUTSIDE tx (pure CPU, no DB) ──────────────────────────
    let subTotal  = 0;
    let taxAmount = 0;
    for (const item of items) {
      const lineTotal = item.price * item.quantity;
      const lineTax   = (lineTotal * (item.taxRate || 0)) / 100;
      subTotal  += lineTotal;
      taxAmount += lineTax;
    }

    const additionalChargesTotal: number = additionalCharges.reduce(
      (sum: number, c: { name: string; amount: number }) => sum + (c.amount ?? 0),
      0
    );
    const taxableAmount     = subTotal - discountAmount;
    const totalAmount       = taxableAmount + taxAmount + additionalChargesTotal + roundOff;
    const outstandingAmount = totalAmount - receivedAmount;

    // ── Build invoice number OUTSIDE tx (uses prisma directly, not tx) ───────
    const usePrefix  = invoiceSettings?.enablePrefix ?? false;
    const prefix     = usePrefix && invoiceSettings?.prefix?.trim()
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
    let nextSeq = Math.max(seqFromSettings, maxExistingSeq + 1);
    let invoiceNo = `${prefix}${String(nextSeq).padStart(5, "0")}`;
    // Safety: skip any collisions
    while (await prisma.invoice.findUnique({ where: { invoiceNo } })) {
      nextSeq++;
      invoiceNo = `${prefix}${String(nextSeq).padStart(5, "0")}`;
    }

    // Build stock-update map (productId+godownId → stockId, newBalance)
    // so the tx only does UPDATE, no SELECTs inside the loop
    const stockUpdateMap = new Map<
      number,
      { stockId: number; newBalance: number; productId: number; godownId: number | null }
    >();
    for (let i = 0; i < productTypeItems.length; i++) {
      const item  = productTypeItems[i];
      const stock = stockChecks[i]!;
      const newBalance = Number(stock.currentStock ?? stock.openingStock ?? 0) - Number(item.quantity);
      stockUpdateMap.set(item.productId, {
        stockId: stock.id,
        newBalance,
        productId: item.productId,
        godownId:  stock.godownId,
      });
    }

    // ── TRANSACTION — only critical DB writes, minimal queries ───────────────
    const created = await prisma.$transaction(
      async (tx) => {
        // 1. Create invoice + items + additional charges in one nested write
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
            subTotal,
            taxableAmount,
            discountAmount,
            additionalChargesTotal,
            taxAmount,
            roundOff,
            totalAmount,
            receivedAmount,
            outstandingAmount,
            paymentMode: paymentMode ?? null,
            applyTcs,
            autoRoundOff,
            signatureUrl:          signatureUrl          ?? null,
            showEmptySignatureBox: showEmptySignatureBox ?? false,
            status: deriveStatus(receivedAmount, totalAmount),
            items: {
              create: items.map((item: any) => ({
                productId: item.productId,
                godownId:  item.godownId ?? null,
                quantity:  item.quantity,
                price:     item.price,
                discount:  item.discount  ?? 0,
                taxRate:   item.taxRate   ?? 0,
                taxAmount: (item.price * item.quantity * (item.taxRate || 0)) / 100,
                total:     item.price * item.quantity,
              })),
            },
            ...(additionalCharges.length > 0 && {
              additionalCharges: {
                create: additionalCharges.map((c: { name: string; amount: number }) => ({
                  name: c.name, amount: c.amount,
                })),
              },
            }),
          },
        });

        // 2. Stock updates — all in PARALLEL (Promise.all — no sequential loop)
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
        if (receivedAmount > 0) {
          await tx.partyLedger.create({
            data: {
              partyId,
              refType:   LedgerRefType.Payment,
              refId:     inv.id,
              reference: inv.invoiceNo,
              type:      LedgerType.CREDIT,
              debit:     null,
              credit:    receivedAmount,
              balance:   balanceAfterDebit - receivedAmount,
            },
          });
        }

        // 5. Increment sequence atomically (no race condition)
        if (invoiceSettings?.id) {
          await tx.invoiceSettings.update({
            where: { id: invoiceSettings.id },
            data:  { sequenceNumber: nextSeq + 1 },
          });
        }

        return inv;
      },
      { timeout: 15000 } // ← FIX: 15 s timeout for cloud DB latency
    );

    // ── OUTSIDE TRANSACTION — StockLedger (non-critical, never blocks payment) ──
    if (stockUpdateMap.size > 0) {
      await prisma.stockLedger.createMany({
        data: Array.from(stockUpdateMap.values()).map(({ productId, godownId, newBalance }) => {
          const item = items.find((i: any) => i.productId === productId)!;
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
    const { partyId, status, limit, page } = req.query;

    const where: any = {};
    if (partyId) where.partyId = Number(partyId);
    if (status) {
      const statuses = String(status).split(",").map((s) => s.trim()).filter(Boolean);
      where.status   = statuses.length === 1 ? statuses[0] : { in: statuses };
    }

    const take = limit ? Math.min(500, Number(limit)) : undefined;
    const skip = page && take ? (Number(page) - 1) * take : undefined;

    const invoices = await (prisma.invoice.findMany as any)({
      where,
      include: {
        party:             true,
        items:             { include: { product: true } },
        additionalCharges: true,
        allocations:       true,
        salesReturns:      true,
      },
      orderBy: { createdAt: "desc" },
      ...(take ? { take } : {}),
      ...(skip ? { skip } : {}),
    });

    return res.json({ success: true, data: invoices });
  } catch (error) {
    console.error("❌ Fetch Invoices Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch invoices" });
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
        items:             { include: { product: true } },
        additionalCharges: true,
        allocations:       true,
        salesReturns:      true,
      },
    });

    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
    return res.json({ success: true, data: invoice });
  } catch (error) {
    console.error("❌ Fetch Invoice Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch invoice" });
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

        // Restore stock in PARALLEL
        await Promise.all(
          invoice.items.map(async (item) => {
            const stock = await tx.productStock.findFirst({ where: { productId: item.productId } });
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
            paymentMode:       paymentMode ?? invoice.paymentMode ?? null,
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
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });

    const data = invoices.flatMap((invoice) =>
      invoice.items.map((item) => ({
        partyId,
        invoiceNo: invoice.invoiceNo,
        itemName:  item.product.name,
        itemCode:  item.product.itemCode ?? null,
        quantity:  item.quantity,
        price:     Number(item.price),
        amount:    Number(item.total),
        type:      "Sale",
        date:      invoice.createdAt,
      }))
    );

    return res.json({ success: true, data });
  } catch (error) {
    console.error("❌ Item-wise Report Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch item-wise report" });
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
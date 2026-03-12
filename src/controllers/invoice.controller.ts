import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { InvoiceStatus, LedgerRefType, LedgerType, StockRefType } from "@prisma/client";
import { getLastPartyBalanceTx } from "../services/ledger.service";
import { writeStockLedger, reverseStockLedger } from "../services/stockLedger.service";


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
    totalAmount:            payloadTotal,
    taxAmount:              payloadTax,
    tcsAmount:              payloadTcs   = 0,
    outstandingAmount:      payloadOutstanding,
    additionalChargesTotal: payloadChargesTotal,
  } = req.body;

  if (!partyId || !items || items.length === 0) {
    return res.status(400).json({ success: false, message: "partyId and items are required" });
  }

  try {
    const invoice = await prisma.$transaction(async (tx) => {

      // ── 1. Validate products & accumulate totals ──────────
      let subTotal  = 0;
      let taxAmount = 0;

      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new Error(`Product not found (ID: ${item.productId})`);

        if (product.itemType === "Product") {
          const stock = item.godownId
            ? await tx.productStock.findUnique({
                where: { productId_godownId: { productId: item.productId, godownId: item.godownId } },
              })
            : await tx.productStock.findFirst({ where: { productId: item.productId } });

          // ✅ FIX: use currentStock (live balance) not openingStock (original entry only)
          const availableQty = stock ? (stock.currentStock ?? stock.openingStock) : 0;
          if (!stock || availableQty < item.quantity) {
            throw new Error(
              `Insufficient stock for "${product.name}" (available: ${availableQty}, requested: ${item.quantity})`
            );
          }
        }

        const lineBase    = (item.price    ?? 0) * (item.quantity ?? 0);
        const lineDisc    = item.discount  ?? 0;
        const lineTaxable = lineBase - lineDisc;
        subTotal  += lineTaxable;
        taxAmount += lineTaxable * ((item.taxRate ?? 0) / 100);
      }

      // ── 2. Totals ─────────────────────────────────────────
      const additionalChargesTotal: number = payloadChargesTotal
        ?? additionalCharges.reduce(
             (sum: number, c: { name: string; amount: number }) => sum + (c.amount ?? 0), 0
           );

      const taxableAmount   = subTotal + additionalChargesTotal - discountAmount;
      const taxAmount_final = payloadTax ?? taxAmount;
      const tcsAmount_final = payloadTcs ?? 0;
      const totalAmount     = payloadTotal
        ?? Math.round((taxableAmount + taxAmount_final + tcsAmount_final + roundOff) * 100) / 100;
      const outstandingAmount = payloadOutstanding
        ?? Math.max(0, Math.round((totalAmount - receivedAmount) * 100) / 100);

      // ── 3. Invoice number ─────────────────────────────────
      const settings  = await tx.invoiceSettings.findFirst({ orderBy: { id: "asc" } });
      const usePrefix = settings?.enablePrefix ?? false;
const prefix = usePrefix && settings?.prefix ? settings.prefix : "INV-";      const allNos    = await tx.invoice.findMany({ select: { invoiceNo: true } });
      let maxSeq      = (settings?.sequenceNumber ?? 1) - 1;
      for (const inv of allNos) {
        if (!inv.invoiceNo.startsWith(prefix)) continue;
        const m = inv.invoiceNo.slice(prefix.length).match(/^(\d+)$/);
        if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
      }
      let nextSeq   = maxSeq + 1;
      let invoiceNo = `${prefix}${String(nextSeq).padStart(5, "0")}`;
      while (await tx.invoice.findUnique({ where: { invoiceNo } })) {
        nextSeq++;
        invoiceNo = `${prefix}${String(nextSeq).padStart(5, "0")}`;
      }
      if (settings) {
        await tx.invoiceSettings.update({
          where: { id: settings.id },
          data:  { sequenceNumber: nextSeq + 1 },
        });
      }

      // ── 4. Persist invoice ────────────────────────────────
      const created = await (tx.invoice.create as any)({
        data: {
          invoiceNo,
          partyId,
          branchCode:      branchCode     ?? null,
          invoiceDate:     invoiceDate    ? new Date(invoiceDate) : new Date(),
          dueDate:         dueDate        ? new Date(dueDate)     : null,
          ewayBillNo:      ewayBillNo     ?? null,
          challanNo:       challanNo      ?? null,
          financedBy:      financedBy     ?? null,
          salesman:        salesman       ?? null,
          emailId:         emailId        ?? null,
          warrantyPeriod:  warrantyPeriod ?? null,
          notes:           notes          ?? null,
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
          paymentMode:  paymentMode ?? null,
          applyTcs,
          autoRoundOff,
          status: deriveStatus(receivedAmount, totalAmount),
          items: {
            create: items.map((item: any) => {
              const lineBase    = (item.price    ?? 0) * (item.quantity ?? 0);
              const lineDisc    = item.discount  ?? 0;
              const lineTaxable = lineBase - lineDisc;
              const lineTax     = lineTaxable * ((item.taxRate ?? 0) / 100);
              return {
                productId: item.productId,
                quantity:  item.quantity,
                price:     item.price,
                discount:  lineDisc,
                taxRate:   item.taxRate  ?? 0,
                taxAmount: lineTax,
                total:     lineTaxable,
              };
            }),
          },
          ...(additionalCharges.length > 0 && {
            additionalCharges: {
              create: additionalCharges.map((c: { name: string; amount: number }) => ({
                name:   c.name,
                amount: c.amount,
              })),
            },
          }),
        },
      });

      // ── 5. STOCK OUT — deduct stock + write StockLedger ───
      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (product?.itemType !== "Product") continue;

        await writeStockLedger({
          tx,
          productId:   item.productId,
          godownId:    item.godownId ?? null,
          refType:     StockRefType.SALE,
          refId:       created.id,
          quantityOut: item.quantity,
          remarks:     `Sale — ${created.invoiceNo}`,
          date:        invoiceDate ? new Date(invoiceDate) : new Date(),
        });
      }

      // ── 6. Party Ledger DEBIT ─────────────────────────────
      const balanceAfterDebit = (await getLastPartyBalanceTx(tx, partyId)) + totalAmount;
      await tx.partyLedger.create({
        data: {
          partyId,
          refType:   LedgerRefType.Invoice,
          refId:     created.id,
          reference: created.invoiceNo,
          type:      LedgerType.DEBIT,
          debit:     totalAmount,
          credit:    null,
          balance:   balanceAfterDebit,
        },
      });

      // ── 7. If upfront payment — CREDIT immediately ────────
      if (receivedAmount > 0) {
        await tx.partyLedger.create({
          data: {
            partyId,
            refType:   LedgerRefType.Payment,
            refId:     created.id,
            reference: created.invoiceNo,
            type:      LedgerType.CREDIT,
            debit:     null,
            credit:    receivedAmount,
            balance:   balanceAfterDebit - receivedAmount,
          },
        });
      }

      return created;
    });

    return res.status(201).json({ success: true, message: "Invoice created successfully", data: invoice });
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
    const {
      status,
      from,
      to,
      search,
      page      = "1",
      limit     = "50",
      sortField = "invoiceDate",
      sortDir   = "desc",
    } = req.query as Record<string, string>;

    // ── WHERE clause ─────────────────────────────────────
    const where: any = {};

    // Status filter — frontend sends "PAID", "OPEN,PARTIAL", or "CANCELLED"
    if (status) {
      const statuses = status.split(",").map(s => s.trim()).filter(Boolean);
      where.status = statuses.length === 1
        ? statuses[0]
        : { in: statuses };
    }

    // Date range — filter on invoiceDate
    if (from || to) {
      where.invoiceDate = {};
      if (from) where.invoiceDate.gte = new Date(from);
      if (to)   where.invoiceDate.lte = new Date(to + "T23:59:59.999Z");
    }

    // Search — invoice number OR party name (case-insensitive)
    if (search && search.trim()) {
      where.OR = [
        { invoiceNo: { contains: search.trim(), mode: "insensitive" } },
        { party: { name: { contains: search.trim(), mode: "insensitive" } } },
      ];
    }

    // ── Pagination ────────────────────────────────────────
    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip     = (pageNum - 1) * limitNum;

    // ── Sort ──────────────────────────────────────────────
    const orderByField = sortField === "amount" ? "totalAmount" : "invoiceDate";
    const orderByDir   = sortDir === "asc" ? "asc" : "desc";

    // ── Query ─────────────────────────────────────────────
    const [invoices, total] = await Promise.all([
      (prisma.invoice.findMany as any)({
        where,
        include: {
          party:             true,
          items:             { include: { product: true } },
          additionalCharges: true,
          allocations:       true,
          salesReturns:      true,
        },
        orderBy: { [orderByField]: orderByDir },
        skip,
        take: limitNum,
      }),
      prisma.invoice.count({ where }),
    ]);

    return res.json({ success: true, data: invoices, total, page: pageNum });
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
      where:   { id },
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
   UPDATE INVOICE  (meta fields only)
   PUT /api/invoices/:id
═══════════════════════════════════════════════════════════ */
export const updateInvoice = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid invoice ID" });

  const {
    dueDate, ewayBillNo, challanNo, financedBy,
    salesman, emailId, warrantyPeriod, notes, termsConditions,
  } = req.body;

  try {
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: "Invoice not found" });
    if (existing.status === InvoiceStatus.CANCELLED) {
      return res.status(400).json({ success: false, message: "Cannot update a cancelled invoice" });
    }

    const updated = await (prisma.invoice.update as any)({
      where: { id },
      data: {
        dueDate:         dueDate        ? new Date(dueDate) : undefined,
        ewayBillNo:      ewayBillNo     ?? undefined,
        challanNo:       challanNo      ?? undefined,
        financedBy:      financedBy     ?? undefined,
        salesman:        salesman       ?? undefined,
        emailId:         emailId        ?? undefined,
        warrantyPeriod:  warrantyPeriod ?? undefined,
        notes:           notes          ?? undefined,
        termsConditions: termsConditions ?? undefined,
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
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id }, include: { items: true } });

      if (!invoice)                                   throw new Error("Invoice not found");
      if (invoice.status === InvoiceStatus.CANCELLED) throw new Error("Invoice is already cancelled");

      // ✅ Reverse stock — sold items come back IN
      await reverseStockLedger(tx, StockRefType.SALE, id);

      // Party ledger CREDIT reversal
      const newBalance = (await getLastPartyBalanceTx(tx, invoice.partyId)) - invoice.totalAmount.toNumber();
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

      return tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.CANCELLED } });
    });

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

  const { amount, paymentMode, discount = 0 } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "Invalid payment amount" });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice: any = await tx.invoice.findUnique({ where: { id } });

      if (!invoice)                                   throw new Error("Invoice not found");
      if (invoice.status === InvoiceStatus.CANCELLED) throw new Error("Cannot pay a cancelled invoice");
      if (invoice.status === InvoiceStatus.PAID)      throw new Error("Invoice is already fully paid");

      const currentOutstanding = Number(invoice.outstandingAmount ?? 0);
      const totalSettlement    = amount + Number(discount ?? 0);
      if (totalSettlement > currentOutstanding + 0.01) {
        throw new Error(`Payment + discount (${totalSettlement}) exceeds outstanding (${currentOutstanding})`);
      }

      const newReceived    = Number(invoice.receivedAmount ?? 0) + amount;
      const newOutstanding = Math.max(0, Math.round((currentOutstanding - totalSettlement) * 100) / 100);
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
    });

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
    const [totalAgg, statusCounts] = await Promise.all([
      prisma.invoice.aggregate({
        where: { status: { not: InvoiceStatus.CANCELLED } },
        _sum:  { totalAmount: true },
      }),
      prisma.invoice.groupBy({ by: ["status"], _count: { id: true } }),
    ]);

    const extraAgg: any = await (prisma.invoice.aggregate as any)({
      where: { status: { not: InvoiceStatus.CANCELLED } },
      _sum:  { receivedAmount: true, outstandingAmount: true },
    });

    const cancelledAgg = await prisma.invoice.aggregate({
      where: { status: InvoiceStatus.CANCELLED },
      _sum:  { totalAmount: true },
    });

    const statusMap: Record<string, number> = {};
    statusCounts.forEach((c) => { statusMap[c.status] = c._count.id; });

    return res.json({
      success: true,
      data: {
        totalInvoiced:    totalAgg._sum?.totalAmount         ?? 0,
        totalReceived:    extraAgg?._sum?.receivedAmount     ?? 0,
        totalOutstanding: extraAgg?._sum?.outstandingAmount  ?? 0,
        totalCancelled:   cancelledAgg._sum?.totalAmount     ?? 0,
        openCount:        statusMap[InvoiceStatus.OPEN]      ?? 0,
        partialCount:     statusMap[InvoiceStatus.PARTIAL]   ?? 0,
        paidCount:        statusMap[InvoiceStatus.PAID]      ?? 0,
        cancelledCount:   statusMap[InvoiceStatus.CANCELLED] ?? 0,
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
  if (isNaN(partyId)) return res.status(400).json({ success: false, message: "Invalid party ID" });
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
    await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id } });
      if (!invoice) throw new Error("Invoice not found");

      // ✅ Reverse stock movements — items come back IN
      await reverseStockLedger(tx, StockRefType.SALE, id);

      await tx.partyLedger.deleteMany({ where: { refType: "Invoice" as any, refId: id } });
      await (tx as any).paymentAllocation?.deleteMany?.({ where: { invoiceId: id } }).catch(() => {});
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.delete({ where: { id } });
    });

    return res.json({ success: true, message: "Invoice deleted successfully" });
  } catch (error: any) {
    console.error("❌ Delete Invoice Error:", error);
    if (error.message === "Invoice not found")
      return res.status(404).json({ success: false, message: "Invoice not found" });
    return res.status(500).json({ success: false, message: "Failed to delete invoice" });
  }
};
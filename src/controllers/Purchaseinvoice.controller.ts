/**
 * Purchaseinvoice.controller.ts
 * ─────────────────────────────────────────────────────────────
 * Purchase Invoice → stock IN on create.
 * Cancel / Delete  → stock reversed OUT via reverseStockLedger.
 *
 * Route file already exists:  Purchaseinvoice.routes.ts
 * Register in index.ts:
 *   import purchaseInvoiceRoutes from "./Purchaseinvoice.routes";
 *   router.use("/purchase-invoices", purchaseInvoiceRoutes);   ← already done per index.ts
 */

import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { PurchaseInvoiceStatus, LedgerRefType, LedgerType, StockRefType } from "@prisma/client";
import { writeStockLedger, reverseStockLedger } from "../services/stockLedger.service";

const deriveStatus = (paid: number, total: number): PurchaseInvoiceStatus => {
  if (paid <= 0)     return PurchaseInvoiceStatus.OPEN;
  if (paid >= total) return PurchaseInvoiceStatus.PAID;
  return PurchaseInvoiceStatus.PARTIAL;
};

/* ═══════════════════════════════════════════════════════════
   CREATE PURCHASE INVOICE
   POST /api/purchase-invoices
═══════════════════════════════════════════════════════════ */
export const createPurchaseInvoice = async (req: Request, res: Response) => {
  try {
    const {
      partyId,
      branchCode,
      invoiceDate,
      dueDate,
      originalInvNo,
      ewayBillNo, challanNo, financedBy, salesman, emailId, warrantyPeriod,
      notes, termsConditions,
      items             = [],
      additionalCharges = [],
      discountAmount    = 0,
      taxAmount         = 0,
      roundOff          = 0,
      totalAmount:      payloadTotal,
      amountPaid        = 0,
      paymentMode,
      applyTcs          = false,
      applyTds          = false,
      autoRoundOff      = false,
    } = req.body;

    if (!partyId || !items.length) {
      return res.status(400).json({ success: false, message: "partyId and items are required" });
    }

    const result = await prisma.$transaction(async (tx) => {

      // ── 1. Generate purchase invoice number ───────────────
      const allNos = await tx.purchaseInvoice.findMany({ select: { purchaseInvNo: true } });
      let maxSeq   = 0;
      for (const inv of allNos) {
        const m = inv.purchaseInvNo?.match(/(\d+)$/);
        if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
      }
      let nextSeq       = maxSeq + 1;
      let purchaseInvNo = `PINV-${String(nextSeq).padStart(5, "0")}`;
      while (await tx.purchaseInvoice.findUnique({ where: { purchaseInvNo } })) {
        nextSeq++;
        purchaseInvNo = `PINV-${String(nextSeq).padStart(5, "0")}`;
      }

      // ── 2. Compute sub-total ──────────────────────────────
      let subTotal = 0;
      for (const item of items) {
        const lineBase = Number(item.price) * Number(item.quantity);
        const lineDisc = Number(item.discount ?? 0);
        subTotal += lineBase - lineDisc;
      }
      const additionalChargesTotal = additionalCharges.reduce(
        (s: number, c: any) => s + Number(c.amount ?? 0), 0
      );
      const total = payloadTotal
        ?? Math.round((subTotal + Number(taxAmount) + additionalChargesTotal + Number(roundOff)) * 100) / 100;
      const balance = Math.max(0, total - Number(amountPaid));

      // ── 3. Create purchase invoice ────────────────────────
      const invoice = await tx.purchaseInvoice.create({
        data: {
          purchaseInvNo,
          partyId:         Number(partyId),
          branchCode:      branchCode      ?? null,
          invoiceDate:     invoiceDate     ? new Date(invoiceDate) : new Date(),
          dueDate:         dueDate         ? new Date(dueDate)    : null,
          originalInvNo:   originalInvNo   ?? null,
          ewayBillNo:      ewayBillNo      ?? null,
          challanNo:       challanNo       ?? null,
          financedBy:      financedBy      ?? null,
          salesman:        salesman        ?? null,
          emailId:         emailId         ?? null,
          warrantyPeriod:  warrantyPeriod  ?? null,
          notes:           notes           ?? null,
          termsConditions: termsConditions ?? null,
          subTotal,
          taxAmount:              Number(taxAmount),
          discountAmount:         Number(discountAmount),
          additionalChargesTotal,
          roundOff:               Number(roundOff),
          totalAmount:            total,
          amountPaid:             Number(amountPaid),
          balanceAmount:          balance,
          paymentMode:            paymentMode ?? null,
          applyTcs, applyTds, autoRoundOff,
          status: deriveStatus(Number(amountPaid), total),
          items: {
            create: items.map((item: any) => ({
              productId: Number(item.productId),
              hsnSac:    item.hsnSac   ?? null,
              quantity:  Number(item.quantity),
              price:     Number(item.price),
              discount:  Number(item.discount  ?? 0),
              taxRate:   Number(item.taxRate   ?? 0),
              taxAmount: Number(item.taxAmount ?? 0),
              total:     (Number(item.price) * Number(item.quantity)) - Number(item.discount ?? 0),
              godownId:  item.godownId ? Number(item.godownId) : null,
            })),
          },
          ...(additionalCharges.length > 0 && {
            additionalCharges: {
              create: additionalCharges.map((c: any) => ({ name: c.name, amount: Number(c.amount) })),
            },
          }),
        },
      });

      // ── 4. STOCK IN — increase stock + write StockLedger ──
      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: Number(item.productId) } });
        if (product?.itemType !== "Product") continue;

        await writeStockLedger({
          tx,
          productId:  Number(item.productId),
          godownId:   item.godownId ? Number(item.godownId) : null,
          refType:    StockRefType.PURCHASE,
          refId:      invoice.id,
          quantityIn: Number(item.quantity),
          remarks:    `Purchase — ${purchaseInvNo}`,
          date:       invoiceDate ? new Date(invoiceDate) : new Date(),
        });
      }

      return invoice;
    });

    return res.status(201).json({ success: true, message: "Purchase invoice created", data: result });
  } catch (error: any) {
    console.error("❌ createPurchaseInvoice:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   GET ALL PURCHASE INVOICES
   GET /api/purchase-invoices
═══════════════════════════════════════════════════════════ */
export const getPurchaseInvoices = async (req: Request, res: Response) => {
  try {
    const { search, status, from, to, page = 1, limit = 20 } = req.query;
    const where: any = {};

    if (search) where.OR = [
      { purchaseInvNo: { contains: String(search), mode: "insensitive" } },
      { party: { partyName: { contains: String(search), mode: "insensitive" } } },
    ];
    if (status) where.status = String(status).toUpperCase();
    if (from || to) {
      where.invoiceDate = {};
      if (from) where.invoiceDate.gte = new Date(String(from));
      if (to)   where.invoiceDate.lte = new Date(String(to) + "T23:59:59");
    }

    const [invoices, total] = await Promise.all([
      prisma.purchaseInvoice.findMany({
        where,
        include: {
          party:             true,
          items:             { include: { product: true } },
          additionalCharges: true,
        },
        orderBy: { createdAt: "desc" },
        skip:    (Number(page) - 1) * Number(limit),
        take:    Number(limit),
      }),
      prisma.purchaseInvoice.count({ where }),
    ]);

    return res.json({
      success: true,
      data:    invoices,
      total,
      page:    Number(page),
      pages:   Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    console.error("❌ getPurchaseInvoices:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch purchase invoices" });
  }
};

/* ═══════════════════════════════════════════════════════════
   GET SINGLE PURCHASE INVOICE
   GET /api/purchase-invoices/:id
═══════════════════════════════════════════════════════════ */
export const getPurchaseInvoiceById = async (req: Request, res: Response) => {
  try {
    const id      = Number(req.params.id);
    const invoice = await prisma.purchaseInvoice.findUnique({
      where:   { id },
      include: {
        party:             true,
        items:             { include: { product: true } },
        additionalCharges: true,
      },
    });
    if (!invoice) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: invoice });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch purchase invoice" });
  }
};

/* ═══════════════════════════════════════════════════════════
   UPDATE PURCHASE INVOICE  (meta only)
   PUT /api/purchase-invoices/:id
═══════════════════════════════════════════════════════════ */
export const updatePurchaseInvoice = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const {
      dueDate, ewayBillNo, challanNo, financedBy,
      salesman, emailId, warrantyPeriod, notes, termsConditions,
    } = req.body;

    const existing = await prisma.purchaseInvoice.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: "Purchase invoice not found" });
    if (existing.status === PurchaseInvoiceStatus.CANCELLED) {
      return res.status(400).json({ success: false, message: "Cannot update a cancelled invoice" });
    }

    const updated = await prisma.purchaseInvoice.update({
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

    return res.json({ success: true, message: "Purchase invoice updated", data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   CANCEL PURCHASE INVOICE  (reverses stock)
   PATCH /api/purchase-invoices/:id/cancel
═══════════════════════════════════════════════════════════ */
export const cancelPurchaseInvoice = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.purchaseInvoice.findUnique({ where: { id } });
      if (!invoice) throw new Error("Purchase invoice not found");
      if (invoice.status === PurchaseInvoiceStatus.CANCELLED) throw new Error("Already cancelled");

      // ✅ Reverse stock — purchased items go back OUT
      await reverseStockLedger(tx, StockRefType.PURCHASE, id);

      await tx.purchaseInvoice.update({
        where: { id },
        data:  { status: PurchaseInvoiceStatus.CANCELLED },
      });
    });

    return res.json({ success: true, message: "Purchase invoice cancelled" });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   DELETE PURCHASE INVOICE  (reverses stock)
   DELETE /api/purchase-invoices/:id
═══════════════════════════════════════════════════════════ */
export const deletePurchaseInvoice = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.purchaseInvoice.findUnique({
        where:   { id },
        include: { items: true },
      });
      if (!invoice) throw new Error("Purchase invoice not found");

      // ✅ Reverse all stock movements for this purchase
      await reverseStockLedger(tx, StockRefType.PURCHASE, id);

      await tx.purchaseInvoiceItem.deleteMany({ where: { purchaseInvoiceId: id } });
      await tx.purchaseInvoiceAdditionalCharge.deleteMany({ where: { purchaseInvoiceId: id } });
      await tx.purchaseInvoice.delete({ where: { id } });
    });

    return res.json({ success: true, message: "Purchase invoice deleted" });
  } catch (error: any) {
    console.error("❌ deletePurchaseInvoice:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   RECORD PAYMENT ON PURCHASE INVOICE
   PATCH /api/purchase-invoices/:id/payment
═══════════════════════════════════════════════════════════ */
export const recordPurchaseInvoicePayment = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { amount, paymentMode } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid payment amount" });
    }

    const invoice = await prisma.purchaseInvoice.findUnique({ where: { id } });
    if (!invoice) return res.status(404).json({ success: false, message: "Purchase invoice not found" });
    if (invoice.status === PurchaseInvoiceStatus.CANCELLED) {
      return res.status(400).json({ success: false, message: "Cannot pay a cancelled invoice" });
    }

    const currentBalance = Number(invoice.balanceAmount ?? 0);
    if (amount > currentBalance + 0.01) {
      return res.status(400).json({
        success: false,
        message: `Payment (${amount}) exceeds outstanding balance (${currentBalance})`,
      });
    }

    const newPaid    = Number(invoice.amountPaid ?? 0) + amount;
    const newBalance = Math.max(0, currentBalance - amount);
    const newStatus  = deriveStatus(newPaid, Number(invoice.totalAmount));

    const updated = await prisma.purchaseInvoice.update({
      where: { id },
      data: {
        amountPaid:    newPaid,
        balanceAmount: newBalance,
        paymentMode:   paymentMode ?? invoice.paymentMode ?? null,
        status:        newStatus,
      },
    });

    return res.json({ success: true, message: "Payment recorded", data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   PURCHASE INVOICE SUMMARY
   GET /api/purchase-invoices/summary
═══════════════════════════════════════════════════════════ */
export const getPurchaseInvoiceSummary = async (req: Request, res: Response) => {
  try {
    const [totalAgg, statusCounts] = await Promise.all([
      prisma.purchaseInvoice.aggregate({
        where: { status: { not: PurchaseInvoiceStatus.CANCELLED } },
        _sum:  { totalAmount: true, amountPaid: true, balanceAmount: true },
      }),
      prisma.purchaseInvoice.groupBy({ by: ["status"], _count: { id: true } }),
    ]);

    const statusMap: Record<string, number> = {};
    statusCounts.forEach((c) => { statusMap[c.status] = c._count.id; });

    return res.json({
      success: true,
      data: {
        totalPurchased:   totalAgg._sum?.totalAmount   ?? 0,
        totalPaid:        totalAgg._sum?.amountPaid    ?? 0,
        totalOutstanding: totalAgg._sum?.balanceAmount ?? 0,
        openCount:        statusMap[PurchaseInvoiceStatus.OPEN]      ?? 0,
        partialCount:     statusMap[PurchaseInvoiceStatus.PARTIAL]   ?? 0,
        paidCount:        statusMap[PurchaseInvoiceStatus.PAID]      ?? 0,
        cancelledCount:   statusMap[PurchaseInvoiceStatus.CANCELLED] ?? 0,
      },
    });
  } catch (error) {
    console.error("❌ getPurchaseInvoiceSummary:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch summary" });
  }
};
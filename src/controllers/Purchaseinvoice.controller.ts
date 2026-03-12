import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { LedgerRefType, LedgerType, PurchaseInvoiceStatus } from "@prisma/client";
import { getLastPartyBalanceTx } from "../services/ledger.service";

/* ═══════════════════════════════════════════════════════════════
   SHARED HELPER — recalculate totals from items array
   Used by both CREATE and UPDATE so maths never diverges
═══════════════════════════════════════════════════════════════ */
function calcTotals(
  items: any[],
  additionalCharges: any[],
  discountAmount: number,
  roundOff: number
) {
  let subTotal  = 0;
  let taxAmount = 0;

  for (const item of items) {
    const base     = Number(item.price)    * Number(item.quantity);
    const discount = Number(item.discount  ?? 0);
    const taxable  = base - discount;
    const tax      = taxable * (Number(item.taxRate ?? 0) / 100);
    subTotal  += taxable;
    taxAmount += tax;
  }

  const additionalChargesTotal = additionalCharges.reduce(
    (sum: number, c: any) => sum + Number(c.amount ?? 0),
    0
  );

  const taxableAmount = subTotal + additionalChargesTotal - Number(discountAmount);
  const totalAmount   = Number((taxableAmount + taxAmount + Number(roundOff)).toFixed(2));

  return { subTotal, taxAmount, additionalChargesTotal, taxableAmount, totalAmount };
}

function deriveStatus(amountPaid: number, totalAmount: number): PurchaseInvoiceStatus {
  if (amountPaid <= 0)            return PurchaseInvoiceStatus.OPEN;
  if (amountPaid >= totalAmount)  return PurchaseInvoiceStatus.PAID;
  return PurchaseInvoiceStatus.PARTIAL;
}


/* ═══════════════════════════════════════════════════════════════
   CREATE  —  POST /api/purchase-invoices
   Frontend sends: { partyId, invoiceDate, dueDate?, paymentMode,
     amountPaid, discountAmount, roundOff, notes?,
     items:[{ productId, hsnSac?, quantity, price, discount, taxRate }],
     additionalCharges:[{ name, amount }] }
═══════════════════════════════════════════════════════════════ */
export const createPurchaseInvoice = async (req: Request, res: Response) => {
  try {
    const {
      partyId,
      branchCode,
      originalInvNo,
      invoiceDate,
      dueDate,
      items             = [],
      additionalCharges = [],
      discountAmount    = 0,
      roundOff          = 0,
      paymentMode,
      amountPaid        = 0,
      notes,
      termsConditions,
      ewayBillNo,
      challanNo,
      financedBy,
      salesman,
      emailId,
      warrantyPeriod,
      applyTcs          = false,
      applyTds          = false,
      autoRoundOff      = false,
    } = req.body;

    if (!partyId)      return res.status(400).json({ success: false, message: "Party is required" });
    if (!items.length) return res.status(400).json({ success: false, message: "Invoice must contain at least one item" });

    const result = await prisma.$transaction(async (tx) => {

      /* ── totals ── */
      const { subTotal, taxAmount, additionalChargesTotal, taxableAmount, totalAmount } =
        calcTotals(items, additionalCharges, Number(discountAmount), Number(roundOff));

      const paid          = Number(amountPaid);
      const balanceAmount = Math.max(0, totalAmount - paid);

      /* ── unique invoice number ── */
      const last = await tx.purchaseInvoice.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
      let seq = (last?.id ?? 0) + 1;
      let purchaseInvNo = `PI-${String(seq).padStart(5, "0")}`;
      while (await tx.purchaseInvoice.findUnique({ where: { purchaseInvNo } })) {
        seq++;
        purchaseInvNo = `PI-${String(seq).padStart(5, "0")}`;
      }

      /* ── invoice row ── */
      const invoice = await tx.purchaseInvoice.create({
        data: {
          purchaseInvNo,
          originalInvNo:          originalInvNo   ?? null,
          partyId:                Number(partyId),
          branchCode:             branchCode       ?? null,
          invoiceDate:            invoiceDate ? new Date(invoiceDate) : new Date(),
          dueDate:                dueDate     ? new Date(dueDate)     : null,
          ewayBillNo:             ewayBillNo   ?? null,
          challanNo:              challanNo    ?? null,
          financedBy:             financedBy   ?? null,
          salesman:               salesman     ?? null,
          emailId:                emailId      ?? null,
          warrantyPeriod:         warrantyPeriod ?? null,
          notes:                  notes        ?? null,
          termsConditions:        termsConditions ?? null,
          subTotal,
          taxableAmount,
          discountAmount:         Number(discountAmount),
          additionalChargesTotal,
          taxAmount,
          roundOff:               Number(roundOff),
          totalAmount,
          amountPaid:             paid,
          balanceAmount,
          paymentMode:            paymentMode  ?? null,
          applyTcs,
          applyTds,
          autoRoundOff,
          status:                 deriveStatus(paid, totalAmount),
        },
      });

      /* ── items + stock ── */
      for (const item of items) {
        const base     = Number(item.price) * Number(item.quantity);
        const discount = Number(item.discount ?? 0);
        const taxable  = base - discount;
        const tax      = taxable * (Number(item.taxRate ?? 0) / 100);

        await tx.purchaseInvoiceItem.create({
          data: {
            purchaseInvoiceId: invoice.id,
            productId:         Number(item.productId),
            hsnSac:            item.hsnSac   ?? null,
            quantity:          Number(item.quantity),
            price:             Number(item.price),
            discount,
            taxRate:           Number(item.taxRate ?? 0),
            taxAmount:         tax,
            total:             taxable,
          },
        });

        await incrementStock(tx, Number(item.productId), Number(item.quantity), item.godownId);
      }

      /* ── additional charges ── */
      for (const charge of additionalCharges) {
        await tx.purchaseInvoiceAdditionalCharge.create({
          data: {
            purchaseInvoiceId: invoice.id,
            name:              charge.name ?? charge.label ?? "",
            amount:            Number(charge.amount ?? 0),
          },
        });
      }

      /* ── ledger: credit (amount owed to supplier) ── */
      const runningBalance = (await getLastPartyBalanceTx(tx, Number(partyId))) + totalAmount;

      await tx.partyLedger.create({
        data: {
          partyId:   Number(partyId),
          refType:   LedgerRefType.PurchaseInvoice,
          refId:     invoice.id,
          reference: purchaseInvNo,
          type:      LedgerType.CREDIT,
          debit:     null,
          credit:    totalAmount,
          balance:   runningBalance,
        },
      });

      /* ── ledger: debit (payment already made) ── */
      if (paid > 0) {
        await tx.partyLedger.create({
          data: {
            partyId:   Number(partyId),
            refType:   LedgerRefType.Payment,
            refId:     invoice.id,
            reference: purchaseInvNo,
            type:      LedgerType.DEBIT,
            debit:     paid,
            credit:    null,
            balance:   runningBalance - paid,
          },
        });
      }

      return invoice;
    });

    return res.status(201).json({ success: true, message: "Purchase invoice created successfully", data: result });

  } catch (error: any) {
    console.error("createPurchaseInvoice:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


/* ═══════════════════════════════════════════════════════════════
   GET ALL  —  GET /api/purchase-invoices
═══════════════════════════════════════════════════════════════ */
export const getPurchaseInvoices = async (_req: Request, res: Response) => {
  try {
    const invoices = await prisma.purchaseInvoice.findMany({
      include:  { party: true, items: true, additionalCharges: true },
      orderBy:  { invoiceDate: "desc" },
    });
    res.json({ success: true, data: invoices });
  } catch (error: any) {
    console.error("getPurchaseInvoices:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


/* ═══════════════════════════════════════════════════════════════
   GET BY ID  —  GET /api/purchase-invoices/:id
═══════════════════════════════════════════════════════════════ */
export const getPurchaseInvoiceById = async (req: Request, res: Response) => {
  try {
    const id      = Number(req.params.id);
    const invoice = await prisma.purchaseInvoice.findUnique({
      where:   { id },
      include: { party: true, items: true, additionalCharges: true },
    });

    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    res.json({ success: true, data: invoice });
  } catch (error: any) {
    console.error("getPurchaseInvoiceById:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


/* ═══════════════════════════════════════════════════════════════
   UPDATE  —  PUT /api/purchase-invoices/:id
   Same payload shape as CREATE — frontend reuses handleSave()
   Strategy: recalculate totals, reverse old stock, delete old
   items/charges, insert new ones, refresh ledger entry.
═══════════════════════════════════════════════════════════════ */
export const updatePurchaseInvoice = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const {
      partyId,
      invoiceDate,
      dueDate,
      items             = [],
      additionalCharges = [],
      discountAmount    = 0,
      roundOff          = 0,
      paymentMode,
      amountPaid        = 0,
      notes,
      ewayBillNo,
      challanNo,
      financedBy,
      salesman,
      emailId,
      warrantyPeriod,
      applyTcs          = false,
      applyTds          = false,
      autoRoundOff      = false,
    } = req.body;

    const existing = await prisma.purchaseInvoice.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: "Invoice not found" });

    const result = await prisma.$transaction(async (tx) => {

      /* ── recalculate ── */
      const { subTotal, taxAmount, additionalChargesTotal, taxableAmount, totalAmount } =
        calcTotals(items, additionalCharges, Number(discountAmount), Number(roundOff));

      const paid          = Number(amountPaid);
      const balanceAmount = Math.max(0, totalAmount - paid);

      /* ── update invoice scalars ── */
      const updated = await tx.purchaseInvoice.update({
        where: { id },
        data: {
          partyId:                Number(partyId),
          invoiceDate:            invoiceDate ? new Date(invoiceDate) : undefined,
          dueDate:                dueDate     ? new Date(dueDate)     : null,
          ewayBillNo:             ewayBillNo   ?? null,
          challanNo:              challanNo    ?? null,
          financedBy:             financedBy   ?? null,
          salesman:               salesman     ?? null,
          emailId:                emailId      ?? null,
          warrantyPeriod:         warrantyPeriod ?? null,
          notes:                  notes        ?? null,
          paymentMode:            paymentMode  ?? null,
          applyTcs,
          applyTds,
          autoRoundOff,
          subTotal,
          taxableAmount,
          discountAmount:         Number(discountAmount),
          additionalChargesTotal,
          taxAmount,
          roundOff:               Number(roundOff),
          totalAmount,
          amountPaid:             paid,
          balanceAmount,
          status:                 deriveStatus(paid, totalAmount),
        },
      });

      /* ── reverse stock for OLD items ── */
      const oldItems = await tx.purchaseInvoiceItem.findMany({ where: { purchaseInvoiceId: id } });
      for (const old of oldItems) {
        await decrementStock(tx, old.productId, Number(old.quantity));
      }

      /* ── wipe old items + charges ── */
      await tx.purchaseInvoiceItem.deleteMany({ where: { purchaseInvoiceId: id } });
      await tx.purchaseInvoiceAdditionalCharge.deleteMany({ where: { purchaseInvoiceId: id } });

      /* ── insert new items + add stock ── */
      for (const item of items) {
        const base     = Number(item.price) * Number(item.quantity);
        const discount = Number(item.discount ?? 0);
        const taxable  = base - discount;
        const tax      = taxable * (Number(item.taxRate ?? 0) / 100);

        await tx.purchaseInvoiceItem.create({
          data: {
            purchaseInvoiceId: id,
            productId:         Number(item.productId),
            hsnSac:            item.hsnSac ?? null,
            quantity:          Number(item.quantity),
            price:             Number(item.price),
            discount,
            taxRate:           Number(item.taxRate ?? 0),
            taxAmount:         tax,
            total:             taxable,
          },
        });

        await incrementStock(tx, Number(item.productId), Number(item.quantity), item.godownId);
      }

      /* ── insert new additional charges ── */
      for (const charge of additionalCharges) {
        await tx.purchaseInvoiceAdditionalCharge.create({
          data: {
            purchaseInvoiceId: id,
            name:              charge.name ?? charge.label ?? "",
            amount:            Number(charge.amount ?? 0),
          },
        });
      }

      /* ── refresh ledger: remove old PI entry, re-create ── */
      await tx.partyLedger.deleteMany({
        where: { refId: id, refType: LedgerRefType.PurchaseInvoice },
      });

      const runningBalance = (await getLastPartyBalanceTx(tx, Number(partyId))) + totalAmount;

      await tx.partyLedger.create({
        data: {
          partyId:   Number(partyId),
          refType:   LedgerRefType.PurchaseInvoice,
          refId:     id,
          reference: existing.purchaseInvNo,
          type:      LedgerType.CREDIT,
          debit:     null,
          credit:    totalAmount,
          balance:   runningBalance,
        },
      });

      if (paid > 0) {
        await tx.partyLedger.create({
          data: {
            partyId:   Number(partyId),
            refType:   LedgerRefType.Payment,
            refId:     id,
            reference: existing.purchaseInvNo,
            type:      LedgerType.DEBIT,
            debit:     paid,
            credit:    null,
            balance:   runningBalance - paid,
          },
        });
      }

      return updated;
    });

    return res.json({ success: true, message: "Purchase invoice updated successfully", data: result });

  } catch (error: any) {
    console.error("updatePurchaseInvoice:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


/* ═══════════════════════════════════════════════════════════════
   DELETE  —  DELETE /api/purchase-invoices/:id
   Frontend: deletePurchaseInvoice(inv.id)
═══════════════════════════════════════════════════════════════ */
export const deletePurchaseInvoice = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    await prisma.$transaction(async (tx) => {

      const invoice = await tx.purchaseInvoice.findUnique({
        where:   { id },
        include: { items: true },
      });

      if (!invoice) throw new Error("Invoice not found");

      /* reverse stock */
      for (const item of invoice.items) {
        await decrementStock(tx, item.productId, Number(item.quantity));
      }

      /* delete children first (in case no cascade set in schema) */
      await tx.purchaseInvoiceItem.deleteMany({ where: { purchaseInvoiceId: id } });
      await tx.purchaseInvoiceAdditionalCharge.deleteMany({ where: { purchaseInvoiceId: id } });
      await tx.partyLedger.deleteMany({ where: { refId: id, refType: LedgerRefType.PurchaseInvoice } });

      await tx.purchaseInvoice.delete({ where: { id } });
    });

    res.json({ success: true, message: "Invoice deleted and stock reversed" });

  } catch (error: any) {
    console.error("deletePurchaseInvoice:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


/* ═══════════════════════════════════════════════════════════════
   CANCEL  —  PATCH /api/purchase-invoices/:id/cancel
═══════════════════════════════════════════════════════════════ */
export const cancelPurchaseInvoice = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const result = await prisma.$transaction(async (tx) => {

      const invoice = await tx.purchaseInvoice.findUnique({
        where:   { id },
        include: { items: true },
      });

      if (!invoice) throw new Error("Invoice not found");
      if (invoice.status === PurchaseInvoiceStatus.CANCELLED) throw new Error("Invoice already cancelled");

      for (const item of invoice.items) {
        await decrementStock(tx, item.productId, Number(item.quantity));
      }

      return tx.purchaseInvoice.update({
        where: { id },
        data:  { status: PurchaseInvoiceStatus.CANCELLED },
      });
    });

    res.json({ success: true, data: result });

  } catch (error: any) {
    console.error("cancelPurchaseInvoice:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


/* ═══════════════════════════════════════════════════════════════
   RECORD PAYMENT  —  PATCH /api/purchase-invoices/:id/payment
   Body: { amount: number }
═══════════════════════════════════════════════════════════════ */
export const recordPurchaseInvoicePayment = async (req: Request, res: Response) => {
  try {
    const id     = Number(req.params.id);
    const amount = Number(req.body.amount ?? 0);

    if (amount <= 0) return res.status(400).json({ success: false, message: "Amount must be positive" });

    const invoice = await prisma.purchaseInvoice.findUnique({ where: { id } });
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    const newPaid    = Number(invoice.amountPaid) + amount;
    const newBalance = Math.max(0, Number(invoice.totalAmount) - newPaid);

    const updated = await prisma.$transaction(async (tx) => {

      const inv = await tx.purchaseInvoice.update({
        where: { id },
        data:  {
          amountPaid:    newPaid,
          balanceAmount: newBalance,
          status:        deriveStatus(newPaid, Number(invoice.totalAmount)),
        },
      });

      const lastBal = await getLastPartyBalanceTx(tx, invoice.partyId);

      await tx.partyLedger.create({
        data: {
          partyId:   invoice.partyId,
          refType:   LedgerRefType.Payment,
          refId:     id,
          reference: invoice.purchaseInvNo,
          type:      LedgerType.DEBIT,
          debit:     amount,
          credit:    null,
          balance:   lastBal - amount,
        },
      });

      return inv;
    });

    res.json({ success: true, data: updated });

  } catch (error: any) {
    console.error("recordPurchaseInvoicePayment:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


/* ═══════════════════════════════════════════════════════════════
   SUMMARY  —  GET /api/purchase-invoices/summary
═══════════════════════════════════════════════════════════════ */
export const getPurchaseInvoiceSummary = async (_req: Request, res: Response) => {
  try {
    const summary = await prisma.purchaseInvoice.aggregate({
      _sum: { totalAmount: true, amountPaid: true, balanceAmount: true },
    });
    res.json({ success: true, data: summary });
  } catch (error: any) {
    console.error("getPurchaseInvoiceSummary:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


/* ═══════════════════════════════════════════════════════════════
   PRIVATE HELPERS — stock increment / decrement
   Skips Services (itemType !== "Product")
═══════════════════════════════════════════════════════════════ */
async function incrementStock(tx: any, productId: number, qty: number, godownId?: number) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (product?.itemType !== "Product") return;

  const stock = await tx.productStock.findFirst({ where: { productId } });
  if (stock) {
    await tx.productStock.update({
      where: { id: stock.id },
      data:  { openingStock: { increment: qty } },
    });
  } else {
    await tx.productStock.create({
      data: { productId, godownId: godownId ?? 1, openingStock: qty, asOfDate: new Date() },
    });
  }
}

async function decrementStock(tx: any, productId: number, qty: number) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (product?.itemType !== "Product") return;

  const stock = await tx.productStock.findFirst({ where: { productId } });
  if (stock) {
    await tx.productStock.update({
      where: { id: stock.id },
      data:  { openingStock: { decrement: qty } },
    });
  }
}
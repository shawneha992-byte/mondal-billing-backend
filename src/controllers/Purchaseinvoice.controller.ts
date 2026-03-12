import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { LedgerRefType, LedgerType, PurchaseInvoiceStatus } from "@prisma/client";
import { getLastPartyBalanceTx } from "../services/ledger.service";

/* -------------------------------------------------------
   CREATE PURCHASE INVOICE
------------------------------------------------------- */

export const createPurchaseInvoice = async (req: Request, res: Response) => {
  try {

    const {
      partyId,
      branchCode,
      originalInvNo,
      invoiceDate,
      dueDate,
      items = [],
      additionalCharges = [],
      discountAmount = 0,
      roundOff = 0,
      paymentMode,
      amountPaid = 0,
      notes,
      termsConditions,
      ewayBillNo,
      challanNo,
      financedBy,
      salesman,
      emailId,
      warrantyPeriod,
      applyTcs = false,
      applyTds = false,
      autoRoundOff = false
    } = req.body;

    if (!partyId) {
      return res.status(400).json({
        success: false,
        message: "Party is required"
      });
    }

    if (!items.length) {
      return res.status(400).json({
        success: false,
        message: "Invoice must contain items"
      });
    }

    const result = await prisma.$transaction(async (tx) => {

      /* -------- TOTAL CALCULATION -------- */

      let subTotal = 0;
      let taxAmount = 0;

      for (const item of items) {

        const base = item.price * item.quantity;
        const discount = item.discount ?? 0;

        const taxable = base - discount;
        const tax = taxable * ((item.taxRate ?? 0) / 100);

        subTotal += taxable;
        taxAmount += tax;
      }

      const additionalChargesTotal = additionalCharges.reduce(
        (sum: number, c: any) => sum + (c.amount ?? 0),
        0
      );

      const taxableAmount = subTotal + additionalChargesTotal - discountAmount;

      const totalAmount = Number(
        (taxableAmount + taxAmount + roundOff).toFixed(2)
      );

      const balanceAmount = Math.max(0, totalAmount - amountPaid);

      /* -------- GENERATE INVOICE NUMBER -------- */

      const lastInvoice = await tx.purchaseInvoice.findFirst({
        orderBy: { id: "desc" },
        select: { id: true }
      });

      let nextNumber = (lastInvoice?.id ?? 0) + 1;

      let purchaseInvNo = `PI-${String(nextNumber).padStart(5, "0")}`;

      while (
        await tx.purchaseInvoice.findUnique({
          where: { purchaseInvNo }
        })
      ) {
        nextNumber++;
        purchaseInvNo = `PI-${String(nextNumber).padStart(5, "0")}`;
      }

      /* -------- CREATE INVOICE -------- */

      const invoice = await tx.purchaseInvoice.create({
        data: {
          purchaseInvNo,
          originalInvNo: originalInvNo ?? null,
          partyId,
          branchCode: branchCode ?? null,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          dueDate: dueDate ? new Date(dueDate) : null,

          ewayBillNo: ewayBillNo ?? null,
          challanNo: challanNo ?? null,
          financedBy: financedBy ?? null,
          salesman: salesman ?? null,
          emailId: emailId ?? null,
          warrantyPeriod: warrantyPeriod ?? null,

          notes: notes ?? null,
          termsConditions: termsConditions ?? null,

          subTotal,
          taxableAmount,
          discountAmount,
          additionalChargesTotal,
          taxAmount,
          roundOff,
          totalAmount,

          amountPaid,
          balanceAmount,
          paymentMode: paymentMode ?? null,

          applyTcs,
          applyTds,
          autoRoundOff,

          status:
            amountPaid === 0
              ? PurchaseInvoiceStatus.OPEN
              : amountPaid >= totalAmount
              ? PurchaseInvoiceStatus.PAID
              : PurchaseInvoiceStatus.PARTIAL
        }
      });

      /* -------- CREATE ITEMS -------- */

      for (const item of items) {

        const base = item.price * item.quantity;
        const discount = item.discount ?? 0;

        const taxable = base - discount;
        const tax = taxable * ((item.taxRate ?? 0) / 100);

        await tx.purchaseInvoiceItem.create({
          data: {
            purchaseInvoiceId: invoice.id,
            productId: item.productId,
            hsnSac: item.hsnSac ?? null,
            quantity: item.quantity,
            price: item.price,
            discount,
            taxRate: item.taxRate ?? 0,
            taxAmount: tax,
            total: taxable
          }
        });

        /* -------- STOCK UPDATE -------- */

        const product = await tx.product.findUnique({
          where: { id: item.productId }
        });

        if (product?.itemType !== "Product") continue;

        const stock = await tx.productStock.findFirst({
          where: { productId: item.productId }
        });

        if (stock) {

          await tx.productStock.update({
            where: { id: stock.id },
            data: {
              openingStock: {
                increment: item.quantity
              }
            }
          });

        } else {

          await tx.productStock.create({
            data: {
              productId: item.productId,
              godownId: item.godownId ?? 1,
              openingStock: item.quantity,
              asOfDate: new Date()
            }
          });

        }

      }

      /* -------- ADDITIONAL CHARGES -------- */

      for (const charge of additionalCharges) {

        await tx.purchaseInvoiceAdditionalCharge.create({
          data: {
            purchaseInvoiceId: invoice.id,
            name: charge.name,
            amount: charge.amount
          }
        });

      }

      /* -------- LEDGER CREDIT -------- */

      const balanceAfterCredit =
        (await getLastPartyBalanceTx(tx, partyId)) + totalAmount;

      await tx.partyLedger.create({
        data: {
          partyId,
          refType: LedgerRefType.PurchaseInvoice,
          refId: invoice.id,
          reference: purchaseInvNo,
          type: LedgerType.CREDIT,
          debit: null,
          credit: totalAmount,
          balance: balanceAfterCredit
        }
      });

      /* -------- PAYMENT ENTRY -------- */

      if (amountPaid > 0) {

        await tx.partyLedger.create({
          data: {
            partyId,
            refType: LedgerRefType.Payment,
            refId: invoice.id,
            reference: purchaseInvNo,
            type: LedgerType.DEBIT,
            debit: amountPaid,
            credit: null,
            balance: balanceAfterCredit - amountPaid
          }
        });

      }

      return invoice;

    });

    return res.status(201).json({
      success: true,
      message: "Purchase invoice created successfully",
      data: result
    });

  } catch (error: any) {

    console.error("Purchase Invoice Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/* -------------------------------------------------------
   GET ALL PURCHASE INVOICES
------------------------------------------------------- */

export const getPurchaseInvoices = async (_req: Request, res: Response) => {

  const invoices = await prisma.purchaseInvoice.findMany({
    include: {
      party: true,
      items: true,
      additionalCharges: true
    },
    orderBy: {
      invoiceDate: "desc"
    }
  });

  res.json({ success: true, data: invoices });

};


/* -------------------------------------------------------
   GET PURCHASE INVOICE BY ID
------------------------------------------------------- */

export const getPurchaseInvoiceById = async (req: Request, res: Response) => {

  const id = Number(req.params.id);

  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id },
    include: {
      party: true,
      items: true,
      additionalCharges: true
    }
  });

  if (!invoice) {
    return res.status(404).json({
      success: false,
      message: "Invoice not found"
    });
  }

  res.json({ success: true, data: invoice });

};


/* -------------------------------------------------------
   UPDATE PURCHASE INVOICE
------------------------------------------------------- */

export const updatePurchaseInvoice = async (req: Request, res: Response) => {

  const id = Number(req.params.id);

  const updated = await prisma.purchaseInvoice.update({
    where: { id },
    data: req.body
  });

  res.json({ success: true, data: updated });

};


/* -------------------------------------------------------
   DELETE PURCHASE INVOICE
------------------------------------------------------- */

export const deletePurchaseInvoice = async (req: Request, res: Response) => {

  const id = Number(req.params.id);

  await prisma.purchaseInvoice.delete({
    where: { id }
  });

  res.json({ success: true, message: "Invoice deleted" });

};


/* -------------------------------------------------------
   CANCEL PURCHASE INVOICE
------------------------------------------------------- */

export const cancelPurchaseInvoice = async (req: Request, res: Response) => {

  const id = Number(req.params.id);

  const invoice = await prisma.purchaseInvoice.update({
    where: { id },
    data: {
      status: PurchaseInvoiceStatus.CANCELLED
    }
  });

  res.json({ success: true, data: invoice });

};


/* -------------------------------------------------------
   RECORD PAYMENT
------------------------------------------------------- */

export const recordPurchaseInvoicePayment = async (req: Request, res: Response) => {

  const id = Number(req.params.id);
  const { amount } = req.body;

  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id }
  });

  if (!invoice) {
    return res.status(404).json({
      success: false,
      message: "Invoice not found"
    });
  }

  const newPaid = Number(invoice.amountPaid) + Number(amount);
  const newBalance = Number(invoice.totalAmount) - newPaid;

  const updated = await prisma.purchaseInvoice.update({
    where: { id },
    data: {
      amountPaid: newPaid,
      balanceAmount: newBalance,
      status: newBalance <= 0 ? PurchaseInvoiceStatus.PAID : PurchaseInvoiceStatus.PARTIAL
    }
  });

  res.json({ success: true, data: updated });

};


/* -------------------------------------------------------
   PURCHASE INVOICE SUMMARY
------------------------------------------------------- */

export const getPurchaseInvoiceSummary = async (_req: Request, res: Response) => {

  const summary = await prisma.purchaseInvoice.aggregate({
    _sum: {
      totalAmount: true,
      amountPaid: true,
      balanceAmount: true
    }
  });

  res.json({
    success: true,
    data: summary
  });

};
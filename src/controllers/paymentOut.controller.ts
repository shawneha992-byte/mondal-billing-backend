import { Request, Response } from "express";
import { LedgerRefType, LedgerType } from "@prisma/client";
import prisma from "../utils/prisma";

/* =========================================
   CREATE PAYMENT OUT
========================================= */

export const createPaymentOut = async (req: Request, res: Response) => {
  try {
    const {
      partyId,
      date,
      amountPaid,
      discount = 0,
      paymentMode,
      notes,
    } = req.body;

    if (!partyId) {
      return res.status(400).json({ message: "Party is required" });
    }

    if (Number(amountPaid) <= 0) {
      return res.status(400).json({
        message: "Payment amount must be greater than zero",
      });
    }

    const party = await prisma.party.findUnique({
      where: { id: partyId },
    });

    if (!party) {
      return res.status(404).json({
        message: "Party not found",
      });
    }

    const invoices = await prisma.purchaseInvoice.findMany({
      where: {
        partyId,
        status: { not: "CANCELLED" },
      },
      orderBy: {
        invoiceDate: "asc",
      },
    });

    const pendingInvoices = invoices
      .map((inv) => ({
        id: inv.id,
        invoiceAmount: Number(inv.totalAmount),
        balance: Number(inv.balanceAmount || 0),
      }))
      .filter((inv) => inv.balance > 0);

    const totalPending = pendingInvoices.reduce(
      (sum, inv) => sum + inv.balance,
      0
    );

    const totalEffect = Number(amountPaid) + Number(discount || 0);

    if (totalEffect > totalPending) {
      return res.status(400).json({
        message: "Payment + discount exceeds outstanding balance",
      });
    }

    /* ===============================
       DISTRIBUTION LOGIC (FIXED)
    =============================== */

    let remainingPayment = Number(amountPaid);
    let remainingDiscount = Number(discount || 0);

    const allocations: any[] = [];

    for (const inv of pendingInvoices) {
      if (remainingPayment <= 0 && remainingDiscount <= 0) break;

      // Apply payment FIRST
      const payAmount = Math.min(inv.balance, remainingPayment);
      remainingPayment -= payAmount;

      // Apply discount AFTER payment
      const remainingBalanceAfterPayment = inv.balance - payAmount;

      let appliedDiscount = 0;
      if (remainingDiscount > 0) {
        appliedDiscount = Math.min(
          remainingDiscount,
          remainingBalanceAfterPayment
        );
        remainingDiscount -= appliedDiscount;
      }

      allocations.push({
        purchaseInvoiceId: inv.id,
        invoiceAmount: inv.invoiceAmount,
        amountPaid: payAmount,
        discount: appliedDiscount,
        balanceAmount: inv.balance - payAmount - appliedDiscount,
      });
    }

    const payment = await prisma.$transaction(async (tx) => {
      /* ===============================
         SETTINGS
      =============================== */

      let settings = await tx.paymentOutSettings.findFirst();

      if (!settings) {
        settings = await tx.paymentOutSettings.create({
          data: {
            prefix: "PO/",
            sequenceNumber: 0,
          },
        });
      }

      const prefix = settings.prefix || "";

      /* ===============================
         NEXT SEQUENCE
      =============================== */

      const nextSequence = settings.sequenceNumber + 1;
      const paymentNumber = `${prefix}${nextSequence}`;

      /* ===============================
         CREATE PAYMENT
      =============================== */

      const payment = await tx.paymentOut.create({
        data: {
          paymentNumber,
          partyId,
          date: new Date(date),
          amountPaid: Number(amountPaid),
          discount: Number(discount),
          paymentMode,
          notes,
          invoices: {
            create: allocations,
          },
        },
      });

      /* ===============================
         UPDATE SETTINGS SEQUENCE
      =============================== */

      await tx.paymentOutSettings.update({
        where: { id: settings.id },
        data: {
          sequenceNumber: nextSequence,
        },
      });

      /* ===============================
         UPDATE INVOICE BALANCES
      =============================== */

      for (const alloc of allocations) {
        const invoice = await tx.purchaseInvoice.findUnique({
          where: { id: alloc.purchaseInvoiceId },
        });

        if (!invoice) continue;

        const newPaid =
          Number(invoice.amountPaid || 0) +
          Number(alloc.amountPaid) +
          Number(alloc.discount || 0);

        const newBalance = Math.max(
          0,
          Number(invoice.totalAmount) - newPaid
        );

        let status: any = "OPEN";

        if (newBalance === 0) status = "PAID";
        else if (newPaid > 0) status = "PARTIAL";

        await tx.purchaseInvoice.update({
          where: { id: alloc.purchaseInvoiceId },
          data: {
            amountPaid: newPaid,
            balanceAmount: newBalance,
            status,
          },
        });
      }

      /* ===============================
         PARTY LEDGER ENTRY
      =============================== */

      const lastLedger = await tx.partyLedger.findFirst({
        where: { partyId },
        orderBy: { id: "desc" },
      });

      const previousBalance = Number(lastLedger?.balance || 0);

      const newBalance = previousBalance - totalEffect;

      await tx.partyLedger.create({
        data: {
          partyId,
          date: new Date(date),
          refType: LedgerRefType.Payment,
          refId: payment.id,
          reference: paymentNumber,
          type: LedgerType.DEBIT,
          debit: Number(amountPaid), // cash only
          credit: 0,
          balance: newBalance,
        },
      });

      return payment;
    });

    res.status(201).json({
      message: "Payment created successfully",
      paymentId: payment.id,
    });

  } catch (error) {
    console.error("Create PaymentOut Error:", error);

    res.status(500).json({
      message: "Failed to create payment out",
    });
  }
};

/* =========================================
   GET ALL PAYMENT OUT
========================================= */

export const getAllPaymentOut = async (_req: Request, res: Response) => {
  try {
    const payments = await prisma.paymentOut.findMany({
      include: {
        party: { select: { name: true } },
      },
      orderBy: { date: "desc" },
    });

    const formatted = payments.map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      date: p.date,
      partyName: p.party?.name || "-",
      amountPaid: Number(p.amountPaid),
      discount: Number(p.discount || 0),
      paymentMode: p.paymentMode || "-",
      notes: p.notes || "",
    }));

    res.json(formatted);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Error fetching payment out list",
    });
  }
};

/* =========================================
   GET PAYMENT BY ID
========================================= */

export const getPaymentOutById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const payment = await prisma.paymentOut.findUnique({
      where: { id },
      include: {
        party: true,
        invoices: {
          include: {
            purchaseInvoice: true,
          },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({
        message: "Payment not found",
      });
    }

    const formatted = {
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      date: payment.date,
      party: payment.party,
      amountPaid: Number(payment.amountPaid),
      discount: Number(payment.discount || 0),
      paymentMode: payment.paymentMode,
      notes: payment.notes,
      invoices: payment.invoices.map((inv) => ({
        invoiceNumber: inv.purchaseInvoice.purchaseInvNo,
        date: inv.purchaseInvoice.invoiceDate,
        invoiceAmount: inv.invoiceAmount,
        discount: inv.discount,
        amountPaid: inv.amountPaid,
        balanceAmount: inv.balanceAmount,
      })),
    };

    res.json(formatted);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Error fetching payment details",
    });
  }
};

/* =========================================
   DELETE PAYMENT OUT (FIXED)
========================================= */

export const deletePaymentOut = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    await prisma.$transaction(async (tx) => {
      const payment = await tx.paymentOut.findUnique({
        where: { id },
        include: { invoices: true },
      });

      if (!payment) throw new Error("Payment not found");

      for (const alloc of payment.invoices) {
        const invoice = await tx.purchaseInvoice.findUnique({
          where: { id: alloc.purchaseInvoiceId },
        });

        if (!invoice) continue;

        const reversedAmount =
          Number(alloc.amountPaid) + Number(alloc.discount || 0);

        const newPaid =
          Number(invoice.amountPaid || 0) - reversedAmount;

        const newBalance =
          Number(invoice.totalAmount) - newPaid;

        await tx.purchaseInvoice.update({
          where: { id: alloc.purchaseInvoiceId },
          data: {
            amountPaid: newPaid,
            balanceAmount: newBalance,
          },
        });
      }

      await tx.paymentOutInvoice.deleteMany({
        where: { paymentOutId: id },
      });

      await tx.partyLedger.deleteMany({
        where: {
          refType: LedgerRefType.Payment,
          refId: id,
        },
      });

      await tx.paymentOut.delete({
        where: { id },
      });
    });

    res.json({
      message: "Payment deleted successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Error deleting payment",
    });
  }
};
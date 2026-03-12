import { Request, Response } from "express";
import prisma from "../utils/prisma";

/* =========================================
   CREATE PAYMENT OUT
========================================= */

export const createPaymentOut = async (req: Request, res: Response) => {
  try {
    const {
      paymentNumber,
      partyId,
      date,
      amountPaid,
      discount,
      paymentMode,
      notes,
      invoices,
    } = req.body;

    const payment = await prisma.paymentOut.create({
      data: {
        paymentNumber,
        partyId,
        date: new Date(date),
        amountPaid,
        discount,
        paymentMode,
        notes,

        invoices: {
          create:
            invoices?.map((inv: any) => ({
              purchaseInvoiceId: inv.purchaseInvoiceId,
              invoiceAmount: inv.invoiceAmount,
              discount: inv.discount,
              amountPaid: inv.amountPaid,
              balanceAmount: inv.balanceAmount,
            })) || [],
        },
      },
    });

    res.status(201).json(payment);
  } catch (error) {
    console.error("Create PaymentOut Error:", error);
    res.status(500).json({ message: "Failed to create payment out" });
  }
};

/* =========================================
   GET ALL PAYMENT OUT
========================================= */

export const getAllPaymentOut = async (_req: Request, res: Response) => {
  try {
    const payments = await prisma.paymentOut.findMany({
      include: {
        party: true,
      },
      orderBy: {
        date: "desc",
      },
    });

    const formatted = payments.map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      date: p.date,
      partyName: p.party.name,
      totalAmountSettled: p.amountPaid,
      amountReceived: p.amountPaid,
      paymentMode: p.paymentMode,
    }));

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching payment out list" });
  }
};

/* =========================================
   GET SINGLE PAYMENT OUT
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
      return res.status(404).json({ message: "Payment not found" });
    }

    const formatted = {
      id: payment.id,
      paymentNumber: payment.paymentNumber,
      partyName: payment.party.name,
      date: payment.date,
      amountPaid: payment.amountPaid,
      discount: payment.discount,
      paymentMode: payment.paymentMode,
      notes: payment.notes,

      invoices: payment.invoices.map((inv) => ({
        invoiceNumber: inv.purchaseInvoice.invoiceNumber,
        date: inv.purchaseInvoice.date,
        invoiceAmount: inv.invoiceAmount,
        discount: inv.discount,
        amountPaid: inv.amountPaid,
        balanceAmount: inv.balanceAmount,
      })),
    };

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching payment details" });
  }
};

/* =========================================
   DELETE PAYMENT OUT
========================================= */

export const deletePaymentOut = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    await prisma.paymentOutInvoice.deleteMany({
      where: { paymentOutId: id },
    });

    await prisma.paymentOut.delete({
      where: { id },
    });

    res.json({ message: "Payment deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error deleting payment" });
  }
};
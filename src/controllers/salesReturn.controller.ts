import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { InvoiceStatus } from "@prisma/client";

/**
 * ======================================================
 * CREATE SALES RETURN
 * POST /api/sales-return
 * ======================================================
 */
export const createSalesReturn = async (req: Request, res: Response) => {
  try {
    const { invoiceId, returnAmount } = req.body;

    if (!invoiceId || !partyId || !items || items.length === 0) {
      return res.status(400).json({ message: "Invalid request data" });
    }

    // Calculate total return amount
    const totalAmount = items.reduce(
      (sum: number, item: any) => sum + item.quantity * item.price,
      0
    );

    const salesReturn = await prisma.$transaction(async (tx) => {

      // 1️⃣ Create Sales Return
      const sr = await tx.salesReturn.create({
        data: {
          invoiceId,
          partyId,
          totalAmount,
          items: {
            create: items.map((item: any) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
            })),
          },
        },
    /* if (!invoiceId || !returnAmount || returnAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "invoiceId and valid returnAmount are required"
      });
    } */

    // 1️⃣ Fetch invoice
    const invoice = await prisma.invoice.findUnique({
      where: { id: Number(invoiceId) }
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      });
    }

    const outstanding = Number(invoice.outstandingAmount ?? 0);

    // 2️⃣ Validate return amount
    if (returnAmount > outstanding) {
      return res.status(400).json({
        success: false,
        message: "Return amount cannot exceed outstanding amount"
      });
    }

    // 3️⃣ Calculate new outstanding
    const newOutstanding = outstanding - returnAmount;

    let newStatus: InvoiceStatus = InvoiceStatus.OPEN;
    if (newOutstanding === 0) newStatus = InvoiceStatus.PAID;
    else if (newOutstanding < Number(invoice.totalAmount))
      newStatus = InvoiceStatus.PARTIAL;

    // 4️⃣ Update invoice
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        outstandingAmount: newOutstanding,
        status: newStatus
      }

      // 3️⃣ Party Ledger Entry (CREDIT)
      await tx.partyLedger.create({
        data: {
          partyId,
          type: "CREDIT",
          amount: totalAmount,
          reference: `Sales return for invoice #${invoiceId}`,
        },
      });

      // ❌ NO invoice balance update (ledger-based system)
      return sr;
    });

    // 5️⃣ Get last ledger balance
    const lastLedger = await prisma.partyLedger.findFirst({
      where: { partyId: invoice.partyId },
      orderBy: { id: "desc" }
    });

    const lastBalance = Number(lastLedger?.balance ?? 0);
    const newBalance = lastBalance - returnAmount;

    // 6️⃣ Create ledger CREDIT entry
    await prisma.partyLedger.create({
      data: {
        partyId: invoice.partyId,
        refType: "Return",
        refId: invoice.id,

        type: "CREDIT",
        debit: null,
        credit: returnAmount,
        balance: newBalance
      }
    });

    return res.status(201).json({
      success: true,
      message: "Sales return processed successfully"
    });

  } catch (error) {
    console.error("❌ Sales Return Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process sales return"
    });
  }
};

/**
 * ======================================================
 * GET SALES RETURNS
 * GET /api/sales-return
 * ======================================================
 */
export const getSalesReturns = async (_req: Request, res: Response) => {
  try {
    const data = await prisma.salesReturn.findMany({
      include: {
        invoice: true,
        party: true,
        items: true
      }
    });

    return res.json({
      success: true,
      data
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch sales returns"
    });
  }
};

import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { InvoiceStatus, LedgerRefType, LedgerType } from "@prisma/client";

/**
 * ======================================================
 * CREATE SALES RETURN
 * POST /api/sales-return
 * ======================================================
 */
export const createSalesReturn = async (req: Request, res: Response) => {
  try {
    const { invoiceId, partyId, items } = req.body;

    if (!invoiceId || !partyId || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "invoiceId, partyId and items are required"
      });
    }

    // 🔹 Calculate total return amount from items
    const totalAmount = items.reduce(
      (sum: number, item: any) => sum + item.quantity * item.price,
      0
    );

    const result = await prisma.$transaction(async (tx) => {

      // 1️⃣ Fetch invoice
      const invoice = await tx.invoice.findUnique({
        where: { id: Number(invoiceId) }
      });

      if (!invoice) {
        throw new Error("Invoice not found");
      }

      const outstanding = Number(invoice.outstandingAmount ?? 0);

      // 2️⃣ Validate return amount
      if (totalAmount > outstanding) {
        throw new Error("Return amount cannot exceed outstanding amount");
      }

      // 3️⃣ Create Sales Return
      const salesReturn = await tx.salesReturn.create({
        data: {
          invoiceId,
          partyId,
          totalAmount,
          items: {
            create: items.map((item: any) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price
            }))
          }
        }
      });

      // 4️⃣ Calculate new outstanding & status
      const newOutstanding = outstanding - totalAmount;

      let newStatus: InvoiceStatus = InvoiceStatus.OPEN;
      if (newOutstanding === 0) {
        newStatus = InvoiceStatus.PAID;
      } else if (newOutstanding < Number(invoice.totalAmount)) {
        newStatus = InvoiceStatus.PARTIAL;
      }

      // 5️⃣ Update invoice
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          outstandingAmount: newOutstanding,
          status: newStatus
        }
      });

      // 6️⃣ Get last ledger balance
      const lastLedger = await tx.partyLedger.findFirst({
        where: { partyId },
        orderBy: { id: "desc" }
      });

      const lastBalance = Number(lastLedger?.balance ?? 0);
      const newBalance = lastBalance - totalAmount;

      // 7️⃣ Party Ledger entry (CREDIT)
      await tx.partyLedger.create({
        data: {
          partyId,

          refType: LedgerRefType.Return,
          refId: invoice.id,

          type: LedgerType.CREDIT,
          debit: null,
          credit: totalAmount,

          balance: newBalance
        }
      });

      return salesReturn;
    });

    return res.status(201).json({
      success: true,
      message: "Sales return processed successfully",
      data: result
    });

  } catch (error: any) {
    console.error("❌ Sales Return Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to process sales return"
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

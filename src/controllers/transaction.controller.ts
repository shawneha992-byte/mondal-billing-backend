import { Request, Response } from "express";
import prisma from "../utils/prisma";


// ==============================
// 1️⃣ Transactions Controller
// ==============================
export const getPartyTransactions = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);

    const invoices = await prisma.invoice.findMany({
      where: { partyId },
    });

    const payments = await prisma.paymentIn.findMany({
      where: { partyId },
    });

    const returns = await prisma.salesReturn.findMany({
      where: { partyId },
    });

    const formatted = [
      ...invoices.map((inv) => ({
        id: inv.id,
        date: inv.createdAt,
        type: "Sales Invoice",
        number: inv.invoiceNo,
        amount: Number(inv.totalAmount),
        status:
          inv.status === "PAID"
            ? "Paid"
            : inv.status === "PARTIAL"
            ? "Partial Paid"
            : "Unpaid",
      })),

      ...payments.map((pay) => ({
        id: pay.id,
        date: pay.date,
        type: "Payment In",
        number: pay.paymentNo,
        amount: Number(pay.amount),
        status: "Paid",
      })),

      ...returns.map((ret) => ({
        id: ret.id,
        date: ret.createdAt,
        type: "Sales Return",
        number: ret.id,
        amount: ret.totalAmount,
        status: "Paid",
      })),
    ];

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


// ==============================
// 2️⃣ Item Wise Controller
// ==============================
export const getPartyItemWise = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);

    const items = await prisma.invoiceItem.findMany({
      where: {
        invoice: {
          partyId: partyId,
        },
      },
      include: {
        invoice: true,
        product: true,  // product is nullable (free-text items have no linked product)
      },
    });

    const formatted = items.map((item) => ({
      partyId:  item.invoice.partyId,
      // FIX: item.product is possibly null for free-text invoice items.
      // Use optional chaining + fallback to productName stored on the item row itself.
      itemName: item.product?.name ?? (item as any).productName ?? "Unknown Item",
      itemCode: item.product?.id   ?? null,
      quantity: item.quantity,
      amount:   Number(item.total),
      type:     "Sale",
      date:     item.invoice.createdAt,
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
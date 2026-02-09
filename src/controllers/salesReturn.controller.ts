import { Request, Response } from "express";
import prisma from "../utils/prisma";

/**
 * POST /api/sales-return
 */
export const createSalesReturn = async (req: Request, res: Response) => {
  try {
    const { invoiceId, partyId, items } = req.body;

    if (!invoiceId || !partyId || !items || items.length === 0) {
      return res.status(400).json({ message: "Invalid request data" });
    }

    let totalAmount = 0;
    for (const item of items) {
      totalAmount += item.quantity * item.price;
    }

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
      });

      // 2️⃣ Increase Product Stock
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              increment: item.quantity,
            },
          },
        });
      }

      // 3️⃣ Credit Party Ledger
      await tx.partyLedger.create({
        data: {
          partyId,
          credit: totalAmount,
          debit: 0,
          description: `Sales return for invoice #${invoiceId}`,
        },
      });

      // 4️⃣ Adjust Invoice Balance
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          balanceAmount: {
            decrement: totalAmount,
          },
        },
      });

      return sr;
    });

    res.status(201).json({
      message: "Sales return created successfully",
      data: salesReturn,
    });
  } catch (error) {
    console.error("Sales return error:", error);
    res.status(500).json({ message: "Sales return failed" });
  }
};

/**
 * GET /api/sales-return
 */
export const getSalesReturns = async (_req: Request, res: Response) => {
  try {
    const data = await prisma.salesReturn.findMany({
      include: {
        items: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(data);
  } catch (error) {
    console.error("Fetch sales returns error:", error);
    res.status(500).json({ message: "Failed to fetch sales returns" });
  }
};

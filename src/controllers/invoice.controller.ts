import { Request, Response } from "express";
import prisma from "../utils/prisma";

/**
 * CREATE INVOICE
 */
export const createInvoice = async (req: Request, res: Response) => {
  const { partyId, items } = req.body;

  if (!partyId || !items || items.length === 0) {
    return res.status(400).json({ error: "Invalid invoice data" });
  }

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      let subTotal = 0;

      // 1️⃣ Validate stock & calculate subtotal
      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product) {
          throw new Error(`Product not found (ID: ${item.productId})`);
        }

        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }

        subTotal += item.price * item.quantity;
      }

      // 2️⃣ Tax & total
      const taxAmount = subTotal * 0.18;
      const totalAmount = subTotal + taxAmount;

      // 3️⃣ Create invoice (schema aligned)
      const invoice = await tx.invoice.create({
        data: {
          invoiceNo: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,

          // relation (unchecked create)
          partyId,

          subTotal,
          taxAmount,
          totalAmount,

          // REQUIRED by schema
          outstandingAmount: totalAmount,

          items: {
            create: items.map((item: any) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
              total: item.price * item.quantity,
            })),
          },
        },
      });

      // 4️⃣ Reduce product stock
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });
      }

      // 5️⃣ Party Ledger (DEBIT entry)
      await tx.partyLedger.create({
        data: {
          partyId,

          // REQUIRED reference fields
          refType: "Invoice",
          refId: invoice.id,
          reference: invoice.invoiceNo,

          // Accounting
          type: "DEBIT",
          debit: totalAmount,
          credit: 0,

          // REQUIRED balance
          balance: totalAmount,
        },
      });

      return invoice;
    });

    return res.status(201).json({
      message: "Invoice created successfully",
      invoice,
    });
  } catch (error: any) {
    console.error("Create invoice error:", error);
    return res.status(400).json({ error: error.message });
  }
};

/**
 * GET ALL INVOICES
 */
export const getInvoices = async (_req: Request, res: Response) => {
  try {
    const invoices = await prisma.invoice.findMany({
      include: {
        party: true,
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json(invoices);
  } catch (error) {
    console.error("Fetch invoices error:", error);
    return res.status(500).json({ message: "Failed to fetch invoices" });
  }
};
/**
 * GET PARTY ITEM-WISE DATA
 */
export const getPartyItemWiseReport = async (
  req: Request,
  res: Response
) => {
  const partyId = Number(req.params.id);

  try {
    const invoices = await prisma.invoice.findMany({
      where: { partyId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const transactions: any[] = [];

    invoices.forEach((invoice) => {
      invoice.items.forEach((item) => {
        transactions.push({
          partyId,
          itemName: item.product.name,
          itemCode: item.product.id.toString(),
          quantity: item.quantity,
          amount: item.total,
          type: "Sale",
          date: invoice.createdAt,
        });
      });
    });

    return res.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    console.error("Item-wise report error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch item-wise report",
    });
  }
};

import { Request, Response } from "express";
import prisma from "../utils/prisma";

export const createInvoice = async (req: Request, res: Response) => {
  const { partyId, items } = req.body;

  if (!partyId || !items || items.length === 0) {
    return res.status(400).json({ error: "Invalid invoice data" });
  }

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      let subTotal = 0;

      // 1. Validate stock + subtotal
      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product) throw new Error("Product not found");

        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }

        subTotal += item.price * item.quantity;
      }

      // 2. Tax calculation
      const taxAmount = subTotal * 0.18;
      const totalAmount = subTotal + taxAmount;

      // 3. Create invoice
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: `INV-${Date.now()}`,
          partyId,
          subTotal,
          taxAmount,
          totalAmount,
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

      // 4. Reduce stock
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: { decrement: item.quantity },
          },
        });
      }

      // 5. Party Ledger (Debit)
      await tx.partyLedger.create({
        data: {
          partyId,
          type: "DEBIT",
          amount: totalAmount,
          reference: invoice.invoiceNumber,
        },
      });

      return invoice;
    });

    res.status(201).json({ message: "Invoice created", invoice });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getInvoices = async (_req: Request, res: Response) => {
  const invoices = await prisma.invoice.findMany({
    include: {
      party: true,
      items: {
        include: { product: true },
      },
    },
  });

  res.json(invoices);
};

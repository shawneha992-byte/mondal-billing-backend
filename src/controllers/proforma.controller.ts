import { Request, Response } from "express";
import prisma  from "../utils/prisma";

export const createProformaInvoice = async (req: Request, res: Response) => {
  try {
    const {
      customerName,
      customerPhone,
      quotationId,
      items
    } = req.body;

    if (!customerName || !items || items.length === 0) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const subTotal = items.reduce(
      (sum: number, item: any) => sum + item.rate * item.quantity,
      0
    );

    const taxAmount = items.reduce(
      (sum: number, item: any) => sum + item.taxAmount,
      0
    );

    const grandTotal = subTotal + taxAmount;
    const proforma = await prisma.proformaInvoice.create({
  data: {
    proformaNumber: `PI-${Date.now()}`,
    customerName,
    customerPhone,
    quotationId,
    subTotal,
    taxAmount,
    discountAmount: 0,   // ✅ FIX (IMPORTANT)
    grandTotal,
    items: {
      create: items.map((item: any) => ({
        productName: item.productName,
        quantity: item.quantity,
        rate: item.rate,
        taxPercent: item.taxPercent,
        taxAmount: item.taxAmount,
        total: item.total
      }))
    }
  },
  include: {
    items: true
  }
});

   

    res.status(201).json({
      success: true,
      message: "Proforma invoice created successfully",
      data: proforma
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getProformaInvoices = async (_req: Request, res: Response) => {
  try {
    const proformas = await prisma.proformaInvoice.findMany({
      include: {
        items: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json({
      success: true,
      data: proformas
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

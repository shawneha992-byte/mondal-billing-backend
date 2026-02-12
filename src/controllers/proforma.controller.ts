import { Request, Response } from "express";
import prisma  from "../utils/prisma";
import { ProformaStatus } from "@prisma/client";


export const createProformaInvoice = async (req: Request, res: Response) => {
  try {
    const {
      customerName,
      customerPhone,
      quotationId,
      items,
      discountAmount = 0,
      taxAmount = 0
    } = req.body;

    if (!customerName || !items || items.length === 0) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const subTotal = items.reduce(
      (sum: number, item: any) => sum + item.rate * item.quantity,
      0
    );

    const grandTotal = subTotal - discountAmount + taxAmount;

    const proforma = await prisma.proformaInvoice.create({
      data: {
        proformaNumber: `PI-${Date.now()}`,
        customerName,
        customerPhone,
        quotationId: quotationId ? String(quotationId) : null, // ✅ optional linkage
        subTotal,
        discountAmount,
        taxAmount,
        grandTotal,
        status: ProformaStatus.DRAFT, // ✅ default status
        items: {
        create: items.map((item: any) => ({
         productName: item.productName,
         quantity: item.quantity,
         rate: item.rate,              // ✅ REQUIRED
         taxPercent: item.taxPercent ?? 0,
         taxAmount: item.taxAmount ?? 0,
         total: item.total

          }))
        }
      },
      include: {
        items: true
      }
    });

    // ✅ Task-style response (no wrapper)
    res.status(201).json(proforma);

  } catch (error: any) {
    console.error("PROFORMA ERROR:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


export const getProformaInvoices = async (_req: Request, res: Response) => {
  try {
    const proformas = await prisma.proformaInvoice.findMany({
      select: {
        id: true,
        proformaNumber: true,
        customerName: true,
        grandTotal: true,
        status: true,
        createdAt: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    // ✅ Task-style list response
    res.json(proformas);

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};


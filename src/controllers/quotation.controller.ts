import { Request, Response } from "express";
import prisma from "../utils/prisma";

/**
 * POST /api/quotations
 */
export const createQuotation = async (req: Request, res: Response) => {
  try {
    const {
      partyId,
      date,
      validTill,
      discount,
      tax,
      items,
    } = req.body;

    const subtotal = items.reduce(
      (sum: number, item: any) => sum + item.quantity * item.price,
      0
    );

    const total = subtotal - discount + tax;

    const quotation = await prisma.quotation.create({
      data: {
        partyId,
        date: new Date(date),
        validTill: new Date(validTill),
        subtotal,
        discount,
        tax,
        total,
        status: "OPEN",
        items: {
          create: items.map((item: any) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            total: item.quantity * item.price,
          })),
        },
      },
      include: { items: true },
    });

    res.status(201).json(quotation);
  } catch (error) {
    res.status(500).json({ message: "Failed to create quotation", error });
  }
};

/**
 * GET /api/quotations
 */
export const getAllQuotations = async (_req: Request, res: Response) => {
  const quotations = await prisma.quotation.findMany({
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(quotations);
};

/**
 * GET /api/quotations/:id
 */
export const getQuotationById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (!id || isNaN(id)) {
      return res.status(400).json({
        message: "Quotation ID is required and must be a number"
      });
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!quotation) {
      return res.status(404).json({
        message: "Quotation not found"
      });
    }

    res.json({
      success: true,
      data: quotation
    });
  } catch (error: any) {
    console.error("❌ GET QUOTATION ERROR:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

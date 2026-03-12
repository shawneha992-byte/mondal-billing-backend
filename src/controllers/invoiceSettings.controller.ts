import { Request, Response } from "express";
import prisma from "../utils/prisma";

/**
 * GET /api/invoice-settings
 * Returns the first InvoiceSettings row (no branch filter for now).
 * Returns defaults if none exist yet.
 */
export const getInvoiceSettings = async (req: Request, res: Response) => {
  try {
    let settings = await prisma.invoiceSettings.findFirst({
      orderBy: { id: "asc" },
    });

    if (!settings) {
      // Return defaults — don't persist yet (lazy creation on first Save)
      return res.json({
        success: true,
        data: {
          id:                 null,
          enablePrefix:       false,
          prefix:             "",
          sequenceNumber:     1,
          showPurchasePrice:  false,
          showItemImage:      false,
          enablePriceHistory: false,
          invoiceTheme:       "Advanced GST",
        },
      });
    }

    return res.json({ success: true, data: settings });
  } catch (error) {
    console.error("❌ getInvoiceSettings:", error);
    res.status(500).json({ success: false, message: "Failed to fetch invoice settings" });
  }
};

/**
 * POST /api/invoice-settings
 * Upserts (creates or updates) the single InvoiceSettings row.
 */
export const saveInvoiceSettings = async (req: Request, res: Response) => {
  try {
    const {
      enablePrefix       = false,
      prefix             = "",
      sequenceNumber     = 1,
      showPurchasePrice  = false,
      showItemImage      = false,
      enablePriceHistory = false,
      invoiceTheme       = "Advanced GST",
    } = req.body;

    const existing = await prisma.invoiceSettings.findFirst({ orderBy: { id: "asc" } });

    let settings;
    if (existing) {
      settings = await prisma.invoiceSettings.update({
        where: { id: existing.id },
        data: {
          enablePrefix,
          prefix:             enablePrefix ? (prefix || "") : "",
          sequenceNumber:     Number(sequenceNumber) || 1,
          showPurchasePrice,
          showItemImage,
          enablePriceHistory,
          invoiceTheme,
        },
      });
    } else {
      settings = await prisma.invoiceSettings.create({
        data: {
          enablePrefix,
          prefix:             enablePrefix ? (prefix || "") : "",
          sequenceNumber:     Number(sequenceNumber) || 1,
          showPurchasePrice,
          showItemImage,
          enablePriceHistory,
          invoiceTheme,
        },
      });
    }

    return res.json({ success: true, data: settings });
  } catch (error) {
    console.error("❌ saveInvoiceSettings:", error);
    res.status(500).json({ success: false, message: "Failed to save invoice settings" });
  }
};
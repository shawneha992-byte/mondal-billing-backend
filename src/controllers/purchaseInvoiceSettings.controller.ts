import { Request, Response } from "express";
import prisma from "../utils/prisma";

/* ═══════════════════════════════════════════════
   GET SETTINGS
   GET /api/purchase-invoices/settings
═══════════════════════════════════════════════ */
export const getPurchaseInvoiceSettings = async (
  _req: Request,
  res: Response
) => {
  try {
    let settings = await prisma.purchaseInvoiceSettings.findFirst();

    if (!settings) {
      settings = await prisma.purchaseInvoiceSettings.create({
        data: {
          prefix: "PI",
          sequenceNumber: 1,
          enablePrefix: true,
          showItemImage: false,
          enablePriceHistory: false,
        },
      });
    }

    return res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Get Purchase Settings Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load purchase invoice settings",
    });
  }
};

/* ═══════════════════════════════════════════════
   UPDATE SETTINGS
   PUT /api/purchase-invoices/settings
   (Sequence NOT editable)
═══════════════════════════════════════════════ */
export const updatePurchaseInvoiceSettings = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      prefix,
      enablePrefix,
      showItemImage,
      enablePriceHistory,
    } = req.body;

    let settings = await prisma.purchaseInvoiceSettings.findFirst();

    if (!settings) {
      settings = await prisma.purchaseInvoiceSettings.create({
        data: {
          prefix: prefix ?? "PI",
          sequenceNumber: 1,
          enablePrefix: enablePrefix ?? true,
          showItemImage: showItemImage ?? false,
          enablePriceHistory: enablePriceHistory ?? false,
        },
      });
    } else {
      settings = await prisma.purchaseInvoiceSettings.update({
        where: { id: settings.id },
        data: {
          prefix,
          enablePrefix,
          showItemImage,
          enablePriceHistory,
        },
      });
    }

    return res.json({
      success: true,
      message: "Settings updated successfully",
      data: settings,
    });
  } catch (error) {
    console.error("Update Purchase Settings Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update settings",
    });
  }
};
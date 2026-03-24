import { Request, Response } from "express";
import prisma from "../utils/prisma";

/* ═══════════════════════════════════════════════════════════
   GET INVOICE DETAILS SETTINGS
   GET /api/invoice-details-settings
   Called by SIMetaFields.tsx on mount to load which fields
   are visible and what custom fields exist.
═══════════════════════════════════════════════════════════ */
export const getInvoiceDetailsSettings = async (_req: Request, res: Response) => {
  try {
    let settings = await (prisma as any).invoiceDetailsSettings.findFirst({
      orderBy: { id: "asc" },
    });

    // Auto-create with safe defaults if the table is empty
    if (!settings) {
      settings = await (prisma as any).invoiceDetailsSettings.create({
        data: {
          showChallan:           true,
          showDispatchedThrough: false,
          showEmailId:           true,
          showFinancedBy:        true,
          showSalesman:          true,
          showTransportName:     false,
          showWarranty:          true,
          showPO:                false,
          showEwayBill:          true,
          showVehicle:           false,
          customFields:          [],
        },
      });
    }

    return res.json({ success: true, data: settings });
  } catch (error: any) {
    console.error("❌ Get Invoice Details Settings Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   SAVE INVOICE DETAILS SETTINGS
   PUT /api/invoice-details-settings
   Called by InvoiceBuilderModel.tsx when user clicks Save.
   Body: {
     showChallan, showDispatchedThrough, showEmailId,
     showFinancedBy, showSalesman, showTransportName,
     showWarranty, showPO, showEwayBill, showVehicle,
     customFields: [{ label: string, value: string }]
   }
═══════════════════════════════════════════════════════════ */
export const saveInvoiceDetailsSettings = async (req: Request, res: Response) => {
  const {
    showChallan,
    showDispatchedThrough,
    showEmailId,
    showFinancedBy,
    showSalesman,
    showTransportName,
    showWarranty,
    showPO,
    showEwayBill,
    showVehicle,
    customFields,
  } = req.body;

  try {
    const existing = await (prisma as any).invoiceDetailsSettings.findFirst();

    const data = {
      showChallan:           showChallan           ?? true,
      showDispatchedThrough: showDispatchedThrough ?? false,
      showEmailId:           showEmailId           ?? true,
      showFinancedBy:        showFinancedBy        ?? true,
      showSalesman:          showSalesman          ?? true,
      showTransportName:     showTransportName     ?? false,
      showWarranty:          showWarranty          ?? true,
      showPO:                showPO                ?? false,
      showEwayBill:          showEwayBill          ?? true,
      showVehicle:           showVehicle           ?? false,
      // customFields must be an array: [{ label: "Field Name", value: "default" }]
      customFields: Array.isArray(customFields) ? customFields : [],
    };

    const result = existing
      ? await (prisma as any).invoiceDetailsSettings.update({
          where: { id: existing.id },
          data,
        })
      : await (prisma as any).invoiceDetailsSettings.create({ data });

    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("❌ Save Invoice Details Settings Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
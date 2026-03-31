import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { ProformaStatus } from "@prisma/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Generate next proforma number for a branch, e.g. "PI-2026-0004" */
async function generateProformaNumber(branchCode?: string | null): Promise<string> {
  const count = await prisma.proformaInvoice.count({
    where: branchCode ? { branchCode } : {},
  });
  const seq = String(count + 1).padStart(4, "0");
  const year = new Date().getFullYear();
  return `PI-${year}-${seq}`;
}

/** Parse a float safely */
const f = (v: any, fallback = 0) => (isFinite(Number(v)) ? Number(v) : fallback);

// ─── CREATE ───────────────────────────────────────────────────────────────────

export const createProformaInvoice = async (req: Request, res: Response) => {
  try {
    const {
      partyId,
      branchCode,
      proformaDate,
      dueDate,
      ewayBillNo,
      challanNo,
      financedBy,
      salesman,
      emailId,
      warrantyPeriod,
      poNumber,
      vehicleNo,
      dispatchedThrough,
      transportName,
      shippingAddress,
      items = [],
      additionalCharges = [],
      subTotal,
      taxableAmount,
      taxAmount,
      discountAmount,
      additionalChargesTotal,
      roundOff,
      totalAmount,
      discountType,
      discountPct,
      discountAmt,
      adjustType,
      adjustAmt,
      autoRoundOff,
      notes,
      termsConditions,
      showEmptySignatureBox,
      signatureUrl,
      customFieldValues,
    } = req.body;

    if (!totalAmount && totalAmount !== 0) {
      return res.status(400).json({ message: "totalAmount is required" });
    }

    const proformaNo = await generateProformaNumber(branchCode);

    const proforma = await prisma.proformaInvoice.create({
      data: {
        proformaNo,
        party: { connect: { id: Number(partyId) } },
        proformaDate: proformaDate ? new Date(proformaDate) : new Date(),
        validTill: dueDate ? new Date(dueDate) : null,
        ewayBillNo:        ewayBillNo        || null,
        challanNo:         challanNo         || null,
        financedBy:        financedBy        || null,
        salesman:          salesman          || null,
        emailId:           emailId           || null,
        warrantyPeriod:    warrantyPeriod    || null,
        poNumber:          poNumber          || null,
        vehicleNo:         vehicleNo         || null,
        dispatchedThrough: dispatchedThrough || null,
        transportName:     transportName     || null,
        shippingAddress:   shippingAddress   || null,
        subTotal:               subTotal               != null ? f(subTotal)               : null,
        taxableAmount:          taxableAmount           != null ? f(taxableAmount)           : null,
        taxAmount:              taxAmount               != null ? f(taxAmount)               : null,
        discountAmount:         discountAmount          != null ? f(discountAmount)          : null,
        additionalChargesTotal: additionalChargesTotal  != null ? f(additionalChargesTotal)  : null,
        roundOff:               roundOff                != null ? f(roundOff)                : null,
        totalAmount:            f(totalAmount),
        discountType:  discountType  || null,
        discountPct:   f(discountPct),
        discountAmt:   f(discountAmt),
        adjustType:    adjustType    || null,
        adjustAmt:     f(adjustAmt),
        autoRoundOff:  Boolean(autoRoundOff),
        customFieldValues: customFieldValues || {},
        notes:          notes          || null,
        termsConditions:termsConditions|| null,
        showEmptySignatureBox: Boolean(showEmptySignatureBox),
        signatureUrl:   signatureUrl   || null,
        status: ProformaStatus.DRAFT,
        items: {
          create: items.map((item: any) => ({
            productId:   item.productId   ? Number(item.productId)  : null,
            productName: item.productName || item.name || "Item",
            hsnSac:      item.hsnSac      || item.hsn  || null,
            description: item.description || null,
            quantity:    f(item.quantity  ?? item.qty, 1),
            unit:        item.unit        || "PCS",
            price:       f(item.price     ?? item.pricePerItem ?? item.rate, 0),
            discountPct: f(item.discountPct, 0),
            discountAmt: f(item.discountAmt, 0),
            taxLabel:    item.taxLabel    || "None",
            taxRate:     f(item.taxRate,  0),
            taxAmount:   item.taxAmount   != null ? f(item.taxAmount) : null,
            total:       f(item.total     ?? item.amount, 0),
            godownId:    item.godownId    ? Number(item.godownId) : null,
          })),
        },
        additionalCharges: {
          create: additionalCharges.map((c: any) => ({
            name:      c.name      || c.label || "",
            amount:    f(c.amount, 0),
            taxLabel:  c.taxLabel  || c.taxType || "No Tax Applicable",
            taxAmount: c.taxAmount != null ? f(c.taxAmount) : null,
          })),
        },
      },
      include: {
        party: { select: { id: true, name: true, partyName: true, mobileNumber: true, gstin: true, billingAddress: true } },
        items: true,
        additionalCharges: true,
      },
    });

    return res.status(201).json(proforma);
  } catch (error: any) {
    console.error("CREATE PROFORMA ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─── GET ALL ─────────────────────────────────────────────────────────────────

export const getProformaInvoices = async (req: Request, res: Response) => {
  try {
    const { branchCode, status, startDate, endDate } = req.query;

    const where: any = {};

    if (branchCode) where.branchCode = branchCode;

    if (status) {
      const statuses = String(status)
        .split(",")
        .map(s => s.toUpperCase());
      where.status = { in: statuses };
    }

    if (startDate || endDate) {
      where.proformaDate = {};
      if (startDate) where.proformaDate.gte = new Date(String(startDate));
      if (endDate)   where.proformaDate.lte = new Date(String(endDate));
    }

    const proformas = await prisma.proformaInvoice.findMany({
      where,
      select: {
        id: true,
        proformaNo: true,
        proformaDate: true,
        validTill: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        party: {
          select: {
            id: true,
            name: true,
            partyName: true,
            mobileNumber: true,
            gstin: true,
          },
        },
        items: {
          select: {
            id: true,
            productId: true,
            productName: true,
            hsnSac: true,
            description: true,
            quantity: true,
            unit: true,
            price: true,
            discountPct: true,
            discountAmt: true,
            taxLabel: true,
            taxRate: true,
            taxAmount: true,
            total: true,
          },
        },
        additionalCharges: true,
        discountType: true,
        discountPct: true,
        discountAmt: true,
        adjustType: true,
        adjustAmt: true,
        autoRoundOff: true,
        notes: true,
        termsConditions: true,
      },
      orderBy: { proformaDate: "desc" },
    });

    return res.json(proformas);
  } catch (error: any) {
    console.error("GET PROFORMAS ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─── GET ONE ─────────────────────────────────────────────────────────────────

export const getProformaInvoiceById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const proforma = await prisma.proformaInvoice.findUnique({
      where: { id: Number(id) },
      include: {
        party: {
          select: {
            id: true, name: true, partyName: true, mobileNumber: true,
            email: true, gstin: true, billingAddress: true, shippingAddress: true,
          },
        },
        items: true,
        additionalCharges: true,
      },
    });
    if (!proforma) return res.status(404).json({ message: "Proforma not found" });
    return res.json(proforma);
  } catch (error: any) {
    console.error("GET PROFORMA ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export const updateProformaInvoice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.proformaInvoice.findUnique({ where: { id: Number(id) } });
    if (!existing) return res.status(404).json({ message: "Proforma not found" });

    const {
      partyId,
      branchCode,
      proformaDate,
      dueDate,
      ewayBillNo, challanNo, financedBy, salesman, emailId, warrantyPeriod,
      poNumber, vehicleNo, dispatchedThrough, transportName, shippingAddress,
      items = [],
      additionalCharges = [],
      subTotal, taxableAmount, taxAmount, discountAmount,
      additionalChargesTotal, roundOff, totalAmount,
      discountType, discountPct, discountAmt,
      adjustType, adjustAmt, autoRoundOff,
      notes, termsConditions, showEmptySignatureBox, signatureUrl,
      customFieldValues,
      // FIX: allow status to be patched via the update endpoint as well
      status,
    } = req.body;

    // Delete existing items and charges before recreating
    await prisma.proformaInvoiceItem.deleteMany({ where: { proformaId: Number(id) } });
    await prisma.proformaAdditionalCharge.deleteMany({ where: { proformaId: Number(id) } });

    const updated = await prisma.proformaInvoice.update({
      where: { id: Number(id) },
      data: {
        partyId:           partyId          ? Number(partyId)          : existing.partyId,
        branchCode:        branchCode       ?? existing.branchCode,
        proformaDate:      proformaDate     ? new Date(proformaDate) : existing.proformaDate,
        validTill:         dueDate          ? new Date(dueDate) : existing.validTill,
        ewayBillNo, challanNo, financedBy, salesman, emailId, warrantyPeriod,
        poNumber, vehicleNo, dispatchedThrough, transportName, shippingAddress,
        subTotal:               subTotal               != null ? f(subTotal)               : existing.subTotal,
        taxableAmount:          taxableAmount           != null ? f(taxableAmount)           : existing.taxableAmount,
        taxAmount:              taxAmount               != null ? f(taxAmount)               : existing.taxAmount,
        discountAmount:         discountAmount          != null ? f(discountAmount)          : existing.discountAmount,
        additionalChargesTotal: additionalChargesTotal  != null ? f(additionalChargesTotal)  : existing.additionalChargesTotal,
        roundOff:               roundOff                != null ? f(roundOff)                : existing.roundOff,
        totalAmount:            totalAmount             != null ? f(totalAmount)             : existing.totalAmount,
        discountType, discountPct: f(discountPct), discountAmt: f(discountAmt),
        adjustType, adjustAmt: f(adjustAmt), autoRoundOff: Boolean(autoRoundOff),
        notes, termsConditions,
        showEmptySignatureBox: Boolean(showEmptySignatureBox),
        signatureUrl,
        customFieldValues: customFieldValues ?? existing.customFieldValues,
        // Only update status if explicitly provided (used by CreateSalesInvoice to mark CONVERTED)
        ...(status ? { status: status as ProformaStatus } : {}),

        items: {
          create: items.map((item: any) => ({
            productId:   item.productId   ? Number(item.productId)  : null,
            productName: item.productName || item.name || "Item",
            hsnSac:      item.hsnSac      || item.hsn  || null,
            description: item.description || null,
            quantity:    f(item.quantity  ?? item.qty, 1),
            unit:        item.unit        || "PCS",
            price:       f(item.price     ?? item.pricePerItem ?? item.rate, 0),
            discountPct: f(item.discountPct, 0),
            discountAmt: f(item.discountAmt, 0),
            taxLabel:    item.taxLabel    || "None",
            taxRate:     f(item.taxRate,  0),
            taxAmount:   item.taxAmount   != null ? f(item.taxAmount) : null,
            total:       f(item.total     ?? item.amount, 0),
            godownId:    item.godownId    ? Number(item.godownId) : null,
          })),
        },

        additionalCharges: {
          create: additionalCharges.map((c: any) => ({
            name:      c.name      || c.label || "",
            amount:    f(c.amount, 0),
            taxLabel:  c.taxLabel  || c.taxType || "No Tax Applicable",
            taxAmount: c.taxAmount != null ? f(c.taxAmount) : null,
          })),
        },
      },
      include: {
        party: { select: { id: true, name: true, partyName: true, mobileNumber: true } },
        items: true,
        additionalCharges: true,
      },
    });

    return res.json(updated);
  } catch (error: any) {
    console.error("UPDATE PROFORMA ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────

export const deleteProformaInvoice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.proformaInvoice.findUnique({ where: { id: Number(id) } });
    if (!existing) return res.status(404).json({ message: "Proforma not found" });
    if (existing.status === ProformaStatus.CONVERTED) {
      return res.status(400).json({ message: "Cannot delete a converted proforma invoice" });
    }

    await prisma.proformaInvoice.delete({ where: { id: Number(id) } });
    return res.json({ message: "Deleted successfully" });
  } catch (error: any) {
    console.error("DELETE PROFORMA ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─── PATCH STATUS ─────────────────────────────────────────────────────────────
//
// FIX: New dedicated status endpoint.
// CreateSalesInvoice calls PATCH /api/proforma-invoices/:id/status with
// { status: "CONVERTED" } AFTER the sales invoice is successfully saved.
// This means the proforma status only changes once the invoice is confirmed.

export const updateProformaStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: string };

    const validStatuses = Object.values(ProformaStatus);
    if (!validStatuses.includes(status as ProformaStatus)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }

    const existing = await prisma.proformaInvoice.findUnique({ where: { id: Number(id) } });
    if (!existing) return res.status(404).json({ message: "Proforma not found" });

    const updated = await prisma.proformaInvoice.update({
      where: { id: Number(id) },
      data: { status: status as ProformaStatus },
    });

    return res.json(updated);
  } catch (error: any) {
    console.error("UPDATE PROFORMA STATUS ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─── CONVERT TO SALES INVOICE (data-only — NO status change) ─────────────────
//
// FIX: This endpoint NO LONGER marks the proforma as CONVERTED.
//
// It only returns the full proforma data shaped for CreateSalesInvoice.
// The status flip to CONVERTED happens in CreateSalesInvoice.handleSave()
// which calls PATCH /api/proforma-invoices/:id/status AFTER the invoice
// is successfully saved.
//
// This prevents the proforma from being marked CONVERTED if the user
// navigates away from the sales invoice form without saving.

export const convertProformaToInvoice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const proforma = await prisma.proformaInvoice.findUnique({
      where: { id: Number(id) },
      include: {
        party: {
          select: {
            id: true, name: true, partyName: true, mobileNumber: true,
            email: true, gstin: true, billingAddress: true, shippingAddress: true,
            openingBalance: true, openingBalanceType: true,
          },
        },
        items: true,
        additionalCharges: true,
      },
    });

    if (!proforma) return res.status(404).json({ message: "Proforma not found" });
    if (proforma.status === ProformaStatus.CONVERTED) {
      return res.status(400).json({
        message: "Already converted",
        convertedInvoiceId: (proforma as any).convertedToInvoiceId ?? null,
      });
    }

    // Shape the response so the frontend can directly populate CreateSalesInvoice state
    const payload = {
      proformaId:     proforma.id,
      proformaNumber: proforma.proformaNo,
      party: proforma.party
        ? {
            id:             proforma.party.id,
            name:           proforma.party.name,
            partyName:      proforma.party.partyName,
            mobile:         proforma.party.mobileNumber || "-",
            email:          proforma.party.email,
            gstin:          proforma.party.gstin,
            billingAddress: proforma.party.billingAddress,
            shippingAddress:proforma.party.shippingAddress,
            balance:        proforma.party.openingBalance ? Number(proforma.party.openingBalance) : 0,
          }
        : null,
      invoiceDate:    proforma.proformaDate.toISOString().split("T")[0],
      dueDate:        proforma.validTill ? proforma.validTill.toISOString().split("T")[0] : null,
      ewayBillNo:     proforma.ewayBillNo,
      challanNo:      proforma.challanNo,
      financedBy:     proforma.financedBy,
      salesman:       proforma.salesman,
      emailId:        proforma.emailId,
      warrantyPeriod: proforma.warrantyPeriod,
      poNumber:       proforma.poNumber,
      vehicleNo:      proforma.vehicleNo,
      dispatchedThrough: proforma.dispatchedThrough,
      transportName:  proforma.transportName,
      shippingAddress:proforma.shippingAddress,
      lineItems: proforma.items.map(item => ({
        rowId:       `proforma-${item.id}`,
        // FIX: Only include productId/itemId when it's a real linked product.
        // Sending null productId causes Prisma to crash in the invoice controller.
        ...(item.productId != null ? { productId: Number(item.productId), itemId: Number(item.productId) } : {}),
        name:        item.productName,
        description: item.description || "",
        hsn:         item.hsnSac || "",
        qty:         Number(item.quantity),
        unit:        item.unit || "PCS",
        price:       Number(item.price),
        pricePerItem:Number(item.price),
        discountPct: item.discountPct || 0,
        discountAmt: item.discountAmt || 0,
        taxLabel:    item.taxLabel || "None",
        taxRate:     item.taxRate  || 0,
        amount:      Number(item.total),
        total:       Number(item.total),
      })),
      additionalCharges: proforma.additionalCharges.map(c => ({
        id:       c.id,
        label:    c.name,
        name:     c.name,
        amount:   Number(c.amount),
        taxType:  c.taxLabel || "No Tax Applicable",
        taxLabel: c.taxLabel || "No Tax Applicable",
      })),
      subTotal:      proforma.subTotal      ? Number(proforma.subTotal)      : 0,
      taxAmount:     proforma.taxAmount     ? Number(proforma.taxAmount)     : 0,
      discountAmount:proforma.discountAmount? Number(proforma.discountAmount): 0,
      totalAmount:   Number(proforma.totalAmount),
      discountType:  proforma.discountType  || "Discount After Tax",
      discountPct:   proforma.discountPct   || 0,
      discountAmt:   proforma.discountAmt   || 0,
      adjustType:    proforma.adjustType    || "+ Add",
      adjustAmt:     proforma.adjustAmt     || 0,
      autoRoundOff:  proforma.autoRoundOff,
      notes:           proforma.notes           || "",
      termsConditions: proforma.termsConditions || "",
      customFieldValues: proforma.customFieldValues || {},
    };
    return res.json(payload);
  } catch (error: any) {
    console.error("CONVERT PROFORMA ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};
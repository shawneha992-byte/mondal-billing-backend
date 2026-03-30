// controllers/deliveryChallanController.ts
import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { DeliveryChallanStatus } from "@prisma/client";

// ─── Helper: build challan number string ─────────────────────────────────────
function buildChallanNo(settings: { enablePrefix: boolean; prefix?: string | null; sequenceNumber: number }): string {
  const seq = String(settings.sequenceNumber).padStart(5, "0");
  if (settings.enablePrefix && settings.prefix?.trim()) {
    return `${settings.prefix.trim()}${seq}`;
  }
  return `DC-${seq}`;
}

// ─── Helper: compute item total ───────────────────────────────────────────────
function computeItemTotal(qty: number, price: number, discPct: number, discAmt: number, taxRate: number) {
  const raw = qty * price;
  const afterDisc = raw - (raw * discPct / 100) - discAmt;
  const taxAmount = afterDisc * taxRate / 100;
  return { total: Math.max(0, afterDisc + taxAmount), taxAmount };
}

// ── Helper: include shape for items WITH stock ────────────────────────────────
// Reused in getChallanById, listChallans, and duplicateChallan so every
// endpoint that returns challan data also returns product stock.
const ITEM_INCLUDE_WITH_STOCK = {
  product: {
    select: {
      id: true,
      name: true,
      ProductStock: {
        select: { currentStock: true, godownId: true },
      },
    },
  },
  godown: true,
} as const;

// ══════════════════════════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/delivery-challan/settings */
export async function getChallanSettings(req: Request, res: Response) {
  try {
    const branchCode = (req as any).user?.branch_code ?? null;
    let settings = await prisma.deliveryChallanSettings.findFirst({ where: { branchCode } });
    if (!settings) {
      settings = await prisma.deliveryChallanSettings.create({
        data: { branchCode, prefix: "DC-", sequenceNumber: 1, enablePrefix: false },
      });
    }
    return res.json(settings);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

/** PUT /api/delivery-challan/settings */
export async function saveChallanSettings(req: Request, res: Response) {
  try {
    const branchCode = (req as any).user?.branch_code ?? null;
    const { prefix, sequenceNumber, enablePrefix, showItemImage, priceHistory } = req.body;

    let existing = await prisma.deliveryChallanSettings.findFirst({ where: { branchCode } });
    let settings;
    if (existing) {
      settings = await prisma.deliveryChallanSettings.update({
        where: { id: existing.id },
        data: { prefix, sequenceNumber: Number(sequenceNumber), enablePrefix, showItemImage, priceHistory },
      });
    } else {
      settings = await prisma.deliveryChallanSettings.create({
        data: { branchCode, prefix, sequenceNumber: Number(sequenceNumber), enablePrefix, showItemImage, priceHistory },
      });
    }
    return res.json(settings);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/delivery-challan/next-number – preview only, does NOT increment */
export async function getNextChallanNumber(req: Request, res: Response) {
  try {
    const branchCode = (req as any).user?.branch_code ?? null;
    const settings = await prisma.deliveryChallanSettings.findFirst({ where: { branchCode } });
    const challanNo = buildChallanNo(settings ?? { enablePrefix: false, sequenceNumber: 1 });
    return res.json({ challanNo });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  LIST
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/delivery-challan */
export async function listChallans(req: Request, res: Response) {
  try {
    const branchCode = (req as any).user?.branch_code ?? undefined;
    const { status, from, to, search, page = "1", limit = "50" } = req.query as Record<string, string>;

    const where: any = {};

    // STATUS
    if (status && status !== "ALL") {
      where.status = String(status).toUpperCase();
    }

    // DATE
    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);

      if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
        fromDate.setHours(0, 0, 0, 0);
        toDate.setHours(23, 59, 59, 999);

        where.challanDate = {
          gte: fromDate,
          lte: toDate,
        };
      }
    }

    // SEARCH
    if (search) {
      where.OR = [
        { challanNo: { contains: search, mode: "insensitive" } },
        { party: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [total, challans] = await Promise.all([
      prisma.deliveryChallan.count({ where }),
      prisma.deliveryChallan.findMany({
        where,
        orderBy: { challanDate: "desc" },
        skip,
        take: Number(limit),
        include: {
          party: {
            select: {
              id: true,
              name: true,
              mobileNumber: true,
              billingAddress: true,
              shippingAddress: true,
              gstin: true,
            },
          },
          // FIX: include ProductStock so frontend can display current stock
          items: { include: ITEM_INCLUDE_WITH_STOCK },
          additionalCharges: true,
        },
      }),
    ]);

    return res.json({ total, challans });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  GET ONE
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/delivery-challan/:id */
export async function getChallanById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const challan = await prisma.deliveryChallan.findUnique({
      where: { id },
      include: {
        party: true,
        // FIX: include ProductStock so stock column is populated in the Add Items modal
        items: { include: ITEM_INCLUDE_WITH_STOCK },
        additionalCharges: true,
        invoices: { select: { id: true, invoiceNo: true, status: true } },
      },
    });
    if (!challan) return res.status(404).json({ error: "Challan not found" });
    return res.json(challan);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CREATE
// ══════════════════════════════════════════════════════════════════════════════

/** POST /api/delivery-challan */
export async function createChallan(req: Request, res: Response) {
  try {
    const branchCode = (req as any).user?.branch_code ?? null;
    const {
      partyId,
      challanDate,
      eWayBillNo, challanNoRef, financedBy, salesman, emailId,
      warrantyPeriod, poNumber, vehicleNo, dispatchedThrough, transportName,
      shippingAddress,
      discountType, discountPct, discountAmt,
      autoRoundOff, roundOffAmt,
      customFieldValues,
      notes, termsConditions,
      showEmptySignatureBox, signatureUrl,
      items = [],
      additionalCharges = [],
    } = req.body;

    if (!partyId) return res.status(400).json({ error: "partyId is required" });
    if (!items.length) return res.status(400).json({ error: "At least one item is required" });

    // ── All inside one transaction: generate number + create + increment seq ──
    const challan = await prisma.$transaction(async (tx) => {
      // Lock & fetch settings inside transaction to prevent race
      const settingsRec = await tx.deliveryChallanSettings.findFirst({
        where: { branchCode },
      });

      const challanNo = buildChallanNo(settingsRec ?? { enablePrefix: false, sequenceNumber: 1 });

      // Check uniqueness (safety)
      const existing = await tx.deliveryChallan.findUnique({ where: { challanNo } });
      if (existing) throw new Error(`Challan number ${challanNo} already exists. Please refresh and try again.`);

      // ── Calculate totals ──────────────────────────────────────────────────
      let subTotal = 0, taxAmountTotal = 0;
      const itemRows = items.map((i: any) => {
        const { total, taxAmount } = computeItemTotal(
          Number(i.quantity), Number(i.price),
          Number(i.discountPct ?? 0), Number(i.discountAmt ?? 0),
          Number(i.taxRate ?? 0),
        );
        subTotal += Number(i.quantity) * Number(i.price);
        taxAmountTotal += taxAmount;
        return {
          productId:   i.productId ? Number(i.productId) : null,
          productName: i.productName || i.name || "Item",
          hsnSac:      i.hsnSac || null,
          description: i.description || null,
          quantity:    Number(i.quantity),
          unit:        i.unit || "PCS",
          price:       Number(i.price),
          discountPct: Number(i.discountPct ?? 0),
          discountAmt: Number(i.discountAmt ?? 0),
          taxLabel:    i.taxLabel || "None",
          taxRate:     Number(i.taxRate ?? 0),
          taxAmount:   taxAmount,
          total:       total,
          godownId:    i.godownId ? Number(i.godownId) : null,
        };
      });

      const chargesTotal = (additionalCharges as any[]).reduce(
        (s: number, c: any) => s + Number(c.amount ?? 0), 0
      );
      const discAmt = Number(discountAmt ?? 0);
      const discPct = Number(discountPct ?? 0);
      const discValue = discPct > 0 ? subTotal * discPct / 100 : discAmt;
      const afterDisc = Math.max(0, subTotal + chargesTotal - discValue);
      const roundOff = autoRoundOff
        ? Math.ceil(afterDisc + taxAmountTotal) - (afterDisc + taxAmountTotal)
        : Number(roundOffAmt ?? 0);
      const totalAmount = afterDisc + taxAmountTotal + roundOff;

      const created = await tx.deliveryChallan.create({
        data: {
          challanNo,
          partyId:           Number(partyId),
          branchCode,
          challanDate:       challanDate ? new Date(challanDate) : new Date(),
          eWayBillNo:        eWayBillNo        || null,
          challanNoRef:      challanNoRef      || null,
          financedBy:        financedBy        || null,
          salesman:          salesman          || null,
          emailId:           emailId           || null,
          warrantyPeriod:    warrantyPeriod    || null,
          poNumber:          poNumber          || null,
          vehicleNo:         vehicleNo         || null,
          dispatchedThrough: dispatchedThrough || null,
          transportName:     transportName     || null,
          shippingAddress:   shippingAddress   || null,
          discountType:      discountType      || null,
          discountPct:       discPct,
          discountAmt:       discAmt,
          autoRoundOff:      Boolean(autoRoundOff),
          roundOffAmt:       Number(roundOffAmt ?? 0),
          customFieldValues: customFieldValues || {},
          notes:             notes             || null,
          termsConditions:   termsConditions   || null,
          showEmptySignatureBox: Boolean(showEmptySignatureBox),
          signatureUrl:      signatureUrl      || null,
          subTotal,
          taxAmount:         taxAmountTotal,
          discountAmount:    discValue,
          additionalChargesTotal: chargesTotal,
          roundOff,
          totalAmount,
          status: "OPEN",
          items: { create: itemRows },
          additionalCharges: {
            create: (additionalCharges as any[]).map((c: any) => ({
              name:      c.label || c.name || "",
              amount:    Number(c.amount ?? 0),
              taxLabel:  c.taxLabel || "No Tax Applicable",
              taxAmount: null,
            })),
          },
        },
        include: {
          party: true,
          items: { include: ITEM_INCLUDE_WITH_STOCK },
          additionalCharges: true,
        },
      });

      // Increment sequence
      if (settingsRec) {
        await tx.deliveryChallanSettings.update({
          where: { id: settingsRec.id },
          data: { sequenceNumber: { increment: 1 } },
        });
      }

      return created;
    });

    return res.status(201).json(challan);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  UPDATE
// ══════════════════════════════════════════════════════════════════════════════

/** PUT /api/delivery-challan/:id */
export async function updateChallan(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const {
      partyId,
      challanDate,
      eWayBillNo, challanNoRef, financedBy, salesman, emailId,
      warrantyPeriod, poNumber, vehicleNo, dispatchedThrough, transportName,
      shippingAddress,
      discountType, discountPct, discountAmt,
      autoRoundOff, roundOffAmt,
      customFieldValues,
      notes, termsConditions,
      showEmptySignatureBox, signatureUrl,
      items = [],
      additionalCharges = [],
    } = req.body;

    const existing = await prisma.deliveryChallan.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: "Challan not found" });

    // ── Recalculate totals from the new items ─────────────────────────────
    let subTotal = 0, taxAmountTotal = 0;
    const itemRows = items.map((i: any) => {
      const { total, taxAmount } = computeItemTotal(
        Number(i.quantity), Number(i.price),
        Number(i.discountPct ?? 0), Number(i.discountAmt ?? 0),
        Number(i.taxRate ?? 0),
      );
      subTotal += Number(i.quantity) * Number(i.price);
      taxAmountTotal += taxAmount;
      return {
        productId:   i.productId ? Number(i.productId) : null,
        productName: i.productName || i.name || "Item",
        hsnSac:      i.hsnSac || null,
        description: i.description || null,
        quantity:    Number(i.quantity),
        unit:        i.unit || "PCS",
        price:       Number(i.price),
        discountPct: Number(i.discountPct ?? 0),
        discountAmt: Number(i.discountAmt ?? 0),
        taxLabel:    i.taxLabel || "None",
        taxRate:     Number(i.taxRate ?? 0),
        taxAmount,
        total,
        godownId:    i.godownId ? Number(i.godownId) : null,
      };
    });

    const chargesTotal = (additionalCharges as any[]).reduce(
      (s: number, c: any) => s + Number(c.amount ?? 0), 0
    );
    const discAmt = Number(discountAmt ?? 0);
    const discPct = Number(discountPct ?? 0);
    const discValue = discPct > 0 ? subTotal * discPct / 100 : discAmt;
    const afterDisc = Math.max(0, subTotal + chargesTotal - discValue);
    const roundOff = autoRoundOff
      ? Math.ceil(afterDisc + taxAmountTotal) - (afterDisc + taxAmountTotal)
      : Number(roundOffAmt ?? 0);
    const totalAmount = afterDisc + taxAmountTotal + roundOff;

    const updated = await prisma.$transaction(async (tx) => {
      // Delete old items and charges, then recreate
      await tx.deliveryChallanItem.deleteMany({ where: { challanId: id } });
      await tx.deliveryChallanAdditionalCharge.deleteMany({ where: { challanId: id } });

      return tx.deliveryChallan.update({
        where: { id },
        data: {
          partyId:           partyId ? Number(partyId) : existing.partyId,
          challanDate:       challanDate ? new Date(challanDate) : existing.challanDate,
          eWayBillNo:        eWayBillNo        ?? existing.eWayBillNo,
          challanNoRef:      challanNoRef      ?? existing.challanNoRef,
          financedBy:        financedBy        ?? existing.financedBy,
          salesman:          salesman          ?? existing.salesman,
          emailId:           emailId           ?? existing.emailId,
          warrantyPeriod:    warrantyPeriod    ?? existing.warrantyPeriod,
          poNumber:          poNumber          ?? existing.poNumber,
          vehicleNo:         vehicleNo         ?? existing.vehicleNo,
          dispatchedThrough: dispatchedThrough ?? existing.dispatchedThrough,
          transportName:     transportName     ?? existing.transportName,
          shippingAddress:   shippingAddress   ?? existing.shippingAddress,
          discountType:      discountType      ?? existing.discountType,
          discountPct:       discPct,
          discountAmt:       discAmt,
          autoRoundOff:      Boolean(autoRoundOff),
          roundOffAmt:       Number(roundOffAmt ?? 0),
          customFieldValues: customFieldValues ?? existing.customFieldValues,
          notes:             notes             ?? existing.notes,
          termsConditions:   termsConditions   ?? existing.termsConditions,
          showEmptySignatureBox: Boolean(showEmptySignatureBox),
          signatureUrl:      signatureUrl      ?? existing.signatureUrl,
          subTotal,
          taxAmount:         taxAmountTotal,
          discountAmount:    discValue,
          additionalChargesTotal: chargesTotal,
          roundOff,
          totalAmount,
          items: { create: itemRows },
          additionalCharges: {
            create: (additionalCharges as any[]).map((c: any) => ({
              name:      c.label || c.name || "",
              amount:    Number(c.amount ?? 0),
              taxLabel:  c.taxLabel || "No Tax Applicable",
              taxAmount: null,
            })),
          },
        },
        include: {
          party: true,
          items: { include: ITEM_INCLUDE_WITH_STOCK },
          additionalCharges: true,
        },
      });
    });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  DELETE
// ══════════════════════════════════════════════════════════════════════════════

/** DELETE /api/delivery-challan/:id */
export async function deleteChallan(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    await prisma.deliveryChallan.delete({ where: { id } });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  STATUS
// ══════════════════════════════════════════════════════════════════════════════

/** PATCH /api/delivery-challan/:id/status */
export async function updateChallanStatus(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const { status } = req.body as { status: DeliveryChallanStatus };
    if (!["OPEN", "CLOSED", "CANCELLED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const challan = await prisma.deliveryChallan.update({
      where: { id },
      data: { status },
    });
    return res.json(challan);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CONVERT TO INVOICE  (data-only — NO status change)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/delivery-challan/:id/convert-to-invoice
 *
 * FIX: This endpoint NO LONGER marks the challan as CLOSED.
 *
 * It only returns the challan data shaped for CreateSalesInvoice.
 * The status flip to CLOSED happens in CreateSalesInvoice.handleSave()
 * via a PATCH to /:id/status AFTER the invoice is successfully saved.
 *
 * This prevents the challan from being marked CLOSED if the user
 * navigates away from the sales invoice form without saving.
 */
export async function convertToInvoice(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const challan = await prisma.deliveryChallan.findUnique({
      where: { id },
      include: {
        party: true,
        items: { include: { product: true } },
        additionalCharges: true,
      },
    });
    if (!challan) return res.status(404).json({ error: "Challan not found" });
    if (challan.status === "CANCELLED") {
      return res.status(400).json({ error: "Cannot convert a cancelled challan" });
    }
    // NOTE: We allow converting a CLOSED challan (re-convert use-case)
    // The frontend can decide whether to block this via UI.

    // Build fromChallan payload (matches what CreateSalesInvoice expects via route state)
    const fromChallan = {
      party: {
        id:             challan.party.id,
        name:           challan.party.name,
        mobile:         challan.party.mobileNumber ?? "",
        balance:        0,
        billingAddress: challan.party.billingAddress ?? "",
        shippingAddress:challan.shippingAddress ?? challan.party.shippingAddress ?? "",
        gstin:          challan.party.gstin ?? "",
      },
      billItems: challan.items.map((i) => ({
        rowId:       `row-${Date.now()}-${i.id}`,
        itemId:      i.productId ?? i.id,
        name:        i.productName,
        description: i.description ?? "",
        hsn:         i.hsnSac ?? "",
        qty:         Number(i.quantity),
        unit:        i.unit ?? "PCS",
        price:       Number(i.price),
        discountPct: i.discountPct ?? 0,
        discountAmt: i.discountAmt ?? 0,
        taxLabel:    i.taxLabel ?? "None",
        taxRate:     i.taxRate  ?? 0,
        amount:      Number(i.total),
      })),
      additionalCharges: challan.additionalCharges.map((c) => ({
        id:       `c-${c.id}`,
        label:    c.name,
        amount:   Number(c.amount),
        taxLabel: c.taxLabel ?? "No Tax Applicable",
      })),
      discountType:    challan.discountType === "Before Tax" ? "Discount Before Tax" : "Discount After Tax",
      discountPct:     challan.discountPct    ?? 0,
      discountAmt:     challan.discountAmt    ?? 0,
      roundOff:        challan.autoRoundOff   ? "+Add" : "none",
      roundOffAmt:     challan.roundOffAmt    ?? 0,
      notes:           challan.notes          ?? "",
      termsConditions: challan.termsConditions ?? "",
      challanNo:       challan.challanNo,
      // FIX: sourceChallanId is returned so the frontend can pass it back
      // via fromChallanId and close the challan after a successful invoice save.
      sourceChallanId: challan.id,
    };

    return res.json({ fromChallan });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  DUPLICATE
// ══════════════════════════════════════════════════════════════════════════════

/** POST /api/delivery-challan/:id/duplicate */
export async function duplicateChallan(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const orig = await prisma.deliveryChallan.findUnique({
      where: { id },
      include: { items: true, additionalCharges: true },
    });
    if (!orig) return res.status(404).json({ error: "Challan not found" });

    const branchCode = orig.branchCode;

    const dup = await prisma.$transaction(async (tx) => {
      const settingsRec = await tx.deliveryChallanSettings.findFirst({ where: { branchCode } });
      const challanNo = buildChallanNo(settingsRec ?? { enablePrefix: false, sequenceNumber: 1 });

      const created = await tx.deliveryChallan.create({
        data: {
          challanNo,
          partyId:               orig.partyId,
          branchCode:            orig.branchCode,
          challanDate:           new Date(),
          eWayBillNo:            orig.eWayBillNo,
          challanNoRef:          orig.challanNoRef,
          financedBy:            orig.financedBy,
          salesman:              orig.salesman,
          emailId:               orig.emailId,
          warrantyPeriod:        orig.warrantyPeriod,
          poNumber:              orig.poNumber,
          vehicleNo:             orig.vehicleNo,
          dispatchedThrough:     orig.dispatchedThrough,
          transportName:         orig.transportName,
          shippingAddress:       orig.shippingAddress,
          subTotal:              orig.subTotal,
          taxAmount:             orig.taxAmount,
          discountAmount:        orig.discountAmount,
          additionalChargesTotal: orig.additionalChargesTotal,
          roundOff:              orig.roundOff,
          totalAmount:           orig.totalAmount,
          discountType:          orig.discountType,
          discountPct:           orig.discountPct,
          discountAmt:           orig.discountAmt,
          autoRoundOff:          orig.autoRoundOff,
          roundOffAmt:           orig.roundOffAmt,
          customFieldValues:     orig.customFieldValues as any,
          notes:                 orig.notes,
          termsConditions:       orig.termsConditions,
          showEmptySignatureBox: orig.showEmptySignatureBox,
          signatureUrl:          orig.signatureUrl,
          status:                "OPEN",
          items: {
            create: orig.items.map((i) => ({
              productId:   i.productId,
              productName: i.productName,
              hsnSac:      i.hsnSac,
              description: i.description,
              quantity:    i.quantity,
              unit:        i.unit,
              price:       i.price,
              discountPct: i.discountPct,
              discountAmt: i.discountAmt,
              taxLabel:    i.taxLabel,
              taxRate:     i.taxRate,
              taxAmount:   i.taxAmount,
              total:       i.total,
              godownId:    i.godownId,
            })),
          },
          additionalCharges: {
            create: orig.additionalCharges.map((c) => ({
              name:      c.name,
              amount:    c.amount,
              taxLabel:  c.taxLabel,
              taxAmount: c.taxAmount,
            })),
          },
        },
        include: { items: { include: ITEM_INCLUDE_WITH_STOCK }, additionalCharges: true, party: true },
      });

      if (settingsRec) {
        await tx.deliveryChallanSettings.update({
          where: { id: settingsRec.id },
          data: { sequenceNumber: { increment: 1 } },
        });
      }

      return created;
    });

    return res.status(201).json(dup);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
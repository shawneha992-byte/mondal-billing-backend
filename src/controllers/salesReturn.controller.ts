// salesReturn_controller.ts

import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { InvoiceStatus, StockRefType } from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// CREATE SALES RETURN
// • Restores stock with SALES_RETURN ref type
// • Writes StockLedger entry per item
// ─────────────────────────────────────────────────────────────
export const createSalesReturn = async (req: Request, res: Response) => {
  try {
    const { invoiceId, partyId, items = [], reason, notes } = req.body;

    if (!invoiceId || !partyId || !items.length) {
      return res.status(400).json({
        success: false,
        message: "invoiceId, partyId, and at least one item are required",
      });
    }

    const result = await prisma.$transaction(async (tx) => {

      // ── 1. Verify invoice ──────────────────────────────────────────────────
      const invoice = await tx.invoice.findUnique({
        where:   { id: Number(invoiceId) },
        include: { items: true },
      });

      if (!invoice)
        throw new Error("Invoice not found");
      if (invoice.partyId !== Number(partyId))
        throw new Error("Invoice does not belong to this party");
      if (invoice.status === InvoiceStatus.CANCELLED)
        throw new Error("Cannot create return for a cancelled invoice");

      // ── 2. Calculate totalAmount ───────────────────────────────────────────
      const totalAmount = items.reduce(
        (sum: number, item: any) =>
          sum + Number(item.quantity) * Number(item.price),
        0
      );

      // ── 3. Create SalesReturn record ───────────────────────────────────────
      const salesReturn = await tx.salesReturn.create({
        data: {
          invoiceId:    Number(invoiceId),
          partyId:      Number(partyId),
          totalAmount,
          reason:       reason || null,
          notes:        notes  || null,
          returnStatus: "Refunded",
          items: {
            create: items.map((item: any) => ({
              productId: Number(item.productId),
              quantity:  Number(item.quantity),
              price:     Number(item.price),
              godownId:  item.godownId ? Number(item.godownId) : null,
            })),
          },
        },
        include: {
          items:   { include: { product: true } },
          party:   true,
          invoice: true,
        },
      });

      // ── 4. Restore stock for each returned item ────────────────────────────
      for (const item of items) {
        const productId = Number(item.productId);
        const qty       = Number(item.quantity);
        const godownId  = item.godownId ? Number(item.godownId) : null;

        // Prefer godown-specific stock row; fall back to first row for product
        let stock = godownId
          ? await tx.productStock.findUnique({
              where: { productId_godownId: { productId, godownId } },
            })
          : await tx.productStock.findFirst({ where: { productId } });

        if (!stock) {
          // No stock row yet — auto-create against the first available godown
          const fallbackGodown = await tx.godown.findFirst();
          stock = await tx.productStock.create({
            data: {
              productId,
              godownId:     godownId ?? fallbackGodown?.godown_id ?? 1,
              openingStock: 0,
              currentStock: 0,
              asOfDate:     new Date(),
            },
          });
        }

        const currentBalance = Number(stock.currentStock ?? stock.openingStock ?? 0);
        const newBalance     = currentBalance + qty;

        // Update ProductStock
        await tx.productStock.update({
          where: { id: stock.id },
          data:  { currentStock: newBalance },
        });

        // Write StockLedger entry — SALES_RETURN is the correct enum value
        await tx.stockLedger.create({
          data: {
            productId,
            godownId:    stock.godownId,
            date:        new Date(),
            refType:     StockRefType.SALES_RETURN,
            refId:       Number(salesReturn.id),
            quantityIn:  qty,
            quantityOut: 0,
            balance:     newBalance,
            remarks:     `Sales Return #${salesReturn.id}`,
          },
        });
      }

      // ── 5. Update invoice status ───────────────────────────────────────────
      let newStatus: InvoiceStatus = invoice.status;
      if      (invoice.status === InvoiceStatus.OPEN) newStatus = InvoiceStatus.CANCELLED;
      else if (invoice.status === InvoiceStatus.PAID) newStatus = InvoiceStatus.OPEN;
      // PARTIAL → leave as-is

      await tx.invoice.update({
        where: { id: Number(invoiceId) },
        data:  { status: newStatus },
      });

      return salesReturn;
    });

    return res.status(201).json({ success: true, data: result });

  } catch (error: any) {
    console.error("Create Sales Return Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
    });
  }
};

// ─────────────────────────────────────────────────────────────
// GET ALL SALES RETURNS
// Supports ?partyId= ?invoiceId= ?page= ?limit=
// ─────────────────────────────────────────────────────────────
export const getSalesReturns = async (req: Request, res: Response) => {
  try {
    const { partyId, invoiceId, page = "1", limit = "50" } = req.query;

    const where: any = {};
    if (partyId)   where.partyId   = Number(partyId);
    if (invoiceId) where.invoiceId = Number(invoiceId);

    const skip = (Number(page) - 1) * Number(limit);

    const [data, total] = await Promise.all([
      prisma.salesReturn.findMany({
        where,
        include: {
          party:   true,
          invoice: true,
          items:   { include: { product: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
      }),
      prisma.salesReturn.count({ where }),
    ]);

    return res.json({
      success: true,
      data,
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit)),
    });

  } catch (error: any) {
    console.error("Get Sales Returns Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET SINGLE SALES RETURN
// ─────────────────────────────────────────────────────────────
export const getSalesReturnById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const data = await prisma.salesReturn.findUnique({
      where:   { id: Number(id) },
      include: {
        party:   true,
        invoice: true,
        items:   { include: { product: true } },
      },
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Sales Return not found",
      });
    }

    return res.json({ success: true, data });

  } catch (error: any) {
    console.error("Get Sales Return By ID Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE SALES RETURN
// • Reverses stock (removes what was returned)
// • Writes reversal StockLedger entry
// • Restores invoice status to OPEN if it was CANCELLED
// ─────────────────────────────────────────────────────────────
export const deleteSalesReturn = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.$transaction(async (tx) => {

      const sr = await tx.salesReturn.findUnique({
        where:   { id: Number(id) },
        include: { items: true },
      });
      if (!sr) throw new Error("Sales Return not found");

      // Reverse stock for every returned item
      for (const item of sr.items) {
        const stock = item.godownId
          ? await tx.productStock.findUnique({
              where: {
                productId_godownId: {
                  productId: item.productId,
                  godownId:  item.godownId!,
                },
              },
            })
          : await tx.productStock.findFirst({
              where: { productId: item.productId },
            });

        if (stock) {
          const newBalance = Math.max(
            0,
            Number(stock.currentStock ?? 0) - Number(item.quantity)
          );

          await tx.productStock.update({
            where: { id: stock.id },
            data:  { currentStock: newBalance },
          });

          await tx.stockLedger.create({
            data: {
              productId:   item.productId,
              godownId:    stock.godownId,
              date:        new Date(),
              refType:     StockRefType.ADJUSTMENT,
              refId:       Number(id),
              quantityIn:  0,
              quantityOut: Number(item.quantity),
              balance:     newBalance,
              remarks:     `Reversal of Sales Return #${id}`,
            },
          });
        }
      }

      // Restore invoice to OPEN if it was CANCELLED by this return
      const inv = await tx.invoice.findUnique({ where: { id: sr.invoiceId } });
      if (inv && inv.status === InvoiceStatus.CANCELLED) {
        await tx.invoice.update({
          where: { id: sr.invoiceId },
          data:  { status: InvoiceStatus.OPEN },
        });
      }

      await tx.salesReturn.delete({ where: { id: Number(id) } });
    });

    return res.json({
      success: true,
      message: "Sales Return deleted successfully",
    });

  } catch (error: any) {
    console.error("Delete Sales Return Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET AVAILABLE INVOICES FOR RETURN
//
// FIX 1 – Only returns invoices for the given partyId
// FIX 2 – Excludes CANCELLED invoices
// FIX 3 – Excludes invoices that already have a SalesReturn
// FIX 4 – Returns every invoice meta-field + customFieldValues
//          so the frontend can auto-populate challan, salesman,
//          custom fields (e.g. WWW=90), etc.
// ─────────────────────────────────────────────────────────────
export const getAvailableInvoicesForReturn = async (
  req: Request,
  res: Response
) => {
  try {
    const { partyId } = req.query;

    if (!partyId) {
      return res.status(400).json({
        success: false,
        message: "partyId query param is required",
      });
    }

    // Collect invoiceIds that already have at least one SalesReturn for this party
    const alreadyReturned = await prisma.salesReturn.findMany({
      where:  { partyId: Number(partyId) },
      select: { invoiceId: true },
    });
    const excludedInvoiceIds = [
      ...new Set(alreadyReturned.map((r) => r.invoiceId)),
    ];

    const invoices = await prisma.invoice.findMany({
      where: {
        partyId: Number(partyId),
        status:  { not: "CANCELLED" },
        // Exclude invoices that already have a return
        ...(excludedInvoiceIds.length > 0
          ? { id: { notIn: excludedInvoiceIds } }
          : {}),
      },
      include: {
        items: { include: { product: true } },
        party: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Shape the response — return ALL meta fields so the frontend
    // can populate challan, salesman, custom fields, etc. automatically
    const data = invoices.map((inv: any) => ({
      id:                inv.id,
      invoiceNo:         inv.invoiceNo,
      invoiceDate:       inv.invoiceDate,
      totalAmount:       Number(inv.totalAmount),
      outstandingAmount: Number(inv.outstandingAmount ?? 0),
      status:            inv.status,

      // ── Standard meta fields ──────────────────────────────────────────────
      challanNo:         inv.challanNo         ?? "",
      financedBy:        inv.financedBy        ?? "",
      salesman:          inv.salesman          ?? "",
      emailId:           inv.emailId           ?? "",
      warrantyPeriod:    inv.warrantyPeriod    ?? "",
      ewayBillNo:        inv.ewayBillNo        ?? "",
      poNumber:          inv.poNumber          ?? "",
      vehicleNo:         inv.vehicleNo         ?? "",
      dispatchedThrough: inv.dispatchedThrough ?? "",
      transportName:     inv.transportName     ?? "",
      notes:             inv.notes             ?? "",
      termsConditions:   inv.termsConditions   ?? "",

      // ── Custom fields JSON e.g. { "WWW": "90" } ───────────────────────────
      customFieldValues: inv.customFieldValues ?? {},

      items: inv.items.map((item: any) => ({
        id:        item.id,
        productId: item.productId,
        quantity:  Number(item.quantity),
        price:     Number(item.price),
        godownId:  item.godownId ?? null,
        product: {
          id:         item.product?.id,
          name:       item.product?.name ?? item.productName ?? "—",
          unit:       item.product?.unit ?? null,
          hsnCode:    item.product?.hsnCode ?? null,
          salesPrice: item.product?.salesPrice
            ? Number(item.product.salesPrice)
            : Number(item.price),
        },
      })),
    }));

    return res.json({ success: true, data });

  } catch (error: any) {
    console.error("Get Available Invoices Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
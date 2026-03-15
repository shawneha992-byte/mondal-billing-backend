import { Request, Response } from "express";
import { PrismaClient, StockRefType } from "@prisma/client";
import { writeStockLedger } from "../services/stockLedger.service";

const prisma = new PrismaClient();

/* helper: remove commas for Decimal values */
const cleanNumber = (value: any): string | null => {
  if (value === null || value === undefined || value === "") return null;
  return String(value).replace(/,/g, "");
};

/* ─────────────────────────────────────────────
   CREATE ITEM
───────────────────────────────────────────── */

export const createItem = async (req: Request, res: Response) => {
  try {
    const {
      name,
      itemType,
      category,
      salesPrice,
      purchasePrice,
      gstRate,
      unit,
      openingStock,
      godownId,
      asOfDate,
      serviceCode,
      enableSerial,
      showOnlineStore,
      itemCode,
      hsnCode,
      sacCode,
      description,
      salesDiscountPercent,
      lowStockAlert,
      lowStockQty,
      mrp,
      wholesalePrice,
      trackBatchExpiry,
    } = req.body;

    if (!name || !itemType) {
      return res.status(400).json({
        success: false,
        message: "Name and ItemType are required",
      });
    }

    const normalizedItemType =
      itemType?.toLowerCase() === "product" ? "Product" : "Service";

    const item = await prisma.product.create({
      data: {
        name,
        itemType: normalizedItemType,
        category,
        itemCode: itemCode || null,
        hsnCode: hsnCode || null,
        sacCode: sacCode || null,
        description: description || null,
        salesPrice: cleanNumber(salesPrice),
        purchasePrice: cleanNumber(purchasePrice),
        gstRate: gstRate ? String(gstRate) : null,
        salesDiscountPercent: salesDiscountPercent
          ? Number(salesDiscountPercent)
          : null,
        unit,
        enableSerial: enableSerial ?? false,
        showOnlineStore: showOnlineStore ?? false,
        trackBatchExpiry: trackBatchExpiry ?? false,
        lowStockAlert: lowStockAlert ?? false,
        lowStockQty: lowStockQty ? Number(lowStockQty) : null,
        mrp: cleanNumber(mrp),
        wholesalePrice: cleanNumber(wholesalePrice),
        serviceCode:
          normalizedItemType === "Service" ? serviceCode || null : null,
      },
    });

    if (
      normalizedItemType === "Product" &&
      godownId &&
      Number(openingStock) > 0
    ) {
      const qty = Number(openingStock);

      await prisma.$transaction(async (tx) => {
        await tx.productStock.create({
          data: {
            productId: item.id,
            godownId: Number(godownId),
            openingStock: qty,
            currentStock: qty,
            asOfDate: asOfDate ? new Date(asOfDate) : new Date(),
          },
        });

        await tx.stockLedger.create({
          data: {
            productId: item.id,
            godownId: Number(godownId),
            date: asOfDate ? new Date(asOfDate) : new Date(),
            refType: StockRefType.OPENING,
            refId: null,
            quantityIn: qty,
            balance: qty,
            remarks: "Opening stock",
          },
        });
      });
    }

    return res.status(201).json({
      success: true,
      message: "Item created successfully",
      data: item,
    });
  } catch (error) {
    console.error("createItem error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

/* ─────────────────────────────────────────────
   GET ALL ITEMS
───────────────────────────────────────────── */

export const getItems = async (_req: Request, res: Response) => {
  try {
    const items = await prisma.product.findMany({
      include: { ProductStock: true },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ success: true, data: items });
  } catch (error) {
    console.error("getItems error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch items",
    });
  }
};

/* ─────────────────────────────────────────────
   GET SINGLE ITEM
───────────────────────────────────────────── */

export const getItemById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        ProductStock: { include: { godown: true } },
        partyPrices: { include: { party: true } },
        invoiceItems: { include: { invoice: { include: { party: true } } } },
        purchaseInvoiceItems: {
          include: { purchaseInvoice: { include: { party: true } } },
        },
      },
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Item not found",
      });
    }

    const totalStock = product.ProductStock.reduce(
      (sum, ps) => sum + Number(ps.currentStock ?? ps.openingStock ?? 0),
      0
    );

    return res.json({
      success: true,
      data: {
        id: product.id,
        itemName: product.name,
        stockNumber: totalStock,
        sellingPrice: product.salesPrice ? Number(product.salesPrice) : null,
        purchasePrice: product.purchasePrice
          ? Number(product.purchasePrice)
          : null,
        category: product.category ?? "",
      },
    });
  } catch (error) {
    console.error("getItemById error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch item details",
    });
  }
};

/* ─────────────────────────────────────────────
   MANUAL STOCK ADJUSTMENT
───────────────────────────────────────────── */

export const adjustStock = async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.id);
    const { godownId, type, qty, remarks } = req.body;

    const adjustQty = Number(qty);

    if (adjustQty <= 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be greater than zero",
      });
    }

    const quantityIn = type === "add" ? adjustQty : 0;
    const quantityOut = type === "reduce" ? adjustQty : 0;

    await prisma.$transaction(async (tx) => {

      await writeStockLedger({
        tx,
        productId,
        godownId: Number(godownId),
        refType: StockRefType.ADJUSTMENT,
        quantityIn,
        quantityOut,
        remarks: remarks || "Manual stock adjustment",
      });

      const existing = await tx.productStock.findUnique({
        where: {
          productId_godownId: {
            productId,
            godownId: Number(godownId),
          },
        },
      });

      let newStock = 0;

      const currentBalance = existing
        ? Number(existing.currentStock ?? existing.openingStock ?? 0)
        : 0;

      newStock =
        type === "add"
          ? currentBalance + adjustQty
          : Math.max(0, currentBalance - adjustQty);

      if (existing) {
        await tx.productStock.update({
          where: {
            productId_godownId: {
              productId,
              godownId: Number(godownId),
            },
          },
          data: {
            currentStock: newStock,
            asOfDate: new Date(),
          },
        });
      } else {
        if (type === "reduce") {
          throw new Error(
            "Cannot reduce stock — no stock exists for this godown yet"
          );
        }

        newStock = adjustQty;

        await tx.productStock.create({
          data: {
            productId,
            godownId: Number(godownId),
            openingStock: newStock,
            currentStock: newStock,
            asOfDate: new Date(),
          },
        });
      }

      await tx.stockLedger.create({
        data: {
          productId,
          godownId: Number(godownId),
          date: new Date(),
          refType: StockRefType.ADJUSTMENT,
          refId: null,
          quantityIn: type === "add" ? adjustQty : undefined,
          quantityOut: type === "reduce" ? adjustQty : undefined,
          balance: newStock,
          remarks:
            remarks || `Manual ${type === "add" ? "addition" : "reduction"}`,
        },
      });
    });

    return res.json({
      success: true,
      message: "Stock adjusted successfully",
    });
  } catch (error: any) {
    console.error("adjustStock error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
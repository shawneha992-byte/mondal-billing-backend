import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { StockRefType } from "@prisma/client";

/* ═══════════════════════════════════════════════════════════
   GET ALL STOCK LEDGER ENTRIES (paginated)
   GET /api/stock-ledger
═══════════════════════════════════════════════════════════ */
export const getStockLedger = async (req: Request, res: Response) => {
  try {
    const { productId, godownId, from, to, page = 1, limit = 50 } = req.query;
    const where: any = {};
    if (productId) where.productId = Number(productId);
    if (godownId)  where.godownId  = Number(godownId);
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from as string);
      if (to)   where.date.lte = new Date((to as string) + "T23:59:59");
    }

    const [entries, total] = await Promise.all([
      prisma.stockLedger.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, itemCode: true, unit: true } },
          godown:  { select: { godown_id: true, godown_name: true } },
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        skip:    (Number(page) - 1) * Number(limit),
        take:    Number(limit),
      }),
      prisma.stockLedger.count({ where }),
    ]);

    return res.json({
      success: true,
      data:    entries,
      total,
      page:    Number(page),
      pages:   Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    console.error("❌ getStockLedger:", error);
    res.status(500).json({ success: false, message: "Failed to fetch stock ledger" });
  }
};

/* ═══════════════════════════════════════════════════════════
   GET FULL LEDGER FOR ONE PRODUCT (with running balance)
   GET /api/stock-ledger/product/:productId
═══════════════════════════════════════════════════════════ */
export const getProductStockLedger = async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.productId);
    const { godownId, from, to } = req.query;

    const where: any = { productId };
    if (godownId) where.godownId = Number(godownId);
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from as string);
      if (to)   where.date.lte = new Date((to as string) + "T23:59:59");
    }

    const product = await prisma.product.findUnique({
      where:  { id: productId },
      select: { id: true, name: true, itemCode: true, unit: true },
    });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const entries = await prisma.stockLedger.findMany({
      where,
      include: { godown: { select: { godown_id: true, godown_name: true } } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });

    // ✅ Use currentStock (live balance), not openingStock
    const stocks = await prisma.productStock.findMany({
      where:   { productId },
      include: { godown: { select: { godown_name: true } } },
    });
   const currentStock = stocks.reduce(
  (s, st) =>
    s +
    Number(st.currentStock ?? st.openingStock ?? 0),
  0
);

    return res.json({ success: true, product, currentStock, data: entries });
  } catch (error) {
    console.error("❌ getProductStockLedger:", error);
    res.status(500).json({ success: false, message: "Failed to fetch product stock ledger" });
  }
};

/* ═══════════════════════════════════════════════════════════
   CREATE MANUAL STOCK ADJUSTMENT
   POST /api/stock-ledger/adjustment
═══════════════════════════════════════════════════════════ */
export const createStockAdjustment = async (req: Request, res: Response) => {
  try {
    const { productId, godownId, quantityIn, quantityOut, remarks } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const stock = godownId
        ? await tx.productStock.findUnique({
            where: { productId_godownId: { productId: Number(productId), godownId: Number(godownId) } },
          })
        : await tx.productStock.findFirst({ where: { productId: Number(productId) } });

      // ✅ FIX: use currentStock as live balance
     const currentBalance = stock ? Number(stock.currentStock ?? stock.openingStock ?? 0): 0;

      const qIn  = Number(quantityIn  || 0);
      const qOut = Number(quantityOut || 0);
      if (currentBalance + qIn - qOut < 0) {
  throw new Error("Stock cannot be negative");
}

const newBalance = currentBalance + qIn - qOut;

        const finalGodownId =
          godownId ? Number(godownId) : stock?.godownId;

        if (!finalGodownId) {
          throw new Error("godownId is required for stock adjustment");
        }

      // Write StockLedger entry
      const entry = await tx.stockLedger.create({
        data: {
          productId:   Number(productId),
         godownId: finalGodownId,
          date:        new Date(),
          refType:     StockRefType.ADJUSTMENT,
         quantityIn:  qIn  > 0 ? qIn  : undefined,
        quantityOut: qOut > 0 ? qOut : undefined,

          balance:     newBalance,
          remarks:     remarks || "Manual Adjustment",
        },
      });

      // ✅ FIX: update currentStock ONLY — openingStock is the original entry, never touch it
      if (stock) {
        await tx.productStock.update({
          where: { id: stock.id },
          data:  { currentStock: newBalance },
        });
      }

      return entry;
    });

    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error("❌ createStockAdjustment:", error);
    res.status(500).json({ success: false, message: "Failed to create stock adjustment" });
  }
};

/* ═══════════════════════════════════════════════════════════
   STOCK SUMMARY  (current levels across all products)
   GET /api/stock-ledger/summary
═══════════════════════════════════════════════════════════ */
export const getStockSummary = async (req: Request, res: Response) => {
  try {
    const stocks = await prisma.productStock.findMany({
      include: {
        product: {
          select: {
            id: true, name: true, itemCode: true, unit: true,
            lowStockAlert: true, lowStockQty: true,
          },
        },
        godown: { select: { godown_name: true } },
      },
      orderBy: { product: { name: "asc" } },
    });

    const summary = stocks.map((s) => {
      // ✅ Use currentStock as the live balance
      const liveStock = s.currentStock ?? s.openingStock;
      return {
        productId:    s.productId,
        productName:  s.product.name,
        itemCode:     s.product.itemCode,
        unit:         s.product.unit,
        godownName:   s.godown.godown_name,
        currentStock: liveStock,
        openingStock: s.openingStock,
        lowStockAlert: s.product.lowStockAlert,
        lowStockQty:   s.product.lowStockQty,
        isLowStock:   s.product.lowStockAlert
          ? Number(liveStock) <= (s.product.lowStockQty ?? 0)

          : false,
      };
    });

    return res.json({ success: true, data: summary });
  } catch (error) {
    console.error("❌ getStockSummary:", error);
    res.status(500).json({ success: false, message: "Failed to fetch stock summary" });
  }
};
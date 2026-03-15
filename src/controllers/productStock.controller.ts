import { Request, Response } from "express";
import { PrismaClient, StockRefType } from "@prisma/client";

const prisma = new PrismaClient();

/* ═══════════════════════════════════════════════════════════
   CREATE PRODUCT STOCK  (Opening stock entry)
   POST /api/product-stocks
═══════════════════════════════════════════════════════════ */
export const createProductStock = async (req: Request, res: Response) => {
  try {
    const { productId, godownId, openingStock, asOfDate } = req.body;

    if (!productId || !godownId) {
      return res.status(400).json({ success: false, message: "Product and Godown are required" });
    }

    const qty = Number(openingStock || 0);

    // ✅ FIX: set currentStock = openingStock + write OPENING StockLedger entry
    const stock = await prisma.$transaction(async (tx) => {
      const created = await tx.productStock.create({
        data: {
          productId:    Number(productId),
          godownId:     Number(godownId),
          openingStock: qty,
          currentStock: qty,              // ← currentStock starts equal to openingStock
          asOfDate:     asOfDate ? new Date(asOfDate) : new Date(),
        },
      });

      if (qty > 0) {
        await tx.stockLedger.create({
          data: {
            productId:   Number(productId),
            godownId:    Number(godownId),
            date:        asOfDate ? new Date(asOfDate) : new Date(),
            refType:     StockRefType.OPENING,
            refId:       null,
            quantityIn:  qty,
            quantityOut: 0,
            balance:     qty,
            remarks:     "Opening stock",
          },
        });
      }

      return created;
    });

    return res.status(201).json({ success: true, message: "Stock added successfully", data: stock });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/* ═══════════════════════════════════════════════════════════
   GET ALL PRODUCT STOCKS
   GET /api/product-stocks
═══════════════════════════════════════════════════════════ */
export const getProductStocks = async (req: Request, res: Response) => {
  try {
    const stocks = await prisma.productStock.findMany({
      include: { product: true, godown: true },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, data: stocks });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch stocks" });
  }
};

/* ═══════════════════════════════════════════════════════════
   GET PRODUCT STOCK BY ID
   GET /api/product-stocks/:id
═══════════════════════════════════════════════════════════ */
export const getProductStockById = async (req: Request, res: Response) => {
  try {
    const id    = Number(req.params.id);
    const stock = await prisma.productStock.findUnique({
      where:   { id },
      include: { product: true, godown: true },
    });
    if (!stock) return res.status(404).json({ success: false, message: "Stock not found" });
    return res.json({ success: true, data: stock });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error fetching stock" });
  }
};

/* ═══════════════════════════════════════════════════════════
   UPDATE PRODUCT STOCK  (manual opening correction)
   PUT /api/product-stocks/:id
═══════════════════════════════════════════════════════════ */
export const updateProductStock = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { openingStock, asOfDate } = req.body;

    const stock = await prisma.productStock.findUnique({
      where: { id }
    });

    if (!stock) {
      return res.status(404).json({ success: false, message: "Stock not found" });
    }

    const diff = Number(openingStock) - Number(stock.openingStock ?? 0);

    const updatedStock = await prisma.productStock.update({
      where: { id },
      data: {
        openingStock: Number(openingStock),
        currentStock: { increment: diff }, // adjusts balance safely
        asOfDate: asOfDate ? new Date(asOfDate) : undefined,
      },
    });

    return res.json({
      success: true,
      message: "Stock updated successfully",
      data: updatedStock
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Update failed" });
  }
};

/* ═══════════════════════════════════════════════════════════
   DELETE PRODUCT STOCK
   DELETE /api/product-stocks/:id
═══════════════════════════════════════════════════════════ */
export const deleteProductStock = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await prisma.productStock.delete({ where: { id } });
    return res.json({ success: true, message: "Stock deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Delete failed" });
  }
};
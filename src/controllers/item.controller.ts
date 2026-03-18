import { Request, Response } from "express";
import { StockRefType } from "@prisma/client";
import { writeStockLedger } from "../services/stockLedger.service";
import prisma from "../utils/prisma";

/* helper: strip commas and return numeric string for Decimal fields */
const cleanNumber = (value: any): string | null => {
  if (value === null || value === undefined || value === "") return null;
  return String(value).replace(/,/g, "");
};

/* ─────────────────────────────────────────────
   CREATE ITEM (Product or Service)
───────────────────────────────────────────── */
export const createItem = async (req: Request, res: Response) => {
  try {
    const {
      name, itemType, category, salesPrice, purchasePrice, gstRate, unit,
      openingStock, godownId, asOfDate, serviceCode, enableSerial,
      showOnlineStore, itemCode, hsnCode, sacCode, description,
      salesDiscountPercent, lowStockAlert, lowStockQty, mrp, wholesalePrice,
      trackBatchExpiry,
    } = req.body;

    if (!name || !itemType) {
      return res.status(400).json({ success: false, message: "Name and ItemType are required" });
    }

    const normalizedItemType = itemType?.toLowerCase() === "product" ? "Product" : "Service";

    const item = await prisma.product.create({
      data: {
        name,
        itemType:            normalizedItemType,
        category,
        itemCode:            itemCode            || null,
        hsnCode:             hsnCode             || null,
        sacCode:             sacCode             || null,
        description:         description         || null,
        salesPrice:          cleanNumber(salesPrice),
        purchasePrice:       cleanNumber(purchasePrice),
        gstRate:             gstRate             ? String(gstRate) : null,
        salesDiscountPercent: salesDiscountPercent ? Number(salesDiscountPercent) : null,
        unit,
        enableSerial:        enableSerial        ?? false,
        showOnlineStore:     showOnlineStore      ?? false,
        trackBatchExpiry:    trackBatchExpiry     ?? false,
        lowStockAlert:       lowStockAlert        ?? false,
        lowStockQty:         lowStockQty          ? Number(lowStockQty) : null,
        mrp:                 cleanNumber(mrp),
        wholesalePrice:      cleanNumber(wholesalePrice),
        serviceCode:         normalizedItemType === "Service" ? serviceCode || null : null,
      },
    });

    // ✅ FIX: set currentStock = openingStock, and write OPENING StockLedger entry
    if (normalizedItemType === "Product" && godownId && Number(openingStock) > 0) {
      const qty = Number(openingStock);
      await prisma.$transaction(async (tx) => {
        await tx.productStock.create({
          data: {
            productId:    item.id,
            godownId:     Number(godownId),
            openingStock: qty,
            currentStock: qty,                // ← currentStock starts equal to openingStock
            asOfDate:     asOfDate ? new Date(asOfDate) : new Date(),
          },
        });
        // Write OPENING entry so stock history starts from item creation
        await tx.stockLedger.create({
          data: {
            productId:   item.id,
            godownId:    Number(godownId),
            date:        asOfDate ? new Date(asOfDate) : new Date(),
            refType:     StockRefType.OPENING,
            refId:       null,
            quantityIn:  qty,
            balance:     qty,
            remarks:     "Opening stock",
          },
        });
      });
    }

    return res.status(201).json({ success: true, message: "Item created successfully", data: item });
  } catch (error) {
    console.error("createItem error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/* ─────────────────────────────────────────────
   GET ALL ITEMS
───────────────────────────────────────────── */
export const getItems = async (req: Request, res: Response) => {
  try {
    const items = await prisma.product.findMany({
      include: { ProductStock: true },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, data: items });
  } catch (error) {
    console.error("getItems error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch items" });
  }
};

/* ─────────────────────────────────────────────
   GET SINGLE ITEM BY ID
───────────────────────────────────────────── */
export const getItemById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid item id" });
    }

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        ProductStock: {
          include: { godown: true },
          orderBy: { createdAt: "desc" },
        },
        partyPrices: { include: { party: true } },
        invoiceItems: {
          include: { invoice: { include: { party: true } } },
          orderBy: { invoice: { createdAt: "desc" } },
        },
      },
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    /* ── Stock Details ── */
    const openingEntries = product.ProductStock.map((ps) => ({
      _date: ps.asOfDate,
      date:  formatDMY(ps.asOfDate),
      transactionType: "Opening Stock",
      quantity:        `+${ps.openingStock} ${product.unit ?? "PCS"}`,
      invoiceNumber:   null as string | null,
      _qty:            ps.openingStock,
    }));

    const invoiceEntries = product.invoiceItems.map((ii) => ({
      _date: ii.invoice.createdAt,
      date:  formatDMY(ii.invoice.createdAt),
      transactionType: "Sales Invoice",
      quantity:        `-${ii.quantity} ${product.unit ?? "PCS"}`,
      invoiceNumber:   ii.invoice.invoiceNo,
      _qty:            -ii.quantity,
    }));

    const allEntries = [...openingEntries, ...invoiceEntries].sort(
      (a, b) => a._date.getTime() - b._date.getTime()
    );

    let runningStock = 0;
    const stockDetails = allEntries
      .map((entry) => {
        runningStock += entry._qty;
        return {
          date:           entry.date,
          transactionType: entry.transactionType,
          quantity:       entry.quantity,
          invoiceNumber:  entry.invoiceNumber,
          closingStock:   `${runningStock} ${product.unit ?? "PCS"}`,
        };
      })
      .reverse();

    /* ── Party Wise Report ── */
    const partyMap = new Map<string, { partyName: string; salesQuantity: number; salesAmount: number }>();
    for (const ii of product.invoiceItems) {
      const partyName = ii.invoice.party.partyName ?? ii.invoice.party.name;
      if (!partyMap.has(partyName)) {
        partyMap.set(partyName, { partyName, salesQuantity: 0, salesAmount: 0 });
      }
      const entry = partyMap.get(partyName)!;
      entry.salesQuantity += ii.quantity;
      entry.salesAmount   += Number(ii.total);
    }
    const partyWiseReport = Array.from(partyMap.values()).map((p) => ({
      partyName:        p.partyName,
      salesQuantity:    p.salesQuantity,
      salesAmount:      p.salesAmount,
      purchaseQuantity: 0,
      purchaseAmount:   "-",
    }));

    /* ── Godown Stock ── */
    const godownStock = product.ProductStock.map((ps) => ({
      godownName: ps.godown.godown_name,
      // ✅ FIX: show currentStock (live balance), not openingStock
      stockAvailable: `${ps.currentStock ?? ps.openingStock} ${product.unit ?? "PCS"}`,
      address: [ps.godown.street_address, ps.godown.city_name, ps.godown.state_name, ps.godown.pincode]
        .filter(Boolean)
        .join(", "),
    }));

    /* ── Party Wise Prices ── */
    const partyWisePrices = product.partyPrices.map((pp) => ({
      partyName:  pp.party.partyName ?? pp.party.name,
      salesPrice: Number(pp.price),
    }));

    /* ── Total Stock ── */
    // ✅ FIX: sum currentStock (live balance), not openingStock
    const totalStock = product.ProductStock.reduce(
      (sum, s) => sum + (s.currentStock ?? s.openingStock), 0
    );

    return res.json({
      success: true,
      data: {
        id:              String(product.id),
        itemName:        product.name,
        itemCode:        product.itemCode     ?? "",
        stockQty:        `${totalStock} ${product.unit ?? "PCS"}`,
        stockNumber:     totalStock,
        sellingPrice:    product.salesPrice   ? Number(product.salesPrice)   : null,
        purchasePrice:   product.purchasePrice ? Number(product.purchasePrice) : null,
        category:        product.category     ?? "",
        gstTaxRate:      product.gstRate      ? `${product.gstRate}%` : "0%",
        hsnCode:         product.hsnCode      ?? "",
        secondaryUnit:   product.unit         ?? "-",
        lowStockQty:     product.lowStockQty  != null ? String(product.lowStockQty) : "-",
        lowStockWarning: product.lowStockAlert ? "Enabled" : "Disabled",
        itemDescription: product.description  ?? "",
        stockDetails,
        partyWiseReport,
        godownStock,
        partyWisePrices,
      },
    });
  } catch (error) {
    console.error("getItemById error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch item details" });
  }
};

/* ─────────────────────────────────────────────
   ADJUST STOCK
   Body: { godownId, type: "add"|"reduce", qty, remarks }
   Route: POST /items/:id/adjust-stock
───────────────────────────────────────────── */
export const adjustStock = async (req: Request, res: Response) => {
  try {
    const productId = Number(req.params.id);
    const { godownId, type, qty, remarks } = req.body;

    if (!productId || isNaN(productId)) {
      return res.status(400).json({ success: false, message: "Invalid item id" });
    }
    if (!godownId || !type || qty === undefined) {
      return res.status(400).json({ success: false, message: "godownId, type and qty are required" });
    }

    const adjustQty = Number(qty);
    if (isNaN(adjustQty) || adjustQty < 0) {
      return res.status(400).json({ success: false, message: "qty must be a non-negative number" });
    }

    // ✅ FIX: use currentStock as live balance, update currentStock only, write StockLedger
    let newStock = 0;

    await prisma.$transaction(async (tx) => {
      const existing = await tx.productStock.findUnique({
        where: { productId_godownId: { productId, godownId: Number(godownId) } },
      });

      // currentStock is the live balance; openingStock is just the original entry
      const currentBalance = existing ? (existing.currentStock ?? existing.openingStock) : 0;
      newStock = type === "add"
        ? currentBalance + adjustQty
        : Math.max(0, currentBalance - adjustQty);

      if (existing) {
        await tx.productStock.update({
          where: { productId_godownId: { productId, godownId: Number(godownId) } },
          data:  { currentStock: newStock, asOfDate: new Date() }, // openingStock NOT touched
        });
      } else {
        if (type === "reduce") {
          throw new Error("Cannot reduce stock — no stock exists for this godown yet");
        }
        newStock = adjustQty;
        await tx.productStock.create({
          data: {
            productId,
            godownId:     Number(godownId),
            openingStock: newStock,
            currentStock: newStock,
            asOfDate:     new Date(),
          },
        });
      }

      // Write StockLedger ADJUSTMENT entry for full audit trail
      await tx.stockLedger.create({
        data: {
          productId,
          godownId:    Number(godownId),
          date:        new Date(),
          refType:     StockRefType.ADJUSTMENT,
          refId:       null,
       quantityIn:  type === "add" ? adjustQty : undefined,
       quantityOut: type === "reduce" ? adjustQty : undefined,

          balance:     newStock,
          remarks:     remarks || `Manual ${type === "add" ? "addition" : "reduction"}`,
        },
      });
    });

    return res.json({ success: true, message: "Stock adjusted successfully", data: { newStock } });
  } catch (error: any) {
    console.error("adjustStock error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to adjust stock" });
  }
};

/* ─────────────────────────────────────────────
   GET ITEMS BY GODOWN
───────────────────────────────────────────── */
export const getItemsByGodown = async (req: Request, res: Response) => {
  try {
    const godownId = Number(req.params.godownId);
    if (!godownId || isNaN(godownId)) {
      return res.status(400).json({ success: false, message: "Invalid godown id" });
    }

    const stocks = await prisma.productStock.findMany({
      where:   { godownId },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });

    const items = stocks.map((stock) => ({
      id:            stock.product.id,
      name:          stock.product.name,
      itemCode:      stock.product.itemCode    ?? "",
      salesPrice:    stock.product.salesPrice  ? Number(stock.product.salesPrice)  : null,
      purchasePrice: stock.product.purchasePrice ? Number(stock.product.purchasePrice) : null,
      // ✅ FIX: return currentStock so invoice item picker shows real available qty
      stockQty:      stock.currentStock ?? stock.openingStock ?? 0,
    }));

    return res.json({ success: true, data: items });
  } catch (error) {
    console.error("getItemsByGodown error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch items by godown" });
  }
};

/* ─────────────────────────────────────────────
   UPDATE ITEM
───────────────────────────────────────────── */
export const updateItem = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const {
      name, itemType, category, salesPrice, purchasePrice,
      gstRate, unit, description, itemCode, hsnCode, sacCode,
    } = req.body;

    const normalizedItemType = itemType?.toLowerCase() === "product" ? "Product" : "Service";

    const updatedItem = await prisma.product.update({
      where: { id },
      data: {
        name,
        itemType:      normalizedItemType,
        category,
        salesPrice:    cleanNumber(salesPrice),
        purchasePrice: cleanNumber(purchasePrice),
        gstRate:       gstRate ? String(gstRate) : null,
        unit,
        description:   description || null,
        itemCode:      itemCode    || null,
        hsnCode:       hsnCode     || null,
        sacCode:       sacCode     || null,
      },
    });

    return res.json({ success: true, data: updatedItem });
  } catch (error) {
    console.error("updateItem error:", error);
    return res.status(500).json({ success: false, message: "Error updating item" });
  }
};

/* ─────────────────────────────────────────────
   DELETE ITEM
───────────────────────────────────────────── */
export const deleteItem = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await prisma.product.delete({ where: { id } });
    return res.json({ success: true, message: "Item deleted successfully" });
  } catch (error) {
    console.error("deleteItem error:", error);
    return res.status(500).json({ success: false, message: "Delete failed" });
  }
};

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function formatDMY(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}
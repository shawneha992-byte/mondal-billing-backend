"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProductStock = exports.updateProductStock = exports.getProductStockById = exports.getProductStocks = exports.createProductStock = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../utils/prisma"));
/* ═══════════════════════════════════════════════════════════
   CREATE PRODUCT STOCK  (Opening stock entry)
   POST /api/product-stocks
═══════════════════════════════════════════════════════════ */
const createProductStock = async (req, res) => {
    try {
        const { productId, godownId, openingStock, asOfDate } = req.body;
        if (!productId || !godownId) {
            return res.status(400).json({ success: false, message: "Product and Godown are required" });
        }
        const qty = Number(openingStock || 0);
        const stock = await prisma_1.default.$transaction(async (tx) => {
            const created = await tx.productStock.create({
                data: {
                    productId: Number(productId),
                    godownId: Number(godownId),
                    openingStock: qty,
                    currentStock: qty,
                    asOfDate: asOfDate ? new Date(asOfDate) : new Date(),
                },
            });
            if (qty > 0) {
                // FIX: explicit 0 for quantityOut (schema Int field — undefined causes runtime error)
                await tx.stockLedger.create({
                    data: {
                        productId: Number(productId),
                        godownId: Number(godownId),
                        date: asOfDate ? new Date(asOfDate) : new Date(),
                        refType: client_1.StockRefType.OPENING,
                        refId: null,
                        quantityIn: qty,
                        quantityOut: 0,
                        balance: qty,
                        remarks: "Opening stock",
                    },
                });
            }
            return created;
        });
        return res.status(201).json({ success: true, message: "Stock added successfully", data: stock });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
exports.createProductStock = createProductStock;
/* ═══════════════════════════════════════════════════════════
   GET ALL PRODUCT STOCKS
   GET /api/product-stocks
═══════════════════════════════════════════════════════════ */
const getProductStocks = async (req, res) => {
    try {
        const stocks = await prisma_1.default.productStock.findMany({
            include: { product: true, godown: true },
            orderBy: { createdAt: "desc" },
        });
        return res.json({ success: true, data: stocks });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch stocks" });
    }
};
exports.getProductStocks = getProductStocks;
/* ═══════════════════════════════════════════════════════════
   GET PRODUCT STOCK BY ID
   GET /api/product-stocks/:id
═══════════════════════════════════════════════════════════ */
const getProductStockById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const stock = await prisma_1.default.productStock.findUnique({
            where: { id },
            include: { product: true, godown: true },
        });
        if (!stock)
            return res.status(404).json({ success: false, message: "Stock not found" });
        return res.json({ success: true, data: stock });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: "Error fetching stock" });
    }
};
exports.getProductStockById = getProductStockById;
/* ═══════════════════════════════════════════════════════════
   UPDATE PRODUCT STOCK  (manual opening correction)
   PUT /api/product-stocks/:id
═══════════════════════════════════════════════════════════ */
const updateProductStock = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { openingStock, asOfDate } = req.body;
        const stock = await prisma_1.default.productStock.findUnique({
            where: { id }
        });
        if (!stock) {
            return res.status(404).json({ success: false, message: "Stock not found" });
        }
        const diff = Number(openingStock) - Number(stock.openingStock ?? 0);
        const updatedStock = await prisma_1.default.productStock.update({
            where: { id },
            data: {
                openingStock: Number(openingStock),
                currentStock: { increment: diff },
                asOfDate: asOfDate ? new Date(asOfDate) : undefined,
            },
        });
        return res.json({
            success: true,
            message: "Stock updated successfully",
            data: updatedStock
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Update failed" });
    }
};
exports.updateProductStock = updateProductStock;
/* ═══════════════════════════════════════════════════════════
   DELETE PRODUCT STOCK
   DELETE /api/product-stocks/:id
═══════════════════════════════════════════════════════════ */
const deleteProductStock = async (req, res) => {
    try {
        const id = Number(req.params.id);
        await prisma_1.default.productStock.delete({ where: { id } });
        return res.json({ success: true, message: "Stock deleted successfully" });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: "Delete failed" });
    }
};
exports.deleteProductStock = deleteProductStock;

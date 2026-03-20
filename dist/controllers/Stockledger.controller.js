"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStockSummary = exports.createStockAdjustment = exports.getProductStockLedger = exports.getStockLedger = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const client_1 = require("@prisma/client");
/* ===========================================================
   GET ALL STOCK LEDGER ENTRIES
=========================================================== */
const getStockLedger = async (req, res) => {
    try {
        const { productId, godownId, from, to, page = 1, limit = 50 } = req.query;
        const where = {};
        if (productId)
            where.productId = Number(productId);
        if (godownId)
            where.godownId = Number(godownId);
        if (from || to) {
            where.date = {};
            if (from)
                where.date.gte = new Date(from);
            if (to)
                where.date.lte = new Date(to + "T23:59:59");
        }
        const [entries, total] = await Promise.all([
            prisma_1.default.stockLedger.findMany({
                where,
                include: {
                    product: {
                        select: { id: true, name: true, itemCode: true, unit: true },
                    },
                    godown: {
                        select: { godown_id: true, godown_name: true },
                    },
                },
                orderBy: [{ date: "desc" }, { id: "desc" }],
                skip: (Number(page) - 1) * Number(limit),
                take: Number(limit),
            }),
            prisma_1.default.stockLedger.count({ where }),
        ]);
        res.json({
            success: true,
            data: entries,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
        });
    }
    catch (error) {
        console.error("getStockLedger:", error);
        res.status(500).json({ success: false, message: "Failed to fetch stock ledger" });
    }
};
exports.getStockLedger = getStockLedger;
/* ===========================================================
   GET PRODUCT STOCK LEDGER
=========================================================== */
const getProductStockLedger = async (req, res) => {
    try {
        const productId = Number(req.params.productId);
        const { godownId } = req.query;
        const where = { productId };
        if (godownId)
            where.godownId = Number(godownId);
        const product = await prisma_1.default.product.findUnique({
            where: { id: productId },
            select: { id: true, name: true, itemCode: true, unit: true },
        });
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }
        const entries = await prisma_1.default.stockLedger.findMany({
            where,
            include: {
                godown: { select: { godown_name: true } },
            },
            orderBy: [{ date: "asc" }, { id: "asc" }],
        });
        const stocks = await prisma_1.default.productStock.findMany({
            where: { productId },
        });
        const currentStock = stocks.reduce((sum, s) => sum + Number(s.currentStock ?? s.openingStock ?? 0), 0);
        /* FORMAT LEDGER FOR UI */
        const formattedEntries = entries.map((e) => {
            let transactionType = e.remarks || "Adjustment";
            switch (e.refType) {
                case client_1.StockRefType.OPENING:
                    transactionType = "Opening Stock";
                    break;
                case client_1.StockRefType.PURCHASE:
                    transactionType = "Purchase Invoice";
                    break;
                case client_1.StockRefType.SALE:
                    transactionType = "Sales Invoice";
                    break;
                case client_1.StockRefType.ADJUSTMENT:
                    transactionType = "Stock Adjustment";
                    break;
                case client_1.StockRefType.PURCHASE_RETURN:
                    transactionType = "Purchase Return";
                    break;
            }
            const quantity = e.quantityIn && e.quantityIn > 0
                ? `+${e.quantityIn}`
                : `-${e.quantityOut ?? 0}`;
            return {
                id: e.id,
                date: e.date,
                transactionType,
                quantity,
                invoiceNumber: e.refId ?? "-",
                closingStock: e.balance,
                godown: e.godown?.godown_name ?? null,
                remarks: e.remarks,
            };
        });
        res.json({
            success: true,
            product,
            currentStock,
            data: formattedEntries,
        });
    }
    catch (error) {
        console.error("getProductStockLedger:", error);
        res.status(500).json({ success: false, message: "Failed to fetch product stock ledger" });
    }
};
exports.getProductStockLedger = getProductStockLedger;
/* ===========================================================
   CREATE MANUAL STOCK ADJUSTMENT
=========================================================== */
const createStockAdjustment = async (req, res) => {
    try {
        const { productId, godownId, quantityIn, quantityOut, remarks } = req.body;
        if (!productId || !godownId) {
            return res.status(400).json({
                success: false,
                message: "productId and godownId are required",
            });
        }
        const qIn = Number(quantityIn || 0);
        const qOut = Number(quantityOut || 0);
        const result = await prisma_1.default.$transaction(async (tx) => {
            let stock = await tx.productStock.findUnique({
                where: {
                    productId_godownId: {
                        productId: Number(productId),
                        godownId: Number(godownId),
                    },
                },
            });
            if (!stock) {
                stock = await tx.productStock.create({
                    data: {
                        productId: Number(productId),
                        godownId: Number(godownId),
                        openingStock: 0,
                        currentStock: 0,
                        asOfDate: new Date(),
                    },
                });
            }
            const currentBalance = Number(stock.currentStock ?? stock.openingStock ?? 0);
            const newBalance = currentBalance + qIn - qOut;
            if (newBalance < 0) {
                throw new Error("Stock cannot be negative");
            }
            await tx.productStock.update({
                where: { id: stock.id },
                data: { currentStock: newBalance },
            });
            // FIX: pass explicit integers (0 instead of undefined) to avoid runtime errors
            const ledgerEntry = await tx.stockLedger.create({
                data: {
                    productId: Number(productId),
                    godownId: Number(godownId),
                    date: new Date(),
                    refType: client_1.StockRefType.ADJUSTMENT,
                    quantityIn: qIn > 0 ? qIn : 0,
                    quantityOut: qOut > 0 ? qOut : 0,
                    balance: newBalance,
                    remarks: remarks || "Manual Adjustment",
                },
            });
            return ledgerEntry;
        });
        res.status(201).json({ success: true, data: result });
    }
    catch (error) {
        console.error("createStockAdjustment:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to create stock adjustment",
        });
    }
};
exports.createStockAdjustment = createStockAdjustment;
/* ===========================================================
   STOCK SUMMARY
=========================================================== */
const getStockSummary = async (req, res) => {
    try {
        const stocks = await prisma_1.default.productStock.findMany({
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
            const liveStock = Number(s.currentStock ?? s.openingStock ?? 0);
            return {
                productId: s.productId,
                productName: s.product.name,
                itemCode: s.product.itemCode,
                unit: s.product.unit,
                godownName: s.godown.godown_name,
                openingStock: Number(s.openingStock),
                currentStock: liveStock,
                lowStockAlert: s.product.lowStockAlert,
                lowStockQty: s.product.lowStockQty,
                isLowStock: s.product.lowStockAlert
                    ? liveStock <= Number(s.product.lowStockQty ?? 0)
                    : false,
            };
        });
        res.json({ success: true, data: summary });
    }
    catch (error) {
        console.error("getStockSummary:", error);
        res.status(500).json({ success: false, message: "Failed to fetch stock summary" });
    }
};
exports.getStockSummary = getStockSummary;

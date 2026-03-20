"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveInvoiceSettings = exports.getInvoiceSettings = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
/**
 * GET /api/invoice-settings
 * Returns the first InvoiceSettings row (no branch filter for now).
 * Returns defaults if none exist yet.
 */
const getInvoiceSettings = async (req, res) => {
    try {
        let settings = await prisma_1.default.invoiceSettings.findFirst({
            orderBy: { id: "asc" },
        });
        if (!settings) {
            // Return defaults — don't persist yet (lazy creation on first Save)
            return res.json({
                success: true,
                data: {
                    id: null,
                    enablePrefix: false,
                    prefix: "",
                    sequenceNumber: 1,
                    showPurchasePrice: false,
                    showItemImage: false,
                    enablePriceHistory: false,
                    invoiceTheme: "Advanced GST",
                },
            });
        }
        return res.json({ success: true, data: settings });
    }
    catch (error) {
        console.error("❌ getInvoiceSettings:", error);
        res.status(500).json({ success: false, message: "Failed to fetch invoice settings" });
    }
};
exports.getInvoiceSettings = getInvoiceSettings;
/**
 * POST /api/invoice-settings
 * Upserts (creates or updates) the single InvoiceSettings row.
 */
const saveInvoiceSettings = async (req, res) => {
    try {
        const { enablePrefix = false, prefix = "", sequenceNumber = 1, showPurchasePrice = false, showItemImage = false, enablePriceHistory = false, invoiceTheme = "Advanced GST", } = req.body;
        const existing = await prisma_1.default.invoiceSettings.findFirst({ orderBy: { id: "asc" } });
        let settings;
        if (existing) {
            settings = await prisma_1.default.invoiceSettings.update({
                where: { id: existing.id },
                data: {
                    enablePrefix,
                    prefix: enablePrefix ? (prefix || "") : "",
                    sequenceNumber: Number(sequenceNumber) || 1,
                    showPurchasePrice,
                    showItemImage,
                    enablePriceHistory,
                    invoiceTheme,
                },
            });
        }
        else {
            settings = await prisma_1.default.invoiceSettings.create({
                data: {
                    enablePrefix,
                    prefix: enablePrefix ? (prefix || "") : "",
                    sequenceNumber: Number(sequenceNumber) || 1,
                    showPurchasePrice,
                    showItemImage,
                    enablePriceHistory,
                    invoiceTheme,
                },
            });
        }
        return res.json({ success: true, data: settings });
    }
    catch (error) {
        console.error("❌ saveInvoiceSettings:", error);
        res.status(500).json({ success: false, message: "Failed to save invoice settings" });
    }
};
exports.saveInvoiceSettings = saveInvoiceSettings;

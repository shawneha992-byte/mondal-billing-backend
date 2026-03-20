"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePurchaseInvoiceSettings = exports.getPurchaseInvoiceSettings = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
/* ═══════════════════════════════════════════════
   GET SETTINGS
   GET /api/purchase-invoices/settings
═══════════════════════════════════════════════ */
const getPurchaseInvoiceSettings = async (_req, res) => {
    try {
        let settings = await prisma_1.default.purchaseInvoiceSettings.findFirst();
        if (!settings) {
            settings = await prisma_1.default.purchaseInvoiceSettings.create({
                data: {
                    prefix: "PI",
                    sequenceNumber: 1,
                    enablePrefix: true,
                    showItemImage: false,
                    enablePriceHistory: false,
                },
            });
        }
        return res.json({
            success: true,
            data: settings,
        });
    }
    catch (error) {
        console.error("Get Purchase Settings Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to load purchase invoice settings",
        });
    }
};
exports.getPurchaseInvoiceSettings = getPurchaseInvoiceSettings;
/* ═══════════════════════════════════════════════
   UPDATE SETTINGS
   PUT /api/purchase-invoices/settings
   (Sequence NOT editable)
═══════════════════════════════════════════════ */
const updatePurchaseInvoiceSettings = async (req, res) => {
    try {
        const { prefix, enablePrefix, showItemImage, enablePriceHistory, } = req.body;
        let settings = await prisma_1.default.purchaseInvoiceSettings.findFirst();
        if (!settings) {
            settings = await prisma_1.default.purchaseInvoiceSettings.create({
                data: {
                    prefix: prefix ?? "PI",
                    sequenceNumber: 1,
                    enablePrefix: enablePrefix ?? true,
                    showItemImage: showItemImage ?? false,
                    enablePriceHistory: enablePriceHistory ?? false,
                },
            });
        }
        else {
            settings = await prisma_1.default.purchaseInvoiceSettings.update({
                where: { id: settings.id },
                data: {
                    prefix,
                    enablePrefix,
                    showItemImage,
                    enablePriceHistory,
                },
            });
        }
        return res.json({
            success: true,
            message: "Settings updated successfully",
            data: settings,
        });
    }
    catch (error) {
        console.error("Update Purchase Settings Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update settings",
        });
    }
};
exports.updatePurchaseInvoiceSettings = updatePurchaseInvoiceSettings;

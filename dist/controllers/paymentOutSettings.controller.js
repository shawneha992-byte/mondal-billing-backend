"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePaymentOutSettings = exports.getPaymentOutSettings = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
/* =========================================
   GET PAYMENT OUT SETTINGS
========================================= */
const getPaymentOutSettings = async (_req, res) => {
    try {
        let settings = await prisma_1.default.paymentOutSettings.findFirst();
        if (!settings) {
            // FIX: schema default for sequenceNumber is 1 (not 0); add enablePrefix
            settings = await prisma_1.default.paymentOutSettings.create({
                data: {
                    prefix: "PO/",
                    sequenceNumber: 1,
                    enablePrefix: true,
                },
            });
        }
        res.json(settings);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch payment out settings",
        });
    }
};
exports.getPaymentOutSettings = getPaymentOutSettings;
/* =========================================
   UPDATE PAYMENT OUT SETTINGS
========================================= */
const updatePaymentOutSettings = async (req, res) => {
    try {
        const { prefix, enablePrefix } = req.body;
        const settings = await prisma_1.default.paymentOutSettings.findFirst();
        if (!settings) {
            return res.status(404).json({
                message: "Settings not found",
            });
        }
        const updated = await prisma_1.default.paymentOutSettings.update({
            where: { id: settings.id },
            data: {
                ...(prefix !== undefined && { prefix }),
                ...(enablePrefix !== undefined && { enablePrefix }),
            },
        });
        res.json(updated);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to update payment out settings",
        });
    }
};
exports.updatePaymentOutSettings = updatePaymentOutSettings;

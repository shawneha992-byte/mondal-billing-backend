"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProformaInvoices = exports.createProformaInvoice = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const client_1 = require("@prisma/client");
const createProformaInvoice = async (req, res) => {
    try {
        const { customerName, customerPhone, quotationId, items, discountAmount = 0, taxAmount = 0 } = req.body;
        if (!customerName || !items || items.length === 0) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        const subTotal = items.reduce((sum, item) => sum + item.rate * item.quantity, 0);
        const grandTotal = subTotal - discountAmount + taxAmount;
        const proforma = await prisma_1.default.proformaInvoice.create({
            data: {
                proformaNumber: `PI-${Date.now()}`,
                customerName,
                customerPhone,
                quotationId: quotationId ? String(quotationId) : null, // ✅ optional linkage
                subTotal,
                discountAmount,
                taxAmount,
                grandTotal,
                status: client_1.ProformaStatus.DRAFT, // ✅ default status
                items: {
                    create: items.map((item) => ({
                        productName: item.productName,
                        quantity: item.quantity,
                        rate: item.rate, // ✅ REQUIRED
                        taxPercent: item.taxPercent ?? 0,
                        taxAmount: item.taxAmount ?? 0,
                        total: item.total
                    }))
                }
            },
            include: {
                items: true
            }
        });
        // ✅ Task-style response (no wrapper)
        res.status(201).json(proforma);
    }
    catch (error) {
        console.error("PROFORMA ERROR:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
exports.createProformaInvoice = createProformaInvoice;
const getProformaInvoices = async (_req, res) => {
    try {
        const proformas = await prisma_1.default.proformaInvoice.findMany({
            select: {
                id: true,
                proformaNumber: true,
                customerName: true,
                grandTotal: true,
                status: true,
                createdAt: true
            },
            orderBy: {
                createdAt: "desc"
            }
        });
        // ✅ Task-style list response
        res.json(proformas);
    }
    catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};
exports.getProformaInvoices = getProformaInvoices;

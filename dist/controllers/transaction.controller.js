"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPartyItemWise = exports.getPartyTransactions = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
// ==============================
// 1️⃣ Transactions Controller
// ==============================
const getPartyTransactions = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        const invoices = await prisma_1.default.invoice.findMany({
            where: { partyId },
        });
        const payments = await prisma_1.default.paymentIn.findMany({
            where: { partyId },
        });
        const returns = await prisma_1.default.salesReturn.findMany({
            where: { partyId },
        });
        const formatted = [
            ...invoices.map((inv) => ({
                id: inv.id,
                date: inv.createdAt,
                type: "Sales Invoice",
                number: inv.invoiceNo,
                amount: Number(inv.totalAmount),
                status: inv.status === "PAID"
                    ? "Paid"
                    : inv.status === "PARTIAL"
                        ? "Partial Paid"
                        : "Unpaid",
            })),
            ...payments.map((pay) => ({
                id: pay.id,
                date: pay.date,
                type: "Payment In",
                number: pay.paymentNo,
                amount: Number(pay.amount),
                status: "Paid",
            })),
            ...returns.map((ret) => ({
                id: ret.id,
                date: ret.createdAt,
                type: "Sales Return",
                number: ret.id,
                amount: ret.totalAmount,
                status: "Paid",
            })),
        ];
        res.json({
            success: true,
            data: formatted,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};
exports.getPartyTransactions = getPartyTransactions;
// ==============================
// 2️⃣ Item Wise Controller
// ==============================
const getPartyItemWise = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        const items = await prisma_1.default.invoiceItem.findMany({
            where: {
                invoice: {
                    partyId: partyId,
                },
            },
            include: {
                invoice: true,
                product: true,
            },
        });
        const formatted = items.map((item) => ({
            partyId: item.invoice.partyId,
            itemName: item.product.name,
            itemCode: item.product.id,
            quantity: item.quantity,
            amount: item.total,
            type: "Sale",
            date: item.invoice.createdAt,
        }));
        res.json({
            success: true,
            data: formatted,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};
exports.getPartyItemWise = getPartyItemWise;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPartyBalance = exports.getPartyLedger = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
/**
 * GET Party Ledger
 * URL: /api/party-ledger/party/:id/ledger
 */
const getPartyLedger = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        // 1. Fetch party for opening balance
        const party = await prisma_1.default.party.findUnique({ where: { id: partyId } });
        if (!party)
            return res.status(404).json({ success: false, message: "Party not found" });
        const openingBalance = party.openingBalanceType === "To_Collect"
            ? Number(party.openingBalance || 0)
            : -Number(party.openingBalance || 0);
        // 2. Fetch ledger entries — SKIP Opening type (shown as header row in frontend)
        const entries = await prisma_1.default.partyLedger.findMany({
            where: { partyId, refType: { not: "Opening" } },
            orderBy: [{ date: "asc" }, { id: "asc" }],
        });
        // 3. Resolve voucher numbers via lookup maps (no N+1)
        const invoiceIds = entries.filter(e => e.refType === "Invoice" && e.refId).map(e => e.refId);
        const paymentIds = entries.filter(e => e.refType === "Payment" && e.refId).map(e => e.refId);
        const returnIds = entries.filter(e => e.refType === "Return" && e.refId).map(e => e.refId);
        const [invoices, payments, returns] = await Promise.all([
            invoiceIds.length > 0
                ? prisma_1.default.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, invoiceNo: true } })
                : [],
            paymentIds.length > 0
                ? prisma_1.default.paymentIn.findMany({ where: { id: { in: paymentIds } }, select: { id: true, paymentNo: true } })
                : [],
            returnIds.length > 0
                ? prisma_1.default.salesReturn.findMany({ where: { id: { in: returnIds } }, select: { id: true } })
                : [],
        ]);
        const invoiceMap = new Map(invoices.map(i => [i.id, i.invoiceNo]));
        const paymentMap = new Map(payments.map(p => [p.id, p.paymentNo]));
        // 4. Compute running balance from openingBalance
        //    DEBIT  = Invoice created → party owes us more  → balance goes UP
        //    CREDIT = Payment received → party paid us       → balance goes DOWN
        let runningBalance = openingBalance;
        const data = entries.map((e, idx) => {
            const amount = Number(e.amount || e.credit || e.debit || 0);
            let debit = null;
            let credit = null;
            if (e.type === "DEBIT") {
                debit = amount;
                runningBalance += amount; // invoice → party owes more
            }
            else {
                credit = amount;
                runningBalance -= amount; // payment/return → party owes less
            }
            // Resolve voucher label
            let voucher = e.reference || "";
            if (e.refType === "Invoice" && e.refId) {
                voucher = invoiceMap.get(e.refId) || `INV-${e.refId}`;
            }
            else if (e.refType === "Payment" && e.refId) {
                voucher = paymentMap.get(e.refId) || `PAY-${e.refId}`;
            }
            else if (e.refType === "Return" && e.refId) {
                voucher = `RET-${e.refId}`;
            }
            return {
                id: e.id,
                date: e.date ? e.date.toISOString().slice(0, 10) : "",
                voucher,
                refType: e.refType,
                debit,
                credit,
                balance: Math.round(runningBalance * 100) / 100,
            };
        });
        return res.status(200).json({
            success: true,
            data,
            openingBalance: Math.round(openingBalance * 100) / 100,
            closingBalance: Math.round(runningBalance * 100) / 100,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to fetch party ledger" });
    }
};
exports.getPartyLedger = getPartyLedger;
/**
 * GET Party Balance — URL: /api/party-ledger/party/:id/balance
 */
const getPartyBalance = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        const latest = await prisma_1.default.partyLedger.findFirst({
            where: { partyId },
            orderBy: { date: "desc" },
        });
        return res.status(200).json({ success: true, balance: latest ? Number(latest.balance) : 0 });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Failed to fetch party balance" });
    }
};
exports.getPartyBalance = getPartyBalance;

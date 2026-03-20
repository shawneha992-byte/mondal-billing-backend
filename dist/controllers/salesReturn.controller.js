"use strict";
/**
 * salesReturn.controller.ts
 * ─────────────────────────────────────────────────────────────
 * Sales Return = customer returns items → stock comes back IN.
 * Writes StockRefType.SALES_RETURN ledger entry.
 * On delete → reverses the entry (stock goes back OUT).
 *
 * Route file: salesReturn.routes.ts  (already registered in index.ts)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSalesReturn = exports.getSalesReturns = exports.createSalesReturn = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const client_1 = require("@prisma/client");
const stockLedger_service_1 = require("../services/stockLedger.service");
/* ═══════════════════════════════════════════════════════════
   CREATE SALES RETURN
   POST /api/sales-return/sales-return
═══════════════════════════════════════════════════════════ */
const createSalesReturn = async (req, res) => {
    try {
        const { invoiceId, partyId, items = [], reason } = req.body;
        if (!invoiceId || !partyId || !items.length) {
            return res.status(400).json({
                success: false,
                message: "invoiceId, partyId and items are required",
            });
        }
        const result = await prisma_1.default.$transaction(async (tx) => {
            // Validate the source invoice
            const invoice = await tx.invoice.findUnique({
                where: { id: Number(invoiceId) },
                include: { items: true },
            });
            if (!invoice)
                throw new Error("Invoice not found");
            // Compute return total
            const totalAmount = items.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0);
            // Create SalesReturn record
            const salesReturn = await tx.salesReturn.create({
                data: {
                    invoiceId: Number(invoiceId),
                    partyId: Number(partyId),
                    totalAmount,
                    items: {
                        create: items.map((i) => ({
                            productId: Number(i.productId),
                            quantity: Number(i.quantity),
                            price: Number(i.price),
                        })),
                    },
                },
                include: { items: true },
            });
            // ── STOCK IN — returned items go back into stock ───────
            for (const item of salesReturn.items) {
                const product = await tx.product.findUnique({ where: { id: item.productId } });
                if (product?.itemType !== "Product")
                    continue;
                // Use same godown as the original invoice item where possible
                const originalItem = await tx.invoiceItem.findFirst({
                    where: { invoiceId: Number(invoiceId), productId: item.productId },
                });
                await (0, stockLedger_service_1.writeStockLedger)({
                    tx,
                    productId: item.productId,
                    godownId: originalItem?.godownId ?? null,
                    refType: client_1.StockRefType.SALES_RETURN,
                    refId: salesReturn.id,
                    quantityIn: item.quantity,
                    remarks: `Sales Return — ${invoice.invoiceNo}`,
                    date: new Date(),
                });
            }
            // ── Party Ledger CREDIT — reduce what party owes ───────
            const lastBalance = await getLastPartyBalance(tx, Number(partyId));
            await tx.partyLedger.create({
                data: {
                    partyId: Number(partyId),
                    refType: client_1.LedgerRefType.Return,
                    refId: salesReturn.id,
                    reference: `RET-${salesReturn.id}`,
                    type: client_1.LedgerType.CREDIT,
                    credit: totalAmount,
                    debit: null,
                    balance: lastBalance - totalAmount,
                },
            });
            return salesReturn;
        });
        return res.status(201).json({ success: true, message: "Sales return created", data: result });
    }
    catch (error) {
        console.error("❌ createSalesReturn:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
};
exports.createSalesReturn = createSalesReturn;
/* ═══════════════════════════════════════════════════════════
   GET ALL SALES RETURNS
   GET /api/sales-return/sales-return
═══════════════════════════════════════════════════════════ */
const getSalesReturns = async (req, res) => {
    try {
        const { partyId, invoiceId } = req.query;
        const where = {};
        if (partyId)
            where.partyId = Number(partyId);
        if (invoiceId)
            where.invoiceId = Number(invoiceId);
        const returns = await prisma_1.default.salesReturn.findMany({
            where,
            include: {
                party: { select: { id: true, partyName: true } },
                invoice: { select: { id: true, invoiceNo: true } },
                items: { include: { product: { select: { id: true, name: true, unit: true } } } },
            },
            orderBy: { createdAt: "desc" },
        });
        return res.json({ success: true, data: returns });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch sales returns" });
    }
};
exports.getSalesReturns = getSalesReturns;
/* ═══════════════════════════════════════════════════════════
   DELETE SALES RETURN  (reverses stock correction)
   DELETE /api/sales-return/:id  ← add this route if needed
═══════════════════════════════════════════════════════════ */
const deleteSalesReturn = async (req, res) => {
    try {
        const id = Number(req.params.id);
        await prisma_1.default.$transaction(async (tx) => {
            const ret = await tx.salesReturn.findUnique({ where: { id } });
            if (!ret)
                throw new Error("Sales return not found");
            // ✅ Reverse stock — returned items go back OUT
            await (0, stockLedger_service_1.reverseStockLedger)(tx, client_1.StockRefType.SALES_RETURN, id);
            // Reverse party ledger credit
            await tx.partyLedger.deleteMany({
                where: { refType: client_1.LedgerRefType.Return, refId: id },
            });
            await tx.salesReturnItem.deleteMany({ where: { salesReturnId: id } });
            await tx.salesReturn.delete({ where: { id } });
        });
        return res.json({ success: true, message: "Sales return deleted" });
    }
    catch (error) {
        console.error("❌ deleteSalesReturn:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.deleteSalesReturn = deleteSalesReturn;
/* ─────────────────────────────────────────────
   HELPER — last party ledger balance
───────────────────────────────────────────── */
async function getLastPartyBalance(tx, partyId) {
    const last = await tx.partyLedger.findFirst({
        where: { partyId },
        orderBy: { createdAt: "desc" },
        select: { balance: true },
    });
    return last ? Number(last.balance) : 0;
}

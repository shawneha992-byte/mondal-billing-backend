"use strict";
/**
 * Purchaseinvoice.controller.ts
 * ─────────────────────────────────────────────────────────────
 * Purchase Invoice → stock IN on create.
 * Cancel / Delete  → stock reversed OUT via reverseStockLedger.
 *
 * Route file already exists:  Purchaseinvoice.routes.ts
 * Register in index.ts:
 *   import purchaseInvoiceRoutes from "./Purchaseinvoice.routes";
 *   router.use("/purchase-invoices", purchaseInvoiceRoutes);   ← already done per index.ts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPendingInvoicesByParty = exports.getPurchaseInvoiceSummary = exports.recordPurchaseInvoicePayment = exports.cancelPurchaseInvoice = exports.deletePurchaseInvoice = exports.updatePurchaseInvoice = exports.getPurchaseInvoiceById = exports.getPurchaseInvoices = exports.createPurchaseInvoice = exports.getNextPurchaseInvoiceNumber = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const client_1 = require("@prisma/client");
const ledger_service_1 = require("../services/ledger.service");
const stockLedger_service_1 = require("../services/stockLedger.service");
function calcTotals(items, additionalCharges, discountAmount, roundOff) {
    let subTotal = 0;
    let taxAmount = 0;
    for (const item of items) {
        const base = Number(item.price) * Number(item.quantity);
        const discount = Number(item.discount ?? 0);
        const taxable = base - discount;
        const tax = taxable * (Number(item.taxRate ?? 0) / 100);
        subTotal += taxable;
        taxAmount += tax;
    }
    const additionalChargesTotal = additionalCharges.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
    const taxableAmount = subTotal + additionalChargesTotal - Number(discountAmount);
    const totalAmount = Number((taxableAmount + taxAmount + Number(roundOff)).toFixed(2));
    return {
        subTotal,
        taxAmount,
        additionalChargesTotal,
        taxableAmount,
        totalAmount,
    };
}
function deriveStatus(amountPaid, totalAmount) {
    if (amountPaid <= 0)
        return client_1.PurchaseInvoiceStatus.OPEN;
    if (amountPaid >= totalAmount)
        return client_1.PurchaseInvoiceStatus.PAID;
    return client_1.PurchaseInvoiceStatus.PARTIAL;
}
/**
 * Resolves the godownId for an item:
 * - Uses item.godownId if provided (normal invoice flow)
 * - Falls back to ProductStock godownId (correct schema usage)
 * - Throws a clear error if neither is configured
 */
async function resolveGodownId(tx, item) {
    if (item.godownId) {
        return Number(item.godownId);
    }
    const stock = await tx.productStock.findFirst({
        where: {
            productId: Number(item.productId),
        },
        select: {
            godownId: true,
        },
    });
    if (!stock?.godownId) {
        throw new Error(`No godown assigned for productId: ${item.productId}. Please assign stock to a godown first.`);
    }
    return stock.godownId;
}
/* ═══════════════════════════════════════════════════════════════
   GET NEXT INVOICE NUMBER  —  GET /api/purchase-invoices/next-invoice-number
═══════════════════════════════════════════════════════════════ */
const getNextPurchaseInvoiceNumber = async (_req, res) => {
    try {
        let settings = await prisma_1.default.purchaseInvoiceSettings.findFirst();
        if (!settings) {
            settings = await prisma_1.default.purchaseInvoiceSettings.create({
                data: {
                    prefix: "PI",
                    sequenceNumber: 1,
                    enablePrefix: true,
                },
            });
        }
        const nextSequence = settings.sequenceNumber;
        const invoiceNumber = settings.enablePrefix
            ? `${settings.prefix ?? ""}${nextSequence}`
            : String(nextSequence);
        return res.json({
            success: true,
            sequenceNumber: nextSequence,
            invoiceNumber,
        });
    }
    catch (error) {
        console.error("getNextPurchaseInvoiceNumber:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get next invoice number",
        });
    }
};
exports.getNextPurchaseInvoiceNumber = getNextPurchaseInvoiceNumber;
/* ═══════════════════════════════════════════════════════════════
   CREATE  —  POST /api/purchase-invoices
═══════════════════════════════════════════════════════════════ */
const createPurchaseInvoice = async (req, res) => {
    try {
        const { partyId, branchCode, originalInvNo, // FIX 1: added missing destructure
        invoiceDate, dueDate, items = [], additionalCharges = [], discountAmount = 0, roundOff = 0, paymentMode, amountPaid = 0, notes, termsConditions, ewayBillNo, challanNo, financedBy, salesman, emailId, warrantyPeriod, applyTcs = false, applyTds = false, autoRoundOff = false, } = req.body;
        if (!partyId)
            return res
                .status(400)
                .json({ success: false, message: "Party is required" });
        if (!items.length)
            return res
                .status(400)
                .json({ success: false, message: "Invoice must contain at least one item" });
        // godownId is optional — resolveGodownId() will auto-fetch from product if missing
        for (const item of items) {
            item.godownId = item.godownId ?? null;
        }
        const result = await prisma_1.default.$transaction(async (tx) => {
            const { subTotal, taxAmount, additionalChargesTotal, taxableAmount, totalAmount, } = calcTotals(items, additionalCharges, Number(discountAmount), Number(roundOff));
            const paid = Number(amountPaid);
            const balanceAmount = Math.max(0, totalAmount - paid);
            /* ── invoice numbering ── */
            let settings = await tx.purchaseInvoiceSettings.findFirst();
            if (!settings) {
                settings = await tx.purchaseInvoiceSettings.create({
                    data: {
                        prefix: "PI",
                        sequenceNumber: 1,
                        enablePrefix: true,
                    },
                });
            }
            /* fetch sequence only from DB */
            const seq = settings.sequenceNumber;
            /* generate invoice number */
            const purchaseInvNo = settings.enablePrefix
                ? `${settings.prefix}${seq}`
                : String(seq);
            const invoice = await tx.purchaseInvoice.create({
                data: {
                    purchaseInvNo,
                    originalInvNo: originalInvNo ?? null,
                    partyId: Number(partyId),
                    branchCode: branchCode ?? null,
                    invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
                    dueDate: dueDate ? new Date(dueDate) : null,
                    ewayBillNo: ewayBillNo ?? null,
                    challanNo: challanNo ?? null,
                    financedBy: financedBy ?? null,
                    salesman: salesman ?? null,
                    emailId: emailId ?? null,
                    warrantyPeriod: warrantyPeriod ?? null,
                    notes: notes ?? null,
                    termsConditions: termsConditions ?? null,
                    subTotal,
                    taxableAmount,
                    discountAmount: Number(discountAmount),
                    additionalChargesTotal,
                    taxAmount,
                    roundOff: Number(roundOff),
                    totalAmount,
                    amountPaid: paid,
                    balanceAmount,
                    paymentMode: paymentMode ?? null,
                    applyTcs,
                    applyTds,
                    autoRoundOff,
                    status: deriveStatus(paid, totalAmount),
                },
            });
            await tx.purchaseInvoiceSettings.update({
                where: { id: settings.id },
                data: { sequenceNumber: { increment: 1 } },
            });
            /* ── items + stock ── */
            for (const item of items) {
                if (Number(item.quantity) <= 0) {
                    throw new Error(`Quantity must be greater than zero for productId: ${item.productId}`);
                }
                const base = Number(item.price) * Number(item.quantity);
                const discount = Number(item.discount ?? 0);
                const taxable = base - discount;
                const tax = taxable * (Number(item.taxRate ?? 0) / 100);
                // ✅ Properly resolve godown from product stock if frontend did not send it
                const godownId = await resolveGodownId(tx, item);
                await tx.purchaseInvoiceItem.create({
                    data: {
                        purchaseInvoiceId: invoice.id,
                        productId: Number(item.productId),
                        godownId: godownId,
                        hsnSac: item.hsnSac ?? null,
                        quantity: Number(item.quantity),
                        price: Number(item.price),
                        discount: discount,
                        taxRate: Number(item.taxRate ?? 0),
                        taxAmount: tax,
                        total: taxable,
                    },
                });
                await (0, stockLedger_service_1.writeStockLedger)({
                    tx,
                    productId: Number(item.productId),
                    godownId,
                    refType: client_1.StockRefType.PURCHASE,
                    refId: invoice.id,
                    quantityIn: Number(item.quantity),
                    remarks: `Purchase Invoice ${invoice.purchaseInvNo}`,
                    date: invoice.invoiceDate,
                });
            }
            /* ── additional charges ── */
            for (const charge of additionalCharges) {
                await tx.purchaseInvoiceAdditionalCharge.create({
                    data: {
                        purchaseInvoiceId: invoice.id,
                        name: charge.name ?? charge.label ?? "",
                        amount: Number(charge.amount ?? 0),
                    },
                });
            }
            /* ── ledger: credit ── */
            const runningBalance = (await (0, ledger_service_1.getLastPartyBalanceTx)(tx, Number(partyId))) + totalAmount;
            await tx.partyLedger.create({
                data: {
                    partyId: Number(partyId),
                    refType: client_1.LedgerRefType.PurchaseInvoice,
                    refId: invoice.id,
                    reference: purchaseInvNo,
                    type: client_1.LedgerType.CREDIT,
                    debit: null,
                    credit: totalAmount,
                    balance: runningBalance,
                },
            });
            /* ── ledger: debit (payment already made) ── */
            if (paid > 0) {
                await tx.partyLedger.create({
                    data: {
                        partyId: Number(partyId),
                        refType: client_1.LedgerRefType.Payment,
                        refId: invoice.id,
                        reference: purchaseInvNo,
                        type: client_1.LedgerType.DEBIT,
                        debit: paid,
                        credit: null,
                        balance: runningBalance - paid,
                    },
                });
            }
            return invoice;
        });
        return res.status(201).json({
            success: true,
            message: "Purchase invoice created successfully",
            data: result,
        });
    }
    catch (error) {
        console.error("❌ createPurchaseInvoice:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
};
exports.createPurchaseInvoice = createPurchaseInvoice;
/* ═══════════════════════════════════════════════════════════════
   GET ALL  —  GET /api/purchase-invoices
═══════════════════════════════════════════════════════ */
// FIX 2: added missing return res.json(...)
const getPurchaseInvoices = async (_req, res) => {
    try {
        const invoices = await prisma_1.default.purchaseInvoice.findMany({
            include: { party: true, items: { include: { product: true } }, additionalCharges: true },
            orderBy: { invoiceDate: "desc" },
        });
        return res.json({
            success: true,
            data: invoices,
        });
    }
    catch (error) {
        console.error("❌ getPurchaseInvoices:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch purchase invoices",
        });
    }
};
exports.getPurchaseInvoices = getPurchaseInvoices;
/* ═══════════════════════════════════════════════════════
   GET BY ID  —  GET /api/purchase-invoices/:id
═══════════════════════════════════════════════════════ */
const getPurchaseInvoiceById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const invoice = await prisma_1.default.purchaseInvoice.findUnique({
            where: { id },
            include: { party: true, items: { include: { product: true } }, additionalCharges: true },
        });
        if (!invoice)
            return res
                .status(404)
                .json({ success: false, message: "Invoice not found" });
        res.json({ success: true, data: invoice });
    }
    catch (error) {
        console.error("getPurchaseInvoiceById:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.getPurchaseInvoiceById = getPurchaseInvoiceById;
/* ═══════════════════════════════════════════════════════
   UPDATE  —  PUT /api/purchase-invoices/:id
═══════════════════════════════════════════════════════ */
const updatePurchaseInvoice = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { partyId, invoiceDate, dueDate, items = [], additionalCharges = [], discountAmount = 0, roundOff = 0, paymentMode, amountPaid = 0, notes, ewayBillNo, challanNo, financedBy, salesman, emailId, warrantyPeriod, applyTcs = false, applyTds = false, autoRoundOff = false, } = req.body;
        // godownId is optional — resolveGodownId() will auto-fetch from product if missing
        for (const item of items) {
            item.godownId = item.godownId ?? null;
        }
        const existing = await prisma_1.default.purchaseInvoice.findUnique({ where: { id } });
        if (!existing)
            return res
                .status(404)
                .json({ success: false, message: "Invoice not found" });
        const result = await prisma_1.default.$transaction(async (tx) => {
            const { subTotal, taxAmount, additionalChargesTotal, taxableAmount, totalAmount, } = calcTotals(items, additionalCharges, Number(discountAmount), Number(roundOff));
            const paid = Number(amountPaid);
            const balanceAmount = Math.max(0, totalAmount - paid);
            const updated = await tx.purchaseInvoice.update({
                where: { id },
                data: {
                    partyId: Number(partyId),
                    invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
                    dueDate: dueDate ? new Date(dueDate) : null,
                    ewayBillNo: ewayBillNo ?? null,
                    challanNo: challanNo ?? null,
                    financedBy: financedBy ?? null,
                    salesman: salesman ?? null,
                    emailId: emailId ?? null,
                    warrantyPeriod: warrantyPeriod ?? null,
                    notes: notes ?? null,
                    paymentMode: paymentMode ?? null,
                    applyTcs,
                    applyTds,
                    autoRoundOff,
                    subTotal,
                    taxableAmount,
                    discountAmount: Number(discountAmount),
                    additionalChargesTotal,
                    taxAmount,
                    roundOff: Number(roundOff),
                    totalAmount,
                    amountPaid: paid,
                    balanceAmount,
                    status: deriveStatus(paid, totalAmount),
                },
            });
            /* ── reverse stock for old items via service ── */
            await (0, stockLedger_service_1.reverseStockLedger)(tx, client_1.StockRefType.PURCHASE, id);
            await tx.purchaseInvoiceItem.deleteMany({ where: { purchaseInvoiceId: id } });
            await tx.purchaseInvoiceAdditionalCharge.deleteMany({ where: { purchaseInvoiceId: id } });
            /* ── re-create items + increment stock ── */
            for (const item of items) {
                // IMPROVEMENT 3: reject zero or negative quantities before touching stock
                if (Number(item.quantity) <= 0) {
                    throw new Error(`Quantity must be greater than zero for productId: ${item.productId}`);
                }
                const base = Number(item.price) * Number(item.quantity);
                const discount = Number(item.discount ?? 0);
                const taxable = base - discount;
                const tax = taxable * (Number(item.taxRate ?? 0) / 100);
                // Auto-resolve godownId from product stock if not provided by frontend
                const godownId = await resolveGodownId(tx, item);
                await tx.purchaseInvoiceItem.create({
                    data: {
                        purchaseInvoiceId: id,
                        productId: Number(item.productId),
                        godownId,
                        hsnSac: item.hsnSac ?? null,
                        quantity: Number(item.quantity),
                        price: Number(item.price),
                        discount,
                        taxRate: Number(item.taxRate ?? 0),
                        taxAmount: tax,
                        total: taxable,
                    },
                });
                await (0, stockLedger_service_1.writeStockLedger)({
                    tx,
                    productId: Number(item.productId),
                    godownId,
                    refType: client_1.StockRefType.PURCHASE,
                    refId: id,
                    quantityIn: Number(item.quantity),
                    remarks: `Purchase Invoice Update`,
                    date: new Date(),
                });
            }
            for (const charge of additionalCharges) {
                await tx.purchaseInvoiceAdditionalCharge.create({
                    data: {
                        purchaseInvoiceId: id,
                        name: charge.name ?? charge.label ?? "",
                        amount: Number(charge.amount ?? 0),
                    },
                });
            }
            await tx.partyLedger.deleteMany({
                where: { refId: id, refType: client_1.LedgerRefType.PurchaseInvoice },
            });
            const runningBalance = (await (0, ledger_service_1.getLastPartyBalanceTx)(tx, Number(partyId))) + totalAmount;
            await tx.partyLedger.create({
                data: {
                    partyId: Number(partyId),
                    refType: client_1.LedgerRefType.PurchaseInvoice,
                    refId: id,
                    reference: existing.purchaseInvNo,
                    type: client_1.LedgerType.CREDIT,
                    debit: null,
                    credit: totalAmount,
                    balance: runningBalance,
                },
            });
            if (paid > 0) {
                await tx.partyLedger.create({
                    data: {
                        partyId: Number(partyId),
                        refType: client_1.LedgerRefType.Payment,
                        refId: id,
                        reference: existing.purchaseInvNo,
                        type: client_1.LedgerType.DEBIT,
                        debit: paid,
                        credit: null,
                        balance: runningBalance - paid,
                    },
                });
            }
            return updated;
        });
        return res.json({
            success: true,
            message: "Purchase invoice updated successfully",
            data: result,
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.updatePurchaseInvoice = updatePurchaseInvoice;
/* ═══════════════════════════════════════════════════════
   DELETE  —  DELETE /api/purchase-invoices/:id
═══════════════════════════════════════════════════════ */
const deletePurchaseInvoice = async (req, res) => {
    try {
        const id = Number(req.params.id);
        await prisma_1.default.$transaction(async (tx) => {
            const invoice = await tx.purchaseInvoice.findUnique({
                where: { id },
            });
            if (!invoice)
                throw new Error("Invoice not found");
            // Reverse all stock movements for this invoice via service
            await (0, stockLedger_service_1.reverseStockLedger)(tx, client_1.StockRefType.PURCHASE, id);
            await tx.purchaseInvoiceItem.deleteMany({ where: { purchaseInvoiceId: id } });
            await tx.purchaseInvoiceAdditionalCharge.deleteMany({ where: { purchaseInvoiceId: id } });
            await tx.partyLedger.deleteMany({
                where: { refId: id, refType: client_1.LedgerRefType.PurchaseInvoice },
            });
            await tx.purchaseInvoice.delete({ where: { id } });
        });
        res.json({ success: true, message: "Invoice deleted and stock reversed" });
    }
    catch (error) {
        console.error("deletePurchaseInvoice:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.deletePurchaseInvoice = deletePurchaseInvoice;
/* ═══════════════════════════════════════════════════════
   CANCEL  —  PATCH /api/purchase-invoices/:id/cancel
═══════════════════════════════════════════════════════ */
const cancelPurchaseInvoice = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const result = await prisma_1.default.$transaction(async (tx) => {
            const invoice = await tx.purchaseInvoice.findUnique({
                where: { id },
            });
            if (!invoice)
                throw new Error("Invoice not found");
            if (invoice.status === client_1.PurchaseInvoiceStatus.CANCELLED)
                throw new Error("Invoice already cancelled");
            // Reverse all stock movements for this invoice via service
            await (0, stockLedger_service_1.reverseStockLedger)(tx, client_1.StockRefType.PURCHASE, id);
            return tx.purchaseInvoice.update({
                where: { id },
                data: { status: client_1.PurchaseInvoiceStatus.CANCELLED },
            });
        });
        res.json({ success: true, data: result });
    }
    catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};
exports.cancelPurchaseInvoice = cancelPurchaseInvoice;
/* ═══════════════════════════════════════════════════════
   RECORD PAYMENT  —  PATCH /api/purchase-invoices/:id/payment
═══════════════════════════════════════════════════════ */
// FIX 3: rewrote entire broken function — closed transaction, removed
//        undefined variables (currentBalance, lastBal), removed duplicate
//        newPaid declaration, fixed tx scope, added missing closing braces.
const recordPurchaseInvoicePayment = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const amount = Number(req.body.amount ?? 0);
        if (amount <= 0) {
            return res
                .status(400)
                .json({ success: false, message: "Amount must be positive" });
        }
        const invoice = await prisma_1.default.purchaseInvoice.findUnique({
            where: { id },
        });
        if (!invoice) {
            return res
                .status(404)
                .json({ success: false, message: "Invoice not found" });
        }
        const updated = await prisma_1.default.$transaction(async (tx) => {
            const newPaid = Number(invoice.amountPaid ?? 0) + amount;
            const newBalance = Math.max(0, Number(invoice.totalAmount) - newPaid);
            const newStatus = deriveStatus(newPaid, Number(invoice.totalAmount));
            const inv = await tx.purchaseInvoice.update({
                where: { id },
                data: {
                    amountPaid: newPaid,
                    balanceAmount: newBalance,
                    status: newStatus,
                },
            });
            const lastBal = await (0, ledger_service_1.getLastPartyBalanceTx)(tx, invoice.partyId);
            await tx.partyLedger.create({
                data: {
                    partyId: invoice.partyId,
                    refType: client_1.LedgerRefType.Payment,
                    refId: id,
                    reference: invoice.purchaseInvNo,
                    type: client_1.LedgerType.DEBIT,
                    debit: amount,
                    credit: null,
                    balance: lastBal - amount,
                },
            });
            return inv;
        });
        res.json({ success: true, data: updated });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.recordPurchaseInvoicePayment = recordPurchaseInvoicePayment;
/* ═══════════════════════════════════════════════════════
   SUMMARY  —  GET /api/purchase-invoices/summary
═══════════════════════════════════════════════════════ */
const getPurchaseInvoiceSummary = async (_req, res) => {
    try {
        const [totalAgg, statusCounts] = await Promise.all([
            prisma_1.default.purchaseInvoice.aggregate({
                where: { status: { not: client_1.PurchaseInvoiceStatus.CANCELLED } },
                _sum: { totalAmount: true, amountPaid: true, balanceAmount: true },
            }),
            prisma_1.default.purchaseInvoice.groupBy({ by: ["status"], _count: { id: true } }),
        ]);
        const statusMap = {};
        statusCounts.forEach((c) => { statusMap[c.status] = c._count.id; });
        return res.json({
            success: true,
            data: {
                totalPurchased: totalAgg._sum?.totalAmount ?? 0,
                totalPaid: totalAgg._sum?.amountPaid ?? 0,
                totalOutstanding: totalAgg._sum?.balanceAmount ?? 0,
                openCount: statusMap[client_1.PurchaseInvoiceStatus.OPEN] ?? 0,
                partialCount: statusMap[client_1.PurchaseInvoiceStatus.PARTIAL] ?? 0,
                paidCount: statusMap[client_1.PurchaseInvoiceStatus.PAID] ?? 0,
                cancelledCount: statusMap[client_1.PurchaseInvoiceStatus.CANCELLED] ?? 0,
            },
        });
    }
    catch (error) {
        console.error("❌ getPurchaseInvoiceSummary:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch summary" });
    }
};
exports.getPurchaseInvoiceSummary = getPurchaseInvoiceSummary;
/* ═══════════════════════════════════════════════════════
   PENDING BY PARTY  —  GET /api/purchase-invoices/party/:partyId/pending
═══════════════════════════════════════════════════════ */
const getPendingInvoicesByParty = async (req, res) => {
    try {
        const partyId = Number(req.params.partyId);
        const invoices = await prisma_1.default.purchaseInvoice.findMany({
            where: { partyId, balanceAmount: { gt: 0 } },
            orderBy: { invoiceDate: "desc" },
        });
        const result = invoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.purchaseInvNo,
            date: inv.invoiceDate,
            totalAmount: inv.totalAmount,
            paidAmount: inv.amountPaid,
            balanceAmount: inv.balanceAmount,
        }));
        res.json(result);
    }
    catch (error) {
        console.error("Pending Purchase Invoice Error:", error);
        res.status(500).json({ message: "Error fetching pending invoices" });
    }
};
exports.getPendingInvoicesByParty = getPendingInvoicesByParty;

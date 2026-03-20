"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePaymentIn = exports.updatePaymentIn = exports.createPaymentIn = exports.getPaymentInAccounts = exports.getPaymentInSettings = exports.getPaymentInById = exports.getPaymentsIn = void 0;
const client_1 = require("@prisma/client");
const generateNumber_1 = require("../utils/generateNumber");
const ledger_service_1 = require("../services/ledger.service");
const prisma_1 = __importDefault(require("../utils/prisma"));
// ─── Map frontend mode string → Prisma PaymentMode enum ──────────────────────
function toPaymentMode(mode) {
    const map = {
        cash: client_1.PaymentMode.CASH,
        upi: client_1.PaymentMode.UPI,
        card: client_1.PaymentMode.CARD,
        netbanking: client_1.PaymentMode.NETBANKING,
        "bank transfer": client_1.PaymentMode.BANK_TRANSFER,
        cheque: client_1.PaymentMode.CHEQUE,
    };
    return map[mode.trim().toLowerCase()] ?? client_1.PaymentMode.CASH;
}
// ─── Recalculate invoice status ───────────────────────────────────────────────
function calcStatus(outstanding, total) {
    if (outstanding <= 0)
        return client_1.InvoiceStatus.PAID;
    if (outstanding < total)
        return client_1.InvoiceStatus.PARTIAL;
    return client_1.InvoiceStatus.OPEN;
}
// ─── Shared invoice update helper (avoids repetition across 3 operations) ────
function updateInvoice(tx, inv, deltaAmount) {
    const newOutstanding = Math.max(0, Math.min(Number(inv.totalAmount), Number(inv.outstandingAmount) - deltaAmount));
    const newReceived = Math.max(0, Number(inv.receivedAmount ?? 0) + deltaAmount);
    return tx.invoice.update({
        where: { id: inv.id },
        data: {
            receivedAmount: newReceived,
            outstandingAmount: newOutstanding,
            status: calcStatus(newOutstanding, Number(inv.totalAmount)),
        },
    });
}
// ────────────────────────────────────────────────────────────────────────────
//  GET /api/payments-in              — paginated list
// ────────────────────────────────────────────────────────────────────────────
const getPaymentsIn = async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;
    const partyIdQ = req.query.partyId;
    const where = {};
    if (partyIdQ)
        where.partyId = Number(partyIdQ);
    if (search) {
        where.OR = [
            { paymentNo: { contains: search, mode: "insensitive" } },
            { party: { partyName: { contains: search, mode: "insensitive" } } },
        ];
    }
    if (dateFrom || dateTo) {
        const dateFilter = {};
        if (dateFrom)
            dateFilter.gte = new Date(dateFrom);
        if (dateTo)
            dateFilter.lte = new Date(`${dateTo}T23:59:59`);
        where.date = dateFilter;
    }
    try {
        const [total, payments] = await Promise.all([
            prisma_1.default.paymentIn.count({ where }),
            prisma_1.default.paymentIn.findMany({
                where,
                skip,
                take: limit,
                orderBy: { date: "desc" },
                include: {
                    party: { select: { id: true, partyName: true } },
                    account: { select: { id: true, accountHolder: true, bankName: true, type: true } },
                    allocations: {
                        include: {
                            invoice: {
                                select: {
                                    id: true, invoiceNo: true, invoiceDate: true, dueDate: true,
                                    totalAmount: true, outstandingAmount: true,
                                },
                            },
                        },
                    },
                },
            }),
        ]);
        res.json({
            payments: payments.map((p) => ({
                id: p.id,
                paymentNo: p.paymentNo,
                partyId: p.partyId,
                partyName: p.party.partyName,
                date: p.date.toISOString().split("T")[0],
                mode: p.mode,
                amount: Number(p.amount),
                notes: p.notes ?? "",
                accountId: p.accountId ?? null,
                accountName: p.account?.accountHolder ?? null,
                totalAmountSettled: p.allocations.reduce((s, a) => s + Number(a.amount), 0),
                allocations: p.allocations.map((a) => ({
                    invoiceId: a.invoiceId,
                    invoiceNo: a.invoice.invoiceNo,
                    invoiceDate: a.invoice.invoiceDate?.toISOString().split("T")[0] ?? "",
                    dueDate: a.invoice.dueDate?.toISOString().split("T")[0] ?? "",
                    totalAmount: Number(a.invoice.totalAmount),
                    amountReceived: Number(a.amount),
                    balanceAmount: Number(a.invoice.outstandingAmount),
                    tds: 0,
                    discount: 0,
                })),
            })),
            total,
            page,
            pages: Math.ceil(total / limit),
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
};
exports.getPaymentsIn = getPaymentsIn;
// ────────────────────────────────────────────────────────────────────────────
//  GET /api/payments-in/:id          — single payment
// ────────────────────────────────────────────────────────────────────────────
const getPaymentInById = async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const p = await prisma_1.default.paymentIn.findUnique({
            where: { id },
            include: {
                party: { select: { id: true, partyName: true } },
                account: { select: { id: true, accountHolder: true, bankName: true, type: true } },
                allocations: {
                    include: {
                        invoice: {
                            select: {
                                id: true, invoiceNo: true, invoiceDate: true, dueDate: true,
                                totalAmount: true, outstandingAmount: true,
                            },
                        },
                    },
                },
            },
        });
        if (!p)
            return res.status(404).json({ message: "Payment not found" });
        res.json({
            id: p.id,
            paymentNo: p.paymentNo,
            partyId: p.partyId,
            partyName: p.party.partyName,
            date: p.date.toISOString().split("T")[0],
            mode: p.mode,
            amount: Number(p.amount),
            notes: p.notes ?? "",
            accountId: p.accountId ?? null,
            accountName: p.account?.accountHolder ?? null,
            totalAmountSettled: p.allocations.reduce((s, a) => s + Number(a.amount), 0),
            allocations: p.allocations.map((a) => ({
                invoiceId: a.invoiceId,
                invoiceNo: a.invoice.invoiceNo,
                invoiceDate: a.invoice.invoiceDate?.toISOString().split("T")[0] ?? "",
                dueDate: a.invoice.dueDate?.toISOString().split("T")[0] ?? "",
                totalAmount: Number(a.invoice.totalAmount),
                amountReceived: Number(a.amount),
                balanceAmount: Number(a.invoice.outstandingAmount),
                tds: 0,
                discount: 0,
            })),
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
};
exports.getPaymentInById = getPaymentInById;
// ────────────────────────────────────────────────────────────────────────────
//  GET /api/payments-in/settings     — next payment number
// ────────────────────────────────────────────────────────────────────────────
const getPaymentInSettings = async (_req, res) => {
    try {
        const last = await prisma_1.default.paymentIn.findFirst({ orderBy: { id: "desc" } });
        const nextNo = (0, generateNumber_1.generatePaymentNo)(last?.paymentNo);
        res.json({ nextPaymentNo: nextNo });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
};
exports.getPaymentInSettings = getPaymentInSettings;
// ────────────────────────────────────────────────────────────────────────────
//  GET /api/payments-in/accounts     — list business accounts for dropdown
// ────────────────────────────────────────────────────────────────────────────
const getPaymentInAccounts = async (_req, res) => {
    try {
        const accounts = await prisma_1.default.$queryRaw `
      SELECT id, "accountHolder", "bankName", "accountNumber", type::text,
             COALESCE(balance, 0)::float AS balance
      FROM   "Account"
      ORDER  BY "accountHolder" ASC
    `;
        res.json({ accounts });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
};
exports.getPaymentInAccounts = getPaymentInAccounts;
// ────────────────────────────────────────────────────────────────────────────
//  POST /api/payments-in             — create
// ────────────────────────────────────────────────────────────────────────────
const createPaymentIn = async (req, res) => {
    const { partyId, date, mode, amount, notes, accountId } = req.body;
    const allocations = req.body.allocations ?? [];
    if (!partyId || !amount || amount <= 0) {
        return res.status(400).json({ message: "partyId and a positive amount are required" });
    }
    try {
        const result = await prisma_1.default.$transaction(async (tx) => {
            // 1. Generate payment number
            const lastPayment = await tx.paymentIn.findFirst({ orderBy: { id: "desc" } });
            const paymentNo = (0, generateNumber_1.generatePaymentNo)(lastPayment?.paymentNo);
            // 2. Create payment record
            const payment = await tx.paymentIn.create({
                data: {
                    paymentNo,
                    partyId,
                    date: new Date(date),
                    mode: toPaymentMode(mode),
                    amount,
                    notes: notes || null,
                    accountId: accountId ? Number(accountId) : null,
                },
            });
            // 3. Credit the selected business account balance
            if (accountId) {
                await tx.$executeRaw `
            UPDATE "Account"
            SET    balance = balance + ${Number(amount)}
            WHERE  id = ${Number(accountId)}
          `;
            }
            // 4. Party ledger entry
            const lastBalance = await (0, ledger_service_1.getLastPartyBalanceTx)(tx, partyId);
            const newBalance = lastBalance - amount;
            await tx.partyLedger.create({
                data: {
                    partyId,
                    refType: "Payment",
                    refId: payment.id,
                    type: "CREDIT",
                    debit: null,
                    credit: amount,
                    balance: newBalance,
                },
            });
            // 5. Validate + process allocations
            const validAllocs = allocations.filter((a) => a.invoiceId && a.amount > 0);
            const allocatedTotal = validAllocs.reduce((s, a) => s + Number(a.amount), 0);
            if (allocatedTotal > Number(amount) + 0.01) {
                throw new Error("Allocated amount exceeds payment amount");
            }
            if (validAllocs.length > 0) {
                await tx.paymentAllocation.createMany({
                    data: validAllocs.map((a) => ({
                        paymentId: payment.id,
                        invoiceId: a.invoiceId,
                        amount: a.amount,
                    })),
                });
                const invoiceIds = validAllocs.map((a) => a.invoiceId);
                const affectedInvs = await tx.invoice.findMany({ where: { id: { in: invoiceIds } } });
                const invMap = new Map(affectedInvs.map((inv) => [inv.id, inv]));
                await Promise.all(validAllocs.map((alloc) => {
                    const inv = invMap.get(alloc.invoiceId);
                    if (!inv)
                        return Promise.resolve();
                    return updateInvoice(tx, inv, Number(alloc.amount));
                }));
            }
            return payment;
        }, { timeout: 15000 });
        res.status(201).json({
            message: "Payment recorded",
            data: { id: result.id, paymentNo: result.paymentNo },
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};
exports.createPaymentIn = createPaymentIn;
// ────────────────────────────────────────────────────────────────────────────
//  PUT /api/payments-in/:id          — update
// ────────────────────────────────────────────────────────────────────────────
const updatePaymentIn = async (req, res) => {
    const id = parseInt(req.params.id);
    const { date, mode, amount, notes, accountId } = req.body;
    const allocations = req.body.allocations ?? [];
    if (!amount || amount <= 0) {
        return res.status(400).json({ message: "A positive amount is required" });
    }
    try {
        await prisma_1.default.$transaction(async (tx) => {
            const existing = await tx.paymentIn.findUnique({
                where: { id },
                include: { allocations: true },
            });
            if (!existing)
                throw new Error("Payment not found");
            // 1. Reverse old account balance credit
            if (existing.accountId) {
                await tx.$executeRaw `
            UPDATE "Account"
            SET    balance = balance - ${Number(existing.amount)}
            WHERE  id = ${existing.accountId}
          `;
            }
            // 2. Fetch old invoice allocations in ONE query
            const oldInvoiceIds = existing.allocations.map((a) => a.invoiceId);
            const oldInvoices = oldInvoiceIds.length > 0
                ? await tx.invoice.findMany({ where: { id: { in: oldInvoiceIds } } })
                : [];
            const oldInvMap = new Map(oldInvoices.map((inv) => [inv.id, inv]));
            // 3. Revert old allocations in PARALLEL (negative delta = reverting)
            await Promise.all(existing.allocations.map((old) => {
                const inv = oldInvMap.get(old.invoiceId);
                if (!inv)
                    return Promise.resolve();
                return updateInvoice(tx, inv, -Number(old.amount));
            }));
            // 4. Delete old allocations + ledger in PARALLEL
            await Promise.all([
                tx.paymentAllocation.deleteMany({ where: { paymentId: id } }),
                tx.partyLedger.deleteMany({ where: { refType: "Payment", refId: id } }),
            ]);
            // 5. Update payment record
            await tx.paymentIn.update({
                where: { id },
                data: {
                    date: new Date(date),
                    mode: toPaymentMode(mode),
                    amount,
                    notes: notes || null,
                    accountId: accountId ? Number(accountId) : null,
                },
            });
            // 6. Credit new account balance
            if (accountId) {
                await tx.$executeRaw `
            UPDATE "Account"
            SET    balance = balance + ${Number(amount)}
            WHERE  id = ${Number(accountId)}
          `;
            }
            // 7. New ledger entry
            const lastBalance = await (0, ledger_service_1.getLastPartyBalanceTx)(tx, existing.partyId);
            const newBalance = lastBalance - amount;
            await tx.partyLedger.create({
                data: {
                    partyId: existing.partyId,
                    refType: "Payment",
                    refId: id,
                    type: "CREDIT",
                    debit: null,
                    credit: amount,
                    balance: newBalance,
                },
            });
            // 8. New allocations
            const validAllocs = allocations.filter((a) => a.invoiceId && a.amount > 0);
            const allocatedTotal = validAllocs.reduce((s, a) => s + Number(a.amount), 0);
            if (allocatedTotal > Number(amount) + 0.01) {
                throw new Error("Allocated amount exceeds payment amount");
            }
            if (validAllocs.length > 0) {
                await tx.paymentAllocation.createMany({
                    data: validAllocs.map((a) => ({
                        paymentId: id, invoiceId: a.invoiceId, amount: a.amount,
                    })),
                });
                const newInvoiceIds = validAllocs.map((a) => a.invoiceId);
                const newInvoices = await tx.invoice.findMany({ where: { id: { in: newInvoiceIds } } });
                const newInvMap = new Map(newInvoices.map((inv) => [inv.id, inv]));
                await Promise.all(validAllocs.map((alloc) => {
                    const inv = newInvMap.get(alloc.invoiceId);
                    if (!inv)
                        return Promise.resolve();
                    return updateInvoice(tx, inv, Number(alloc.amount));
                }));
            }
        }, { timeout: 15000 });
        res.json({ message: "Payment updated" });
    }
    catch (error) {
        console.error(error);
        res.status(error.message === "Payment not found" ? 404 : 500).json({ message: error.message });
    }
};
exports.updatePaymentIn = updatePaymentIn;
// ────────────────────────────────────────────────────────────────────────────
//  DELETE /api/payments-in/:id       — delete
// ────────────────────────────────────────────────────────────────────────────
const deletePaymentIn = async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        await prisma_1.default.$transaction(async (tx) => {
            const existing = await tx.paymentIn.findUnique({
                where: { id },
                include: { allocations: true },
            });
            if (!existing)
                throw new Error("Payment not found");
            // Reverse account balance before deletion
            if (existing.accountId) {
                await tx.$executeRaw `
            UPDATE "Account"
            SET    balance = balance - ${Number(existing.amount)}
            WHERE  id = ${existing.accountId}
          `;
            }
            // Fetch invoices in ONE query
            const invoiceIds = existing.allocations.map((a) => a.invoiceId);
            const invoices = invoiceIds.length > 0
                ? await tx.invoice.findMany({ where: { id: { in: invoiceIds } } })
                : [];
            const invMap = new Map(invoices.map((inv) => [inv.id, inv]));
            // Restore invoice outstanding amounts in PARALLEL (negative delta = reverting)
            await Promise.all(existing.allocations.map((alloc) => {
                const inv = invMap.get(alloc.invoiceId);
                if (!inv)
                    return Promise.resolve();
                return updateInvoice(tx, inv, -Number(alloc.amount));
            }));
            // Delete allocations, ledger, payment in PARALLEL
            await Promise.all([
                tx.paymentAllocation.deleteMany({ where: { paymentId: id } }),
                tx.partyLedger.deleteMany({ where: { refType: "Payment", refId: id } }),
            ]);
            await tx.paymentIn.delete({ where: { id } });
        }, { timeout: 15000 });
        res.json({ message: "Payment deleted" });
    }
    catch (error) {
        console.error(error);
        res.status(error.message === "Payment not found" ? 404 : 500).json({ message: error.message });
    }
};
exports.deletePaymentIn = deletePaymentIn;

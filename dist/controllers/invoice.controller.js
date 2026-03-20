"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteInvoice = exports.getPartyItemWiseReport = exports.getInvoiceSummary = exports.recordInvoicePayment = exports.cancelInvoice = exports.updateInvoice = exports.getInvoiceById = exports.getInvoices = exports.createInvoice = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const client_1 = require("@prisma/client");
const ledger_service_1 = require("../services/ledger.service");
/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
const deriveStatus = (received, total) => {
    if (received <= 0)
        return client_1.InvoiceStatus.OPEN;
    if (received >= total)
        return client_1.InvoiceStatus.PAID;
    return client_1.InvoiceStatus.PARTIAL;
};
/** Coerce any frontend string → Prisma PaymentMode enum (or null if not provided) */
const toPaymentMode = (mode) => {
    if (!mode)
        return null;
    const map = {
        cash: client_1.PaymentMode.CASH,
        upi: client_1.PaymentMode.UPI,
        card: client_1.PaymentMode.CARD,
        netbanking: client_1.PaymentMode.NETBANKING,
        bank_transfer: client_1.PaymentMode.BANK_TRANSFER,
        cheque: client_1.PaymentMode.CHEQUE,
    };
    return map[mode.trim().toLowerCase()] ?? client_1.PaymentMode.CASH;
};
/* ═══════════════════════════════════════════════════════════
   CREATE INVOICE
   POST /api/invoices
   FIX 1: timeout: 15000 on $transaction
   FIX 2: product validation & totals computed BEFORE entering tx
   FIX 3: parallel stock updates via Promise.all inside tx
   FIX 4: StockLedger writes moved OUTSIDE tx (non-critical)
   FIX 5: InvoiceSettings sequence updated via atomic increment
   FIX 6: discountPct now saved per line item so discount shows on bill
   FIX 7: line item `total` is now post-discount + tax (not gross)
   FIX 8: subtotal/taxAmount computed correctly after per-item discount
═══════════════════════════════════════════════════════════ */
const createInvoice = async (req, res) => {
    const { partyId, branchCode, invoiceDate, dueDate, items = [], additionalCharges = [], discountAmount = 0, roundOff = 0, paymentMode, receivedAmount = 0, notes, termsConditions, ewayBillNo, challanNo, financedBy, salesman, emailId, warrantyPeriod, applyTcs = false, autoRoundOff = false, signatureUrl, showEmptySignatureBox = false, } = req.body;
    if (!partyId || !items || items.length === 0) {
        return res.status(400).json({ success: false, message: "partyId and items are required" });
    }
    try {
        // ── PRE-FETCH: Read all products + stocks + settings BEFORE the transaction ──
        const productIds = items.map((i) => i.productId);
        const [allProducts, invoiceSettings] = await Promise.all([
            prisma_1.default.product.findMany({ where: { id: { in: productIds } } }),
            prisma_1.default.invoiceSettings.findFirst({ orderBy: { id: "asc" } }),
        ]);
        const productMap = new Map(allProducts.map((p) => [p.id, p]));
        // Validate all products exist before entering tx
        for (const item of items) {
            if (!productMap.has(item.productId)) {
                return res.status(400).json({
                    success: false,
                    message: `Product not found (ID: ${item.productId})`,
                });
            }
        }
        // Pre-fetch stocks for all product items (only Products, not Services)
        const productTypeItems = items.filter((i) => productMap.get(i.productId)?.itemType === "Product");
        const stockChecks = await Promise.all(productTypeItems.map((item) => item.godownId
            ? prisma_1.default.productStock.findUnique({
                where: { productId_godownId: { productId: item.productId, godownId: item.godownId } },
            })
            : prisma_1.default.productStock.findFirst({ where: { productId: item.productId } })));
        // Validate stock availability
        for (let i = 0; i < productTypeItems.length; i++) {
            const item = productTypeItems[i];
            const stock = stockChecks[i];
            const product = productMap.get(item.productId);
            const available = Number(stock?.currentStock ?? stock?.openingStock ?? 0);
            if (!stock || available < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for "${product.name}" (available: ${available}, requested: ${item.quantity})`,
                });
            }
        }
        // ── Compute totals OUTSIDE tx (pure CPU, no DB) ──────────────────────────
        // FIX: each line's taxable base is AFTER its own discount (pct + flat)
        let subTotal = 0;
        let taxAmount = 0;
        for (const item of items) {
            const lineGross = Number(item.price) * Number(item.quantity);
            const discPct = Number(item.discountPct ?? 0);
            const discAmt = Number(item.discount ?? 0);
            // pct discount applies to gross; flat discount is additive on top
            const totalDiscount = Math.round((lineGross * (discPct / 100) + discAmt) * 100) / 100;
            const taxableBase = Math.max(0, lineGross - totalDiscount);
            const lineTax = Math.round(taxableBase * ((item.taxRate || 0) / 100) * 100) / 100;
            subTotal += taxableBase; // subtotal = sum of (post-discount, pre-tax) line bases
            taxAmount += lineTax;
        }
        const additionalChargesTotal = additionalCharges.reduce((sum, c) => sum + (c.amount ?? 0), 0);
        const taxableAmount = subTotal - Number(discountAmount); // invoice-level discount
        const totalAmount = taxableAmount + taxAmount + additionalChargesTotal + Number(roundOff);
        const outstandingAmount = totalAmount - Number(receivedAmount);
        // ── Build invoice number OUTSIDE tx ──────────────────────────────────────
        const usePrefix = invoiceSettings?.enablePrefix ?? false;
        const prefix = usePrefix && invoiceSettings?.prefix?.trim()
            ? invoiceSettings.prefix.trim()
            : "INV-";
        const seqFromSettings = invoiceSettings?.sequenceNumber ?? 1;
        const allNos = await prisma_1.default.invoice.findMany({ select: { invoiceNo: true } });
        let maxExistingSeq = 0;
        for (const inv of allNos) {
            if (inv.invoiceNo?.startsWith(prefix)) {
                const m = inv.invoiceNo.slice(prefix.length).match(/^(\d+)$/);
                if (m)
                    maxExistingSeq = Math.max(maxExistingSeq, parseInt(m[1], 10));
            }
        }
        let nextSeq = Math.max(seqFromSettings, maxExistingSeq + 1);
        let invoiceNo = `${prefix}${String(nextSeq).padStart(5, "0")}`;
        while (await prisma_1.default.invoice.findUnique({ where: { invoiceNo } })) {
            nextSeq++;
            invoiceNo = `${prefix}${String(nextSeq).padStart(5, "0")}`;
        }
        // Build stock-update map
        const stockUpdateMap = new Map();
        for (let i = 0; i < productTypeItems.length; i++) {
            const item = productTypeItems[i];
            const stock = stockChecks[i];
            const newBalance = Number(stock.currentStock ?? stock.openingStock ?? 0) - Number(item.quantity);
            stockUpdateMap.set(item.productId, {
                stockId: stock.id,
                newBalance,
                productId: item.productId,
                godownId: stock.godownId,
            });
        }
        // ── TRANSACTION — only critical DB writes ─────────────────────────────────
        const created = await prisma_1.default.$transaction(async (tx) => {
            // 1. Create invoice + items + additional charges
            const inv = await tx.invoice.create({
                data: {
                    invoiceNo,
                    partyId,
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
                    discountAmount,
                    additionalChargesTotal,
                    taxAmount,
                    roundOff,
                    totalAmount,
                    receivedAmount,
                    outstandingAmount,
                    paymentMode: toPaymentMode(paymentMode),
                    applyTcs,
                    autoRoundOff,
                    signatureUrl: signatureUrl ?? null,
                    showEmptySignatureBox: showEmptySignatureBox ?? false,
                    status: deriveStatus(Number(receivedAmount), totalAmount),
                    items: {
                        // FIX: store discountPct, correct flat discount ₹, and correct post-discount total
                        create: items.map((item) => {
                            const lineGross = Number(item.price) * Number(item.quantity);
                            const discPct = Number(item.discountPct ?? 0);
                            const discAmt = Number(item.discount ?? 0);
                            const pctDiscount = Math.round(lineGross * (discPct / 100) * 100) / 100;
                            const totalDiscount = Math.round((pctDiscount + discAmt) * 100) / 100;
                            const taxableBase = Math.max(0, lineGross - totalDiscount);
                            const taxAmt = Math.round(taxableBase * ((item.taxRate || 0) / 100) * 100) / 100;
                            const lineTotal = Math.round((taxableBase + taxAmt) * 100) / 100;
                            return {
                                productId: item.productId,
                                godownId: item.godownId ?? null,
                                quantity: item.quantity,
                                price: item.price,
                                discountPct: discPct, // ← percentage saved for display on bill
                                discount: totalDiscount, // ← total flat ₹ discount (pct-derived + fixed)
                                taxRate: item.taxRate ?? 0,
                                taxAmount: taxAmt,
                                total: lineTotal, // ← post-discount + tax (correct net amount)
                            };
                        }),
                    },
                    ...(additionalCharges.length > 0 && {
                        additionalCharges: {
                            create: additionalCharges.map((c) => ({
                                name: c.name, amount: c.amount,
                            })),
                        },
                    }),
                },
            });
            // 2. Stock updates — all in PARALLEL
            if (stockUpdateMap.size > 0) {
                await Promise.all(Array.from(stockUpdateMap.values()).map(({ stockId, newBalance }) => tx.productStock.update({
                    where: { id: stockId },
                    data: { currentStock: newBalance },
                })));
            }
            // 3. Party ledger DEBIT
            const balanceAfterDebit = (await (0, ledger_service_1.getLastPartyBalanceTx)(tx, partyId)) + totalAmount;
            await tx.partyLedger.create({
                data: {
                    partyId,
                    refType: client_1.LedgerRefType.Invoice,
                    refId: inv.id,
                    reference: inv.invoiceNo,
                    type: client_1.LedgerType.DEBIT,
                    debit: totalAmount,
                    credit: null,
                    balance: balanceAfterDebit,
                },
            });
            // 4. If upfront payment — CREDIT immediately
            if (Number(receivedAmount) > 0) {
                await tx.partyLedger.create({
                    data: {
                        partyId,
                        refType: client_1.LedgerRefType.Payment,
                        refId: inv.id,
                        reference: inv.invoiceNo,
                        type: client_1.LedgerType.CREDIT,
                        debit: null,
                        credit: receivedAmount,
                        balance: balanceAfterDebit - Number(receivedAmount),
                    },
                });
            }
            // 5. Increment sequence atomically
            if (invoiceSettings?.id) {
                await tx.invoiceSettings.update({
                    where: { id: invoiceSettings.id },
                    data: { sequenceNumber: nextSeq + 1 },
                });
            }
            return inv;
        }, { timeout: 15000 });
        // ── OUTSIDE TRANSACTION — StockLedger (non-critical) ─────────────────────
        if (stockUpdateMap.size > 0) {
            await prisma_1.default.stockLedger.createMany({
                data: Array.from(stockUpdateMap.values()).map(({ productId, godownId, newBalance }) => {
                    const item = items.find((i) => i.productId === productId);
                    return {
                        productId,
                        godownId: godownId ?? null,
                        date: new Date(),
                        refType: client_1.StockRefType.SALE,
                        refId: created.id,
                        quantityIn: 0,
                        quantityOut: Number(item.quantity),
                        balance: newBalance,
                        remarks: `Sales Invoice ${invoiceNo}`,
                    };
                }),
            });
        }
        return res.status(201).json({
            success: true,
            message: "Invoice created successfully",
            data: created,
        });
    }
    catch (error) {
        console.error("❌ Create Invoice Error:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
};
exports.createInvoice = createInvoice;
/* ═══════════════════════════════════════════════════════════
   GET ALL INVOICES
   GET /api/invoices
═══════════════════════════════════════════════════════════ */
const getInvoices = async (req, res) => {
    try {
        const { partyId, status, limit, page } = req.query;
        const where = {};
        if (partyId)
            where.partyId = Number(partyId);
        if (status) {
            const statuses = String(status).split(",").map((s) => s.trim()).filter(Boolean);
            where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
        }
        const take = limit ? Math.min(500, Number(limit)) : undefined;
        const skip = page && take ? (Number(page) - 1) * take : undefined;
        const invoices = await prisma_1.default.invoice.findMany({
            where,
            include: {
                party: true,
                // FIX: include discountPct in items so the bill can display it
                items: { include: { product: true } },
                additionalCharges: true,
                allocations: true,
                salesReturns: true,
            },
            orderBy: { createdAt: "desc" },
            ...(take ? { take } : {}),
            ...(skip ? { skip } : {}),
        });
        return res.json({ success: true, data: invoices });
    }
    catch (error) {
        console.error("❌ Fetch Invoices Error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch invoices" });
    }
};
exports.getInvoices = getInvoices;
/* ═══════════════════════════════════════════════════════════
   GET SINGLE INVOICE
   GET /api/invoices/:id
═══════════════════════════════════════════════════════════ */
const getInvoiceById = async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id))
        return res.status(400).json({ success: false, message: "Invalid invoice ID" });
    try {
        const invoice = await prisma_1.default.invoice.findUnique({
            where: { id },
            include: {
                party: true,
                // FIX: discountPct is now part of InvoiceItem — returned automatically
                items: { include: { product: true } },
                additionalCharges: true,
                allocations: true,
                salesReturns: true,
            },
        });
        if (!invoice)
            return res.status(404).json({ success: false, message: "Invoice not found" });
        return res.json({ success: true, data: invoice });
    }
    catch (error) {
        console.error("❌ Fetch Invoice Error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch invoice" });
    }
};
exports.getInvoiceById = getInvoiceById;
/* ═══════════════════════════════════════════════════════════
   UPDATE INVOICE  (non-financial meta fields only)
   PUT /api/invoices/:id
═══════════════════════════════════════════════════════════ */
const updateInvoice = async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id))
        return res.status(400).json({ success: false, message: "Invalid invoice ID" });
    const { dueDate, ewayBillNo, challanNo, financedBy, salesman, emailId, warrantyPeriod, notes, termsConditions, signatureUrl, showEmptySignatureBox, } = req.body;
    try {
        const existing = await prisma_1.default.invoice.findUnique({ where: { id } });
        if (!existing)
            return res.status(404).json({ success: false, message: "Invoice not found" });
        if (existing.status === client_1.InvoiceStatus.CANCELLED)
            return res.status(400).json({ success: false, message: "Cannot update a cancelled invoice" });
        const updated = await prisma_1.default.invoice.update({
            where: { id },
            data: {
                dueDate: dueDate ? new Date(dueDate) : undefined,
                ewayBillNo: ewayBillNo ?? undefined,
                challanNo: challanNo ?? undefined,
                financedBy: financedBy ?? undefined,
                salesman: salesman ?? undefined,
                emailId: emailId ?? undefined,
                warrantyPeriod: warrantyPeriod ?? undefined,
                notes: notes ?? undefined,
                termsConditions: termsConditions ?? undefined,
                signatureUrl: signatureUrl !== undefined ? signatureUrl : undefined,
                showEmptySignatureBox: showEmptySignatureBox !== undefined ? showEmptySignatureBox : undefined,
            },
        });
        return res.json({ success: true, message: "Invoice updated", data: updated });
    }
    catch (error) {
        console.error("❌ Update Invoice Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
exports.updateInvoice = updateInvoice;
/* ═══════════════════════════════════════════════════════════
   CANCEL INVOICE
   PATCH /api/invoices/:id/cancel
═══════════════════════════════════════════════════════════ */
const cancelInvoice = async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id))
        return res.status(400).json({ success: false, message: "Invalid invoice ID" });
    try {
        const result = await prisma_1.default.$transaction(async (tx) => {
            const invoice = await tx.invoice.findUnique({
                where: { id },
                include: { items: true },
            });
            if (!invoice)
                throw new Error("Invoice not found");
            if (invoice.status === client_1.InvoiceStatus.CANCELLED)
                throw new Error("Invoice is already cancelled");
            // Restore stock in PARALLEL
            await Promise.all(invoice.items.map(async (item) => {
                const stock = await tx.productStock.findFirst({ where: { productId: item.productId } });
                if (stock) {
                    await tx.productStock.update({
                        where: { id: stock.id },
                        data: { currentStock: { increment: item.quantity } },
                    });
                }
            }));
            // Reversal ledger entry
            const newBalance = (await (0, ledger_service_1.getLastPartyBalanceTx)(tx, invoice.partyId)) -
                invoice.totalAmount.toNumber();
            await tx.partyLedger.create({
                data: {
                    partyId: invoice.partyId,
                    refType: client_1.LedgerRefType.Return,
                    refId: invoice.id,
                    reference: invoice.invoiceNo,
                    type: client_1.LedgerType.CREDIT,
                    debit: null,
                    credit: invoice.totalAmount,
                    balance: newBalance,
                },
            });
            return tx.invoice.update({
                where: { id },
                data: { status: client_1.InvoiceStatus.CANCELLED },
            });
        }, { timeout: 15000 });
        return res.json({ success: true, message: "Invoice cancelled", data: result });
    }
    catch (error) {
        console.error("❌ Cancel Invoice Error:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
};
exports.cancelInvoice = cancelInvoice;
/* ═══════════════════════════════════════════════════════════
   RECORD PAYMENT ON INVOICE
   PATCH /api/invoices/:id/payment
═══════════════════════════════════════════════════════════ */
const recordInvoicePayment = async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id))
        return res.status(400).json({ success: false, message: "Invalid invoice ID" });
    const { amount, paymentMode } = req.body;
    if (!amount || amount <= 0)
        return res.status(400).json({ success: false, message: "Invalid payment amount" });
    try {
        const result = await prisma_1.default.$transaction(async (tx) => {
            const invoice = await tx.invoice.findUnique({ where: { id } });
            if (!invoice)
                throw new Error("Invoice not found");
            if (invoice.status === client_1.InvoiceStatus.CANCELLED)
                throw new Error("Cannot pay a cancelled invoice");
            if (invoice.status === client_1.InvoiceStatus.PAID)
                throw new Error("Invoice is already fully paid");
            const currentOutstanding = Number(invoice.outstandingAmount ?? 0);
            if (amount > currentOutstanding)
                throw new Error(`Payment (${amount}) exceeds outstanding amount (${currentOutstanding})`);
            const newReceived = Number(invoice.receivedAmount ?? 0) + amount;
            const newOutstanding = currentOutstanding - amount;
            const newStatus = deriveStatus(newReceived, Number(invoice.totalAmount));
            const updated = await tx.invoice.update({
                where: { id },
                data: {
                    receivedAmount: newReceived,
                    outstandingAmount: newOutstanding,
                    paymentMode: toPaymentMode(paymentMode) ?? toPaymentMode(invoice.paymentMode) ?? null,
                    status: newStatus,
                },
            });
            const newBalance = (await (0, ledger_service_1.getLastPartyBalanceTx)(tx, invoice.partyId)) - amount;
            await tx.partyLedger.create({
                data: {
                    partyId: invoice.partyId,
                    refType: client_1.LedgerRefType.Payment,
                    refId: invoice.id,
                    reference: invoice.invoiceNo,
                    type: client_1.LedgerType.CREDIT,
                    debit: null,
                    credit: amount,
                    balance: newBalance,
                },
            });
            return updated;
        }, { timeout: 15000 });
        return res.json({ success: true, message: "Payment recorded", data: result });
    }
    catch (error) {
        console.error("❌ Record Payment Error:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
};
exports.recordInvoicePayment = recordInvoicePayment;
/* ═══════════════════════════════════════════════════════════
   INVOICE SUMMARY
   GET /api/invoices/summary
═══════════════════════════════════════════════════════════ */
const getInvoiceSummary = async (_req, res) => {
    try {
        const [totalAgg, statusCounts, extraAgg, cancelledAgg] = await Promise.all([
            prisma_1.default.invoice.aggregate({
                where: { status: { not: client_1.InvoiceStatus.CANCELLED } },
                _sum: { totalAmount: true },
            }),
            prisma_1.default.invoice.groupBy({ by: ["status"], _count: { id: true } }),
            prisma_1.default.invoice.aggregate({
                where: { status: { not: client_1.InvoiceStatus.CANCELLED } },
                _sum: { receivedAmount: true, outstandingAmount: true },
            }),
            prisma_1.default.invoice.aggregate({
                where: { status: client_1.InvoiceStatus.CANCELLED },
                _sum: { totalAmount: true },
            }),
        ]);
        const statusMap = {};
        statusCounts.forEach((c) => { statusMap[c.status] = c._count.id; });
        return res.json({
            success: true,
            data: {
                totalInvoiced: totalAgg._sum?.totalAmount ?? 0,
                totalReceived: extraAgg?._sum?.receivedAmount ?? 0,
                totalOutstanding: extraAgg?._sum?.outstandingAmount ?? 0,
                totalCancelled: cancelledAgg._sum?.totalAmount ?? 0,
                openCount: statusMap[client_1.InvoiceStatus.OPEN] ?? 0,
                partialCount: statusMap[client_1.InvoiceStatus.PARTIAL] ?? 0,
                paidCount: statusMap[client_1.InvoiceStatus.PAID] ?? 0,
                cancelledCount: statusMap[client_1.InvoiceStatus.CANCELLED] ?? 0,
            },
        });
    }
    catch (error) {
        console.error("❌ Invoice Summary Error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch invoice summary" });
    }
};
exports.getInvoiceSummary = getInvoiceSummary;
/* ═══════════════════════════════════════════════════════════
   PARTY ITEM-WISE REPORT
   GET /api/invoices/party-item-wise/:id
═══════════════════════════════════════════════════════════ */
const getPartyItemWiseReport = async (req, res) => {
    const partyId = Number(req.params.id);
    if (isNaN(partyId))
        return res.status(400).json({ success: false, message: "Invalid party ID" });
    try {
        const invoices = await prisma_1.default.invoice.findMany({
            where: { partyId },
            include: { items: { include: { product: true } } },
            orderBy: { createdAt: "desc" },
        });
        const data = invoices.flatMap((invoice) => invoice.items.map((item) => ({
            partyId,
            invoiceNo: invoice.invoiceNo,
            itemName: item.product.name,
            itemCode: item.product.itemCode ?? null,
            quantity: item.quantity,
            price: Number(item.price),
            amount: Number(item.total),
            type: "Sale",
            date: invoice.createdAt,
        })));
        return res.json({ success: true, data });
    }
    catch (error) {
        console.error("❌ Item-wise Report Error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch item-wise report" });
    }
};
exports.getPartyItemWiseReport = getPartyItemWiseReport;
/* ═══════════════════════════════════════════════════════════
   DELETE INVOICE
   DELETE /api/invoices/:id
═══════════════════════════════════════════════════════════ */
const deleteInvoice = async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id))
        return res.status(400).json({ success: false, message: "Invalid invoice ID" });
    try {
        await prisma_1.default.$transaction(async (tx) => {
            const invoice = await tx.invoice.findUnique({ where: { id } });
            if (!invoice)
                throw new Error("Invoice not found");
            await tx.partyLedger.deleteMany({ where: { refType: "Invoice", refId: id } });
            await tx.paymentAllocation?.deleteMany?.({ where: { invoiceId: id } }).catch(() => { });
            await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
            await tx.invoice.delete({ where: { id } });
        }, { timeout: 15000 });
        return res.json({ success: true, message: "Invoice deleted successfully" });
    }
    catch (error) {
        console.error("❌ Delete Invoice Error:", error);
        if (error.message === "Invoice not found")
            return res.status(404).json({ success: false, message: "Invoice not found" });
        return res.status(500).json({ success: false, message: "Failed to delete invoice" });
    }
};
exports.deleteInvoice = deleteInvoice;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertQuotationToInvoice = exports.deleteQuotation = exports.updateQuotation = exports.getQuotationById = exports.saveQuotationSettings = exports.getQuotationSettings = exports.duplicateQuotation = exports.getAllQuotations = exports.createQuotation = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const client_1 = require("@prisma/client");
// ============================
// Create Quotation
// ============================
const createQuotation = async (req, res) => {
    try {
        const { partyId, branchCode, quotationDate, validTill, notes, termsConditions, ewayBillNo, challanNo, financedBy, salesman, emailId, warrantyPeriod, items, additionalCharges, subTotal, taxableAmount, discountAmount, additionalChargesTotal, taxAmount, roundOff, totalAmount, } = req.body;
        if (!partyId || !items || items.length === 0) {
            return res.status(400).json({ message: "Party and items are required" });
        }
        // ── Read settings OUTSIDE transaction (faster tx) ───────────────────────
        let settings = await prisma_1.default.quotationSettings.findFirst();
        if (!settings) {
            settings = await prisma_1.default.quotationSettings.create({
                data: { prefix: "", sequenceNumber: 1, branchCode: null },
            });
        }
        // ── FIX: Build quotation number correctly ────────────────────────────────
        // BUG WAS: if prefix is empty, the code produced "-00001"
        // FIX: only add "-" separator when prefix is non-empty
        const seq = settings.sequenceNumber;
        const rawPrefix = (settings.prefix ?? "").replace(/-+$/, "").trim();
        // If no prefix configured, default to "QTN"
        const effectivePrefix = rawPrefix || "QTN";
        const quotationNo = `${effectivePrefix}-${String(seq).padStart(5, "0")}`;
        const quotation = await prisma_1.default.$transaction(async (tx) => {
            // Increment sequence atomically
            await tx.quotationSettings.update({
                where: { id: settings.id },
                data: { sequenceNumber: seq + 1 },
            });
            const created = await tx.quotation.create({
                data: {
                    quotationNo,
                    partyId: Number(partyId),
                    branchCode: branchCode || settings.branchCode || null,
                    quotationDate: quotationDate ? new Date(quotationDate) : new Date(),
                    validTill: validTill ? new Date(validTill) : null,
                    notes,
                    termsConditions,
                    ewayBillNo: ewayBillNo || null,
                    challanNo: challanNo || null,
                    financedBy: financedBy || null,
                    salesman: salesman || null,
                    emailId: emailId || null,
                    warrantyPeriod: warrantyPeriod || null,
                    subTotal,
                    taxableAmount,
                    discountAmount,
                    additionalChargesTotal,
                    taxAmount,
                    roundOff,
                    totalAmount,
                    items: {
                        create: items.map((item) => ({
                            productId: Number(item.productId),
                            quantity: Number(item.quantity),
                            price: item.price,
                            discount: item.discount,
                            taxRate: item.taxRate,
                            taxAmount: item.taxAmount,
                            total: item.total,
                        })),
                    },
                    additionalCharges: {
                        create: additionalCharges?.map((charge) => ({
                            name: charge.name,
                            amount: charge.amount,
                        })) || [],
                    },
                },
                include: {
                    party: true,
                    items: { include: { product: true } },
                    additionalCharges: true,
                },
            });
            return created;
        }, { timeout: 15000 });
        res.status(201).json(quotation);
    }
    catch (error) {
        console.error("Create Quotation Error:", error);
        res.status(500).json({ error: "Failed to create quotation" });
    }
};
exports.createQuotation = createQuotation;
// ============================
// Get All Quotations (with filters)
// ============================
const getAllQuotations = async (req, res) => {
    try {
        const { search, status, startDate, endDate } = req.query;
        const where = {};
        if (!status || status === "") {
            where.status = "OPEN";
        }
        else if (status !== "all") {
            where.status = String(status).toUpperCase();
        }
        if (startDate || endDate) {
            where.quotationDate = {};
            if (startDate)
                where.quotationDate.gte = new Date(String(startDate));
            if (endDate)
                where.quotationDate.lte = new Date(String(endDate) + "T23:59:59.999Z");
        }
        if (search) {
            where.OR = [
                { quotationNo: { contains: String(search), mode: "insensitive" } },
                { party: { partyName: { contains: String(search), mode: "insensitive" } } },
            ];
        }
        const quotations = await prisma_1.default.quotation.findMany({
            where,
            include: {
                party: true,
                items: { include: { product: true } },
                additionalCharges: true,
            },
            orderBy: { createdAt: "desc" },
        });
        res.json(quotations);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch quotations" });
    }
};
exports.getAllQuotations = getAllQuotations;
// ============================
// Duplicate Quotation
// ============================
const duplicateQuotation = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const source = await prisma_1.default.quotation.findUnique({
            where: { id },
            include: { items: true, additionalCharges: true },
        });
        if (!source) {
            return res.status(404).json({ message: "Quotation not found" });
        }
        // ── Read settings OUTSIDE tx ─────────────────────────────────────────────
        const settingsRecord = await prisma_1.default.quotationSettings.findFirst();
        const seqDup = settingsRecord?.sequenceNumber ?? 1;
        const rawPfxDup = (settingsRecord?.prefix ?? "").replace(/-+$/, "").trim();
        // FIX: same fix — default to "QTN" if no prefix
        const effectivePfxDup = rawPfxDup || "QTN";
        const newQuotationNo = `${effectivePfxDup}-${String(seqDup).padStart(5, "0")}`;
        const duplicate = await prisma_1.default.$transaction(async (tx) => {
            const created = await tx.quotation.create({
                data: {
                    quotationNo: newQuotationNo,
                    partyId: source.partyId,
                    branchCode: source.branchCode,
                    quotationDate: new Date(),
                    validTill: source.validTill,
                    notes: source.notes,
                    termsConditions: source.termsConditions,
                    subTotal: source.subTotal,
                    taxableAmount: source.taxableAmount,
                    discountAmount: source.discountAmount,
                    additionalChargesTotal: source.additionalChargesTotal,
                    taxAmount: source.taxAmount,
                    roundOff: source.roundOff,
                    totalAmount: source.totalAmount,
                    status: "OPEN",
                    items: {
                        create: source.items.map((item) => ({
                            productId: Number(item.productId),
                            godownId: item.godownId ? Number(item.godownId) : null,
                            quantity: Number(item.quantity),
                            price: item.price,
                            discount: item.discount,
                            taxRate: item.taxRate,
                            taxAmount: item.taxAmount,
                            total: item.total,
                        })),
                    },
                    additionalCharges: {
                        create: source.additionalCharges.map((c) => ({
                            name: c.name, amount: c.amount,
                        })),
                    },
                },
                include: {
                    party: true,
                    items: { include: { product: true } },
                    additionalCharges: true,
                },
            });
            if (settingsRecord) {
                await tx.quotationSettings.update({
                    where: { id: settingsRecord.id },
                    data: { sequenceNumber: seqDup + 1 },
                });
            }
            return created;
        }, { timeout: 15000 });
        res.status(201).json(duplicate);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to duplicate quotation" });
    }
};
exports.duplicateQuotation = duplicateQuotation;
// ============================
// Get Quotation Settings
// ============================
const getQuotationSettings = async (req, res) => {
    try {
        let settings = await prisma_1.default.quotationSettings.findFirst();
        if (!settings) {
            settings = await prisma_1.default.quotationSettings.create({
                data: { prefix: "", sequenceNumber: 1, branchCode: null },
            });
        }
        res.json(settings);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch quotation settings" });
    }
};
exports.getQuotationSettings = getQuotationSettings;
// ============================
// Save Quotation Settings
// ============================
const saveQuotationSettings = async (req, res) => {
    try {
        const { prefix, sequenceNumber, branchCode } = req.body;
        let settings = await prisma_1.default.quotationSettings.findFirst();
        if (settings) {
            settings = await prisma_1.default.quotationSettings.update({
                where: { id: settings.id },
                data: {
                    ...(prefix !== undefined && { prefix }),
                    ...(sequenceNumber !== undefined && { sequenceNumber: Number(sequenceNumber) }),
                    ...(branchCode !== undefined && { branchCode }),
                },
            });
        }
        else {
            settings = await prisma_1.default.quotationSettings.create({
                data: {
                    prefix: prefix ?? "",
                    sequenceNumber: sequenceNumber ? Number(sequenceNumber) : 1,
                    branchCode: branchCode ?? null,
                },
            });
        }
        res.json(settings);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to save quotation settings" });
    }
};
exports.saveQuotationSettings = saveQuotationSettings;
// ============================
// Get Quotation By ID
// ============================
const getQuotationById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const quotation = await prisma_1.default.quotation.findUnique({
            where: { id },
            include: {
                party: true,
                items: { include: { product: true } },
                additionalCharges: true,
            },
        });
        if (!quotation) {
            return res.status(404).json({ message: "Quotation not found" });
        }
        res.json(quotation);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error fetching quotation" });
    }
};
exports.getQuotationById = getQuotationById;
// ============================
// Update Quotation
// ============================
const updateQuotation = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const existing = await prisma_1.default.quotation.findUnique({
            where: { id },
            include: { items: true },
        });
        if (!existing) {
            return res.status(404).json({ message: "Quotation not found" });
        }
        const { status, notes, termsConditions, validTill, ewayBillNo, challanNo, financedBy, salesman, emailId, warrantyPeriod, items, additionalCharges, subTotal, taxableAmount, discountAmount, additionalChargesTotal, taxAmount, roundOff, totalAmount, } = req.body;
        // Status-only update
        if (status && !items) {
            const updated = await prisma_1.default.quotation.update({
                where: { id },
                data: { status: status.toUpperCase() },
                include: {
                    party: true,
                    items: { include: { product: true } },
                    additionalCharges: true,
                },
            });
            return res.json(updated);
        }
        const quotation = await prisma_1.default.$transaction(async (tx) => {
            await tx.quotationItem.deleteMany({ where: { quotationId: id } });
            await tx.quotationAdditionalCharge.deleteMany({ where: { quotationId: id } });
            const updated = await tx.quotation.update({
                where: { id },
                data: {
                    notes,
                    termsConditions,
                    validTill: validTill ? new Date(validTill) : null,
                    ewayBillNo: ewayBillNo ?? null,
                    challanNo: challanNo ?? null,
                    financedBy: financedBy ?? null,
                    salesman: salesman ?? null,
                    emailId: emailId ?? null,
                    warrantyPeriod: warrantyPeriod ?? null,
                    subTotal: subTotal ?? existing.subTotal,
                    taxableAmount: taxableAmount ?? existing.taxableAmount,
                    discountAmount: discountAmount ?? existing.discountAmount,
                    additionalChargesTotal: additionalChargesTotal ?? existing.additionalChargesTotal,
                    taxAmount: taxAmount ?? existing.taxAmount,
                    roundOff: roundOff ?? existing.roundOff,
                    totalAmount,
                    items: {
                        create: items.map((item) => ({
                            productId: Number(item.productId),
                            quantity: Number(item.quantity),
                            price: item.price,
                            discount: item.discount,
                            taxRate: item.taxRate,
                            taxAmount: item.taxAmount,
                            total: item.total,
                        })),
                    },
                    additionalCharges: {
                        create: additionalCharges?.map((c) => ({
                            name: c.name, amount: c.amount,
                        })) || [],
                    },
                },
                include: {
                    party: true,
                    items: { include: { product: true } },
                    additionalCharges: true,
                },
            });
            return updated;
        }, { timeout: 15000 });
        res.json(quotation);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update quotation" });
    }
};
exports.updateQuotation = updateQuotation;
// ============================
// Delete Quotation
// ============================
const deleteQuotation = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const quotation = await prisma_1.default.quotation.findUnique({
            where: { id },
            include: { items: true },
        });
        if (!quotation) {
            return res.status(404).json({ message: "Quotation not found" });
        }
        await prisma_1.default.$transaction(async (tx) => {
            await tx.quotation.delete({ where: { id } });
        }, { timeout: 15000 });
        res.json({ message: "Quotation deleted successfully" });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete quotation" });
    }
};
exports.deleteQuotation = deleteQuotation;
// ============================
// Convert Quotation → Invoice
// ============================
const convertQuotationToInvoice = async (req, res) => {
    try {
        const quotationId = Number(req.params.id);
        // Load quotation OUTSIDE tx
        const quotation = await prisma_1.default.quotation.findUnique({
            where: { id: quotationId },
            include: { items: true, additionalCharges: true },
        });
        if (!quotation)
            return res.status(404).json({ message: "Quotation not found" });
        if (quotation.status === "CONVERTED")
            return res.status(400).json({ message: "Quotation already converted to invoice" });
        // ── Pre-fetch stocks OUTSIDE tx (faster tx) ──────────────────────────────
        const productItems = quotation.items.filter((i) => i.godownId != null);
        const stockChecks = await Promise.all(productItems.map((item) => prisma_1.default.productStock.findUnique({
            where: {
                productId_godownId: {
                    productId: item.productId,
                    godownId: item.godownId,
                },
            },
        })));
        // Validate stock before entering tx
        for (let i = 0; i < productItems.length; i++) {
            const item = productItems[i];
            const stock = stockChecks[i];
            const available = Number(stock?.currentStock ?? stock?.openingStock ?? 0);
            if (!stock)
                throw new Error(`Stock record not found for product ${item.productId}`);
            if (available < item.quantity)
                throw new Error(`Insufficient stock for product ${item.productId}`);
        }
        // Build stock newBalance map
        const stockUpdateMap = new Map(productItems.map((item, i) => {
            const stock = stockChecks[i];
            const newBalance = Number(stock.currentStock ?? stock.openingStock ?? 0) - item.quantity;
            return [item.productId, { stockId: stock.id, newBalance, godownId: item.godownId }];
        }));
        // ── Read InvoiceSettings OUTSIDE tx ──────────────────────────────────────
        let invoiceSettings = await prisma_1.default.invoiceSettings.findFirst();
        if (!invoiceSettings) {
            invoiceSettings = await prisma_1.default.invoiceSettings.create({
                data: { prefix: "", sequenceNumber: 1, enablePrefix: false },
            });
        }
        const invPrefix = invoiceSettings.enablePrefix && invoiceSettings.prefix
            ? invoiceSettings.prefix
            : "INV-";
        // Find next safe sequence
        let seq = invoiceSettings.sequenceNumber;
        let invoiceNo = `${invPrefix}${String(seq).padStart(5, "0")}`;
        while (await prisma_1.default.invoice.findUnique({ where: { invoiceNo } })) {
            seq++;
            invoiceNo = `${invPrefix}${String(seq).padStart(5, "0")}`;
        }
        // ── TRANSACTION — only writes ─────────────────────────────────────────────
        const invoice = await prisma_1.default.$transaction(async (tx) => {
            // Guard: prevent double conversion
            const existingInvoice = await tx.invoice.findFirst({ where: { quotationId } });
            if (existingInvoice)
                throw new Error("Quotation already converted to invoice");
            const createdInvoice = await tx.invoice.create({
                data: {
                    invoiceNo,
                    quotationId: quotation.id,
                    partyId: quotation.partyId,
                    branchCode: quotation.branchCode,
                    invoiceDate: new Date(),
                    subTotal: quotation.subTotal,
                    taxableAmount: quotation.taxableAmount,
                    discountAmount: quotation.discountAmount,
                    additionalChargesTotal: quotation.additionalChargesTotal,
                    taxAmount: quotation.taxAmount,
                    roundOff: quotation.roundOff,
                    totalAmount: quotation.totalAmount,
                    outstandingAmount: quotation.totalAmount,
                    notes: quotation.notes,
                    termsConditions: quotation.termsConditions,
                    ewayBillNo: quotation.ewayBillNo,
                    challanNo: quotation.challanNo,
                    financedBy: quotation.financedBy,
                    salesman: quotation.salesman,
                    emailId: quotation.emailId,
                    warrantyPeriod: quotation.warrantyPeriod,
                    items: {
                        create: quotation.items.map((item) => ({
                            productId: Number(item.productId),
                            godownId: item.godownId ? Number(item.godownId) : null,
                            quantity: Number(item.quantity),
                            price: item.price,
                            discount: item.discount,
                            taxRate: item.taxRate,
                            taxAmount: item.taxAmount,
                            total: item.total,
                        })),
                    },
                    additionalCharges: {
                        create: quotation.additionalCharges.map((c) => ({
                            name: c.name, amount: c.amount,
                        })),
                    },
                },
                include: {
                    party: true,
                    items: { include: { product: true } },
                    additionalCharges: true,
                },
            });
            // Stock updates — PARALLEL
            await Promise.all(Array.from(stockUpdateMap.values()).map(({ stockId, newBalance }) => tx.productStock.update({
                where: { id: stockId },
                data: { currentStock: newBalance },
            })));
            // Increment invoice sequence
            await tx.invoiceSettings.update({
                where: { id: invoiceSettings.id },
                data: { sequenceNumber: seq + 1 },
            });
            // Mark quotation as converted
            await tx.quotation.update({
                where: { id: quotationId },
                data: { status: client_1.QuotationStatus.CONVERTED },
            });
            return createdInvoice;
        }, { timeout: 15000 });
        // ── StockLedger OUTSIDE tx ────────────────────────────────────────────────
        if (stockUpdateMap.size > 0) {
            await prisma_1.default.stockLedger.createMany({
                data: Array.from(stockUpdateMap.entries()).map(([productId, { godownId, newBalance }]) => {
                    const item = quotation.items.find((i) => i.productId === productId);
                    return {
                        productId,
                        godownId,
                        date: new Date(),
                        refType: client_1.StockRefType.SALE,
                        refId: invoice.id,
                        quantityIn: 0,
                        quantityOut: item.quantity,
                        balance: newBalance,
                        remarks: `Sales Invoice ${invoiceNo}`,
                    };
                }),
            });
        }
        res.json(invoice);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message || "Failed to convert quotation" });
    }
};
exports.convertQuotationToInvoice = convertQuotationToInvoice;

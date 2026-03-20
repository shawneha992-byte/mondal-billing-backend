"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteParty = exports.getPartyById = exports.getAllParties = exports.updateParty = exports.createParty = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const gstPanValidator_1 = require("../utils/gstPanValidator");
const gstService_1 = require("../services/gstService");
const client_1 = require("@prisma/client");
// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const validateIFSC = (ifsc) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase());
// ======================================================
// CREATE PARTY
// POST /api/parties
// ======================================================
const createParty = async (req, res) => {
    try {
        const { partyName, mobileNumber, email, gstin, panNumber, partyType, partyCategory, billingAddress, shippingAddress, creditPeriod, creditLimit, openingBalance, openingBalanceType, bankAccounts = [], customFields = [], } = req.body;
        if (!partyName || !partyType) {
            return res.status(400).json({
                success: false,
                message: "partyName and partyType are required",
            });
        }
        if (gstin && !(0, gstPanValidator_1.validateGST)(gstin)) {
            return res.status(400).json({ success: false, message: "Invalid GST number format" });
        }
        if (panNumber && !(0, gstPanValidator_1.validatePAN)(panNumber)) {
            return res.status(400).json({ success: false, message: "Invalid PAN number format" });
        }
        if (openingBalance && !openingBalanceType) {
            return res.status(400).json({
                success: false,
                message: "openingBalanceType is required when openingBalance is provided",
            });
        }
        for (const acc of bankAccounts) {
            if (!acc.accountHolder || !acc.accountNumber || !acc.bankName || !acc.ifscCode) {
                return res.status(400).json({
                    success: false,
                    message: "Each bank account must have accountHolder, accountNumber, bankName and ifscCode",
                });
            }
            if (!validateIFSC(acc.ifscCode)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid IFSC code: ${acc.ifscCode}`,
                });
            }
        }
        let gstData = null;
        if (gstin) {
            gstData = await (0, gstService_1.fetchGSTDetails)(gstin);
            if (!gstData) {
                return res.status(400).json({ success: false, message: "GSTIN not found or inactive" });
            }
        }
        const party = await prisma_1.default.$transaction(async (tx) => {
            const newParty = await tx.party.create({
                data: {
                    name: gstData?.legal_name || partyName,
                    partyName: gstData?.legal_name || partyName,
                    mobileNumber,
                    email,
                    gstin,
                    panNumber,
                    partyType,
                    partyCategory,
                    billingAddress: gstData?.address || billingAddress,
                    shippingAddress,
                    creditPeriod,
                    creditLimit,
                    openingBalance,
                    openingBalanceType,
                },
            });
            if (openingBalance && openingBalance > 0) {
                const isDebit = openingBalanceType === client_1.BalanceType.To_Collect;
                await tx.partyLedger.create({
                    data: {
                        partyId: newParty.id,
                        refType: client_1.LedgerRefType.Opening,
                        type: isDebit ? client_1.LedgerType.DEBIT : client_1.LedgerType.CREDIT,
                        debit: isDebit ? openingBalance : null,
                        credit: isDebit ? null : openingBalance,
                        balance: openingBalance,
                    },
                });
            }
            if (bankAccounts.length > 0) {
                await tx.partyBankAccount.createMany({
                    data: bankAccounts.map((acc) => ({
                        partyId: newParty.id,
                        accountHolder: acc.accountHolder,
                        accountNumber: acc.accountNumber,
                        bankName: acc.bankName,
                        ifscCode: acc.ifscCode.toUpperCase(),
                        branchName: acc.branchName || null,
                        upiId: acc.upiId || null,
                    })),
                });
            }
            if (customFields.length > 0) {
                await tx.partyCustomField.createMany({
                    data: customFields.map((field) => ({
                        partyId: newParty.id,
                        fieldName: field.fieldName,
                        fieldValue: field.fieldValue,
                    })),
                });
            }
            return newParty;
        });
        const fullParty = await prisma_1.default.party.findUnique({
            where: { id: party.id },
            include: {
                bankAccounts: { orderBy: { createdAt: "asc" } },
                customFields: { orderBy: { createdAt: "asc" } },
            },
        });
        return res.status(201).json({
            success: true,
            message: "Party created successfully",
            data: fullParty,
        });
    }
    catch (error) {
        console.error("Create Party Error:", error);
        return res.status(500).json({ success: false, message: "Failed to create party" });
    }
};
exports.createParty = createParty;
// ======================================================
// UPDATE PARTY
// PUT /api/parties/:id
// FIX: whitelist only known Party fields to prevent Prisma errors
// ======================================================
const updateParty = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { partyName, mobileNumber, email, gstin, panNumber, partyType, partyCategory, billingAddress, shippingAddress, creditPeriod, creditLimit, openingBalance, openingBalanceType, status, contactPersonName, dateOfBirth, } = req.body;
        // Build update payload with only defined fields
        const data = {};
        if (partyName !== undefined) {
            data.name = partyName;
            data.partyName = partyName;
        }
        if (mobileNumber !== undefined)
            data.mobileNumber = mobileNumber;
        if (email !== undefined)
            data.email = email;
        if (gstin !== undefined)
            data.gstin = gstin;
        if (panNumber !== undefined)
            data.panNumber = panNumber;
        if (partyType !== undefined)
            data.partyType = partyType;
        if (partyCategory !== undefined)
            data.partyCategory = partyCategory;
        if (billingAddress !== undefined)
            data.billingAddress = billingAddress;
        if (shippingAddress !== undefined)
            data.shippingAddress = shippingAddress;
        if (creditPeriod !== undefined)
            data.creditPeriod = creditPeriod;
        if (creditLimit !== undefined)
            data.creditLimit = creditLimit;
        if (openingBalance !== undefined)
            data.openingBalance = openingBalance;
        if (openingBalanceType !== undefined)
            data.openingBalanceType = openingBalanceType;
        if (status !== undefined)
            data.status = status;
        if (contactPersonName !== undefined)
            data.contactPersonName = contactPersonName;
        if (dateOfBirth !== undefined)
            data.dateOfBirth = dateOfBirth;
        const party = await prisma_1.default.party.update({
            where: { id },
            data,
        });
        return res.json({ success: true, message: "Party updated", data: party });
    }
    catch (error) {
        console.error("Update Party Error:", error);
        res.status(500).json({ success: false, message: "Failed to update party" });
    }
};
exports.updateParty = updateParty;
// ======================================================
// GET ALL PARTIES
// GET /api/parties
// ======================================================
const getAllParties = async (_req, res) => {
    try {
        const parties = await prisma_1.default.party.findMany({
            orderBy: { createdAt: "desc" },
        });
        res.json({ success: true, data: parties });
    }
    catch (error) {
        console.error("Get Parties Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch parties" });
    }
};
exports.getAllParties = getAllParties;
// ======================================================
// GET PARTY BY ID
// GET /api/parties/:id
// ======================================================
const getPartyById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const party = await prisma_1.default.party.findUnique({
            where: { id },
            include: {
                bankAccounts: { orderBy: { createdAt: "asc" } },
                customFields: { orderBy: { createdAt: "asc" } },
            },
        });
        if (!party) {
            return res.status(404).json({ success: false, message: "Party not found" });
        }
        res.json({ success: true, data: party });
    }
    catch (error) {
        console.error("Get Party Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
exports.getPartyById = getPartyById;
// ======================================================
// DELETE PARTY
// DELETE /api/parties/:id
// ======================================================
const deleteParty = async (req, res) => {
    try {
        const id = Number(req.params.id);
        await prisma_1.default.party.delete({ where: { id } });
        res.json({ success: true, message: "Party deleted successfully" });
    }
    catch (error) {
        console.error("Delete Party Error:", error);
        res.status(500).json({ success: false, message: "Failed to delete party" });
    }
};
exports.deleteParty = deleteParty;

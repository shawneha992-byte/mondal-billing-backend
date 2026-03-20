"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBankAccount = exports.updateBankAccount = exports.getBankAccounts = exports.addBankAccount = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
// ============================================================
// HELPERS
// ============================================================
/** Basic IFSC validation: 4 letters + 0 + 6 alphanumeric */
const validateIFSC = (ifsc) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase());
/** Mask account number for safe logging / responses */
const maskAccount = (acc) => acc.length > 4 ? "*".repeat(acc.length - 4) + acc.slice(-4) : acc;
/** Basic UPI validation */
const validateUPI = (upi) => /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test(upi);
// ============================================================
// ADD BANK ACCOUNT
// POST /api/parties/:id/bank-accounts
// ============================================================
const addBankAccount = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        if (isNaN(partyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid party ID",
            });
        }
        const { accountHolder, accountNumber, bankName, ifscCode, branchName, upiId, } = req.body;
        // Validation
        if (!accountHolder || !accountNumber || !bankName || !ifscCode) {
            return res.status(400).json({
                success: false,
                message: "accountHolder, accountNumber, bankName, and ifscCode are required",
            });
        }
        if (!validateIFSC(ifscCode)) {
            return res.status(400).json({
                success: false,
                message: "Invalid IFSC code format",
            });
        }
        if (upiId && !validateUPI(upiId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid UPI ID format",
            });
        }
        // Check party exists
        const party = await prisma_1.default.party.findUnique({
            where: { id: partyId },
        });
        if (!party) {
            return res.status(404).json({
                success: false,
                message: "Party not found",
            });
        }
        const bankAccount = await prisma_1.default.partyBankAccount.create({
            data: {
                partyId,
                accountHolder,
                accountNumber,
                bankName,
                ifscCode: ifscCode.toUpperCase(),
                branchName,
                upiId,
            },
        });
        return res.status(201).json({
            success: true,
            message: "Bank account added successfully",
            data: {
                ...bankAccount,
                accountNumber: maskAccount(bankAccount.accountNumber),
            },
        });
    }
    catch (error) {
        console.error("❌ Add Bank Account Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to add bank account",
        });
    }
};
exports.addBankAccount = addBankAccount;
// ============================================================
// GET BANK ACCOUNTS
// GET /api/parties/:id/bank-accounts
// ============================================================
const getBankAccounts = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        if (isNaN(partyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid party ID",
            });
        }
        const accounts = await prisma_1.default.partyBankAccount.findMany({
            where: { partyId },
            orderBy: { createdAt: "asc" },
        });
        return res.status(200).json({
            success: true,
            data: accounts,
        });
    }
    catch (error) {
        console.error("❌ Get Bank Accounts Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch bank accounts",
        });
    }
};
exports.getBankAccounts = getBankAccounts;
// ============================================================
// UPDATE BANK ACCOUNT
// PUT /api/parties/:id/bank-accounts/:accountId
// ============================================================
const updateBankAccount = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        const accountId = Number(req.params.accountId);
        if (isNaN(partyId) || isNaN(accountId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID",
            });
        }
        const { accountHolder, accountNumber, bankName, ifscCode, branchName, upiId, } = req.body;
        if (ifscCode && !validateIFSC(ifscCode)) {
            return res.status(400).json({
                success: false,
                message: "Invalid IFSC code format",
            });
        }
        if (upiId && !validateUPI(upiId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid UPI ID format",
            });
        }
        const existing = await prisma_1.default.partyBankAccount.findFirst({
            where: {
                id: accountId,
                partyId,
            },
        });
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Bank account not found",
            });
        }
        const updated = await prisma_1.default.partyBankAccount.update({
            where: { id: accountId },
            data: {
                ...(accountHolder && { accountHolder }),
                ...(accountNumber && { accountNumber }),
                ...(bankName && { bankName }),
                ...(branchName !== undefined && { branchName }),
                ...(upiId !== undefined && { upiId }),
                ...(ifscCode && { ifscCode: ifscCode.toUpperCase() }),
            },
        });
        return res.status(200).json({
            success: true,
            message: "Bank account updated successfully",
            data: updated,
        });
    }
    catch (error) {
        console.error("❌ Update Bank Account Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update bank account",
        });
    }
};
exports.updateBankAccount = updateBankAccount;
// ============================================================
// DELETE BANK ACCOUNT
// DELETE /api/parties/:id/bank-accounts/:accountId
// ============================================================
const deleteBankAccount = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        const accountId = Number(req.params.accountId);
        if (isNaN(partyId) || isNaN(accountId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID",
            });
        }
        const existing = await prisma_1.default.partyBankAccount.findFirst({
            where: {
                id: accountId,
                partyId,
            },
        });
        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Bank account not found",
            });
        }
        await prisma_1.default.partyBankAccount.delete({
            where: { id: accountId },
        });
        return res.status(200).json({
            success: true,
            message: "Bank account deleted successfully",
        });
    }
    catch (error) {
        console.error("❌ Delete Bank Account Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete bank account",
        });
    }
};
exports.deleteBankAccount = deleteBankAccount;

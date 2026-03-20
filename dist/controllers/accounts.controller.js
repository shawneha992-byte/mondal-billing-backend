"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAccount = exports.createAccount = exports.getAccounts = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
// ────────────────────────────────────────────────────────────────────────────
//  GET /api/accounts       — list all business accounts
// ────────────────────────────────────────────────────────────────────────────
const getAccounts = async (_req, res) => {
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
exports.getAccounts = getAccounts;
// ────────────────────────────────────────────────────────────────────────────
//  POST /api/accounts      — create a business account
// ────────────────────────────────────────────────────────────────────────────
const createAccount = async (req, res) => {
    const { accountHolder, type, bankName, accountNumber, ifscCode, branchName, upiId } = req.body;
    if (!accountHolder || !type) {
        return res.status(400).json({ message: "accountHolder and type are required" });
    }
    const validTypes = ["CASH", "BANK", "UPI"];
    if (!validTypes.includes(type)) {
        return res.status(400).json({ message: "type must be CASH, BANK, or UPI" });
    }
    try {
        const account = await prisma_1.default.account.create({
            data: {
                accountHolder,
                type: type,
                bankName: bankName || null,
                accountNumber: accountNumber || null,
                ifscCode: ifscCode || null,
                branchName: branchName || null,
                upiId: upiId || null,
            },
        });
        res.status(201).json({
            id: account.id,
            accountHolder: account.accountHolder,
            bankName: account.bankName,
            accountNumber: account.accountNumber,
            type: account.type,
            balance: 0,
        });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
};
exports.createAccount = createAccount;
// ────────────────────────────────────────────────────────────────────────────
//  DELETE /api/accounts/:id  — delete a business account
// ────────────────────────────────────────────────────────────────────────────
const deleteAccount = async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        await prisma_1.default.account.delete({ where: { id } });
        res.json({ message: "Account deleted" });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
};
exports.deleteAccount = deleteAccount;

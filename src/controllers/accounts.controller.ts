import { Request, Response } from "express";
import prisma from "../utils/prisma";

// ─── AccountType string literals ─────────────────────────────────────────────
type AccountTypeStr = "CASH" | "BANK" | "UPI";

// ────────────────────────────────────────────────────────────────────────────
//  GET /api/accounts       — list all business accounts
// ────────────────────────────────────────────────────────────────────────────
export const getAccounts = async (_req: Request, res: Response) => {
  try {
    const accounts = await prisma.$queryRaw<
      { id: number; accountHolder: string; bankName: string | null; accountNumber: string | null; type: string; balance: number }[]
    >`
      SELECT id, "accountHolder", "bankName", "accountNumber", type::text,
             COALESCE(balance, 0)::float AS balance
      FROM   "Account"
      ORDER  BY "accountHolder" ASC
    `;
    res.json({ accounts });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
//  POST /api/accounts      — create a business account
// ────────────────────────────────────────────────────────────────────────────
export const createAccount = async (req: Request, res: Response) => {
  const { accountHolder, type, bankName, accountNumber, ifscCode, branchName, upiId } = req.body;

  if (!accountHolder || !type) {
    return res.status(400).json({ message: "accountHolder and type are required" });
  }

  const validTypes: AccountTypeStr[] = ["CASH", "BANK", "UPI"];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ message: "type must be CASH, BANK, or UPI" });
  }

  try {
    const account = await prisma.account.create({
      data: {
        accountHolder,
        type:          type as AccountTypeStr,
        bankName:      bankName      || null,
        accountNumber: accountNumber || null,
        ifscCode:      ifscCode      || null,
        branchName:    branchName    || null,
        upiId:         upiId         || null,
      },
    });

    res.status(201).json({
      id:            account.id,
      accountHolder: account.accountHolder,
      bankName:      account.bankName,
      accountNumber: account.accountNumber,
      type:          account.type,
      balance:       0,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
//  DELETE /api/accounts/:id  — delete a business account
// ────────────────────────────────────────────────────────────────────────────
export const deleteAccount = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.account.delete({ where: { id } });
    res.json({ message: "Account deleted" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};
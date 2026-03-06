import { Request, Response } from "express";
import prisma from "../utils/prisma";

// ============================================================
// HELPERS
// ============================================================

/** Basic IFSC validation: 4 letters + 0 + 6 alphanumeric */
const validateIFSC = (ifsc: string): boolean =>
  /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase());

/** Mask account number for safe logging / responses: show last 4 digits only */
const maskAccount = (acc: string): string =>
  acc.length > 4 ? "*".repeat(acc.length - 4) + acc.slice(-4) : acc;

// ============================================================
// ADD BANK ACCOUNT
// POST /api/parties/:id/bank-accounts
// ============================================================
export const addBankAccount = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);

    if (isNaN(partyId)) {
      return res.status(400).json({ success: false, message: "Invalid party ID" });
    }

    const {
      accountHolder,
      accountNumber,
      bankName,
      ifscCode,
      branchName,
      accountType,
      isPrimary = false,
    } = req.body;

    // ── Validation ──────────────────────────────────────────
    if (!accountHolder || !accountNumber || !bankName || !ifscCode || !accountType) {
      return res.status(400).json({
        success: false,
        message:
          "accountHolder, accountNumber, bankName, ifscCode, and accountType are required",
      });
    }

    if (!validateIFSC(ifscCode)) {
      return res.status(400).json({ success: false, message: "Invalid IFSC code format" });
    }

    const validTypes = ["Savings", "Current", "OD"];
    if (!validTypes.includes(accountType)) {
      return res.status(400).json({
        success: false,
        message: `accountType must be one of: ${validTypes.join(", ")}`,
      });
    }

    // ── Party existence check ────────────────────────────────
    const party = await prisma.party.findUnique({ where: { id: partyId } });
    if (!party) {
      return res.status(404).json({ success: false, message: "Party not found" });
    }

    // ── If setting as primary, unset existing primary ────────
    if (isPrimary) {
      await prisma.partyBankAccount.updateMany({
        where: { partyId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const bankAccount = await prisma.partyBankAccount.create({
      data: {
        partyId,
        accountHolder,
        accountNumber,
        bankName,
        ifscCode: ifscCode.toUpperCase(),
        branchName,
        accountType,
        isPrimary,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Bank account added successfully",
      data: bankAccount,
    });
  } catch (error) {
    console.error("❌ Add Bank Account Error:", error);
    return res.status(500).json({ success: false, message: "Failed to add bank account" });
  }
};

// ============================================================
// GET ALL BANK ACCOUNTS FOR A PARTY
// GET /api/parties/:id/bank-accounts
// ============================================================
export const getBankAccounts = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);

    if (isNaN(partyId)) {
      return res.status(400).json({ success: false, message: "Invalid party ID" });
    }

    const accounts = await prisma.partyBankAccount.findMany({
      where: { partyId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    return res.status(200).json({
      success: true,
      data: accounts,
    });
  } catch (error) {
    console.error("❌ Get Bank Accounts Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch bank accounts" });
  }
};

// ============================================================
// UPDATE BANK ACCOUNT
// PUT /api/parties/:id/bank-accounts/:accountId
// ============================================================
export const updateBankAccount = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);
    const accountId = Number(req.params.accountId);

    if (isNaN(partyId) || isNaN(accountId)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const {
      accountHolder,
      accountNumber,
      bankName,
      ifscCode,
      branchName,
      accountType,
      isPrimary,
    } = req.body;

    // ── Validate IFSC if provided ────────────────────────────
    if (ifscCode && !validateIFSC(ifscCode)) {
      return res.status(400).json({ success: false, message: "Invalid IFSC code format" });
    }

    // ── Validate accountType if provided ─────────────────────
    const validTypes = ["Savings", "Current", "OD"];
    if (accountType && !validTypes.includes(accountType)) {
      return res.status(400).json({
        success: false,
        message: `accountType must be one of: ${validTypes.join(", ")}`,
      });
    }

    // ── Check account belongs to this party ──────────────────
    const existing = await prisma.partyBankAccount.findFirst({
      where: { id: accountId, partyId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: "Bank account not found" });
    }

    // ── If setting as primary, unset others ──────────────────
    if (isPrimary === true) {
      await prisma.partyBankAccount.updateMany({
        where: { partyId, isPrimary: true, id: { not: accountId } },
        data: { isPrimary: false },
      });
    }

    const updated = await prisma.partyBankAccount.update({
      where: { id: accountId },
      data: {
        ...(accountHolder && { accountHolder }),
        ...(accountNumber && { accountNumber }),
        ...(bankName && { bankName }),
        ...(ifscCode && { ifscCode: ifscCode.toUpperCase() }),
        ...(branchName !== undefined && { branchName }),
        ...(accountType && { accountType }),
        ...(isPrimary !== undefined && { isPrimary }),
      },
    });

    return res.status(200).json({
      success: true,
      message: "Bank account updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("❌ Update Bank Account Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update bank account" });
  }
};

// ============================================================
// DELETE BANK ACCOUNT
// DELETE /api/parties/:id/bank-accounts/:accountId
// ============================================================
export const deleteBankAccount = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);
    const accountId = Number(req.params.accountId);

    if (isNaN(partyId) || isNaN(accountId)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const existing = await prisma.partyBankAccount.findFirst({
      where: { id: accountId, partyId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: "Bank account not found" });
    }

    await prisma.partyBankAccount.delete({ where: { id: accountId } });

    return res.status(200).json({
      success: true,
      message: "Bank account deleted successfully",
    });
  } catch (error) {
    console.error("❌ Delete Bank Account Error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete bank account" });
  }
};

// ============================================================
// SET PRIMARY BANK ACCOUNT
// PATCH /api/parties/:id/bank-accounts/:accountId/set-primary
// ============================================================
export const setPrimaryBankAccount = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);
    const accountId = Number(req.params.accountId);

    if (isNaN(partyId) || isNaN(accountId)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const existing = await prisma.partyBankAccount.findFirst({
      where: { id: accountId, partyId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: "Bank account not found" });
    }

    // Unset all, then set the target
    await prisma.partyBankAccount.updateMany({
      where: { partyId },
      data: { isPrimary: false },
    });

    const updated = await prisma.partyBankAccount.update({
      where: { id: accountId },
      data: { isPrimary: true },
    });

    return res.status(200).json({
      success: true,
      message: "Primary bank account updated",
      data: updated,
    });
  } catch (error) {
    console.error("❌ Set Primary Bank Account Error:", error);
    return res.status(500).json({ success: false, message: "Failed to set primary account" });
  }
};
import { Request, Response } from "express";
import prisma from "../utils/prisma";

// ============================================================
// HELPERS
// ============================================================

/** Basic IFSC validation: 4 letters + 0 + 6 alphanumeric */
const validateIFSC = (ifsc: string): boolean =>
  /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase());

/** Mask account number for safe logging / responses */
const maskAccount = (acc: string): string =>
  acc.length > 4 ? "*".repeat(acc.length - 4) + acc.slice(-4) : acc;

/** Basic UPI validation */
const validateUPI = (upi: string): boolean =>
  /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test(upi);
// ============================================================
// ADD BANK ACCOUNT
// POST /api/parties/:id/bank-accounts
// ============================================================

export const addBankAccount = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);

    if (isNaN(partyId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid party ID",
      });
    }

    const {
      accountHolder,
      accountNumber,
      bankName,
      ifscCode,
      branchName,
      upiId,
    } = req.body;

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
    const party = await prisma.party.findUnique({
      where: { id: partyId },
    });

    if (!party) {
      return res.status(404).json({
        success: false,
        message: "Party not found",
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
        upiId,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Bank account added successfully",
      data: {
  ...bankAccount,
  accountNumber: maskAccount(bankAccount.accountNumber),
} ,
    });

  } catch (error) {
    console.error("❌ Add Bank Account Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add bank account",
    });
  }
};


// ============================================================
// GET BANK ACCOUNTS
// GET /api/parties/:id/bank-accounts
// ============================================================

export const getBankAccounts = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);

    if (isNaN(partyId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid party ID",
      });
    }

    const accounts = await prisma.partyBankAccount.findMany({
      where: { partyId },
      orderBy: { createdAt: "asc" },
    });

    return res.status(200).json({
      success: true,
      data: accounts,
    });

  } catch (error) {
    console.error("❌ Get Bank Accounts Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch bank accounts",
    });
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
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    const {
      accountHolder,
      accountNumber,
      bankName,
      ifscCode,
      branchName,
      upiId,
    } = req.body;

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

    const existing = await prisma.partyBankAccount.findFirst({
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

    const updated = await prisma.partyBankAccount.update({
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

  } catch (error) {
    console.error("❌ Update Bank Account Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update bank account",
    });
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
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    const existing = await prisma.partyBankAccount.findFirst({
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

    await prisma.partyBankAccount.delete({
      where: { id: accountId },
    });

    return res.status(200).json({
      success: true,
      message: "Bank account deleted successfully",
    });

  } catch (error) {
    console.error("❌ Delete Bank Account Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete bank account",
    });
  }
};
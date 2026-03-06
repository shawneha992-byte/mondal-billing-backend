import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { validateGST, validatePAN } from "../utils/gstPanValidator";
import { fetchGSTDetails } from "../services/gstService";
import { BalanceType, LedgerRefType, LedgerType } from "@prisma/client";

// ─── Helpers ────────────────────────────────────────────────────────────────

const validateIFSC = (ifsc: string): boolean =>
  /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase());

/**
 * ======================================================
 * CREATE PARTY
 * POST /api/parties
 *
 * Supports optional bankAccounts[] and customFields[]
 * in the same request body.
 * ======================================================
 */
export const createParty = async (req: Request, res: Response) => {
  try {
    const {
      partyName,
      mobileNumber,
      email,
      gstin,
      panNumber,
      partyType,
      partyCategory,
      billingAddress,
      shippingAddress,
      creditPeriod,
      creditLimit,
      openingBalance,
      openingBalanceType,

      // ✅ NEW: optional arrays
      bankAccounts = [],   // [{ accountHolder, accountNumber, bankName, ifscCode, branchName?, accountType, isPrimary? }]
      customFields = [],   // [{ fieldName, fieldValue }]
    } = req.body;

    // ── Basic validation ─────────────────────────────────────
    if (!partyName || !partyType) {
      return res.status(400).json({
        success: false,
        message: "partyName and partyType are required",
      });
    }

    if (gstin && !validateGST(gstin)) {
      return res.status(400).json({ success: false, message: "Invalid GST number format" });
    }

    if (panNumber && !validatePAN(panNumber)) {
      return res.status(400).json({ success: false, message: "Invalid PAN number format" });
    }

    if (openingBalance && !openingBalanceType) {
      return res.status(400).json({
        success: false,
        message: "openingBalanceType is required when openingBalance is provided",
      });
    }

    // ── Validate bank accounts ────────────────────────────────
    const validBankTypes = ["Savings", "Current", "OD"];
    for (const acc of bankAccounts) {
      if (!acc.accountHolder || !acc.accountNumber || !acc.bankName || !acc.ifscCode || !acc.accountType) {
        return res.status(400).json({
          success: false,
          message: "Each bank account must have accountHolder, accountNumber, bankName, ifscCode, and accountType",
        });
      }
      if (!validateIFSC(acc.ifscCode)) {
        return res.status(400).json({
          success: false,
          message: `Invalid IFSC code: ${acc.ifscCode}`,
        });
      }
      if (!validBankTypes.includes(acc.accountType)) {
        return res.status(400).json({
          success: false,
          message: `accountType must be one of: ${validBankTypes.join(", ")}`,
        });
      }
    }

    // ── Validate custom fields ────────────────────────────────
    for (const field of customFields) {
      if (!field.fieldName || field.fieldValue === undefined) {
        return res.status(400).json({
          success: false,
          message: "Each customField must have fieldName and fieldValue",
        });
      }
    }

    // ── Ensure at most one bank account is marked primary ─────
    const primaryBanks = bankAccounts.filter((a: any) => a.isPrimary);
    if (primaryBanks.length > 1) {
      return res.status(400).json({
        success: false,
        message: "Only one bank account can be marked as primary",
      });
    }

    // ── Fetch GST details if GSTIN provided ──────────────────
    let gstData: any = null;
    if (gstin) {
      gstData = await fetchGSTDetails(gstin);
      if (!gstData) {
        return res.status(400).json({ success: false, message: "GSTIN not found or inactive" });
      }
    }

    // ── Create Party + bank accounts + custom fields in one transaction ──
    const party = await prisma.$transaction(async (tx) => {
      // 1. Create the party
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

      // 2. Create opening ledger entry
      if (openingBalance && openingBalance > 0) {
        const isDebit = openingBalanceType === BalanceType.To_Collect;
        await tx.partyLedger.create({
          data: {
            partyId: newParty.id,
            refType: LedgerRefType.Opening,
            type: isDebit ? LedgerType.DEBIT : LedgerType.CREDIT,
            debit: isDebit ? openingBalance : null,
            credit: isDebit ? null : openingBalance,
            balance: openingBalance,
          },
        });
      }

      // 3. Create bank accounts
      if (bankAccounts.length > 0) {
        await tx.partyBankAccount.createMany({
          data: bankAccounts.map((acc: any, idx: number) => ({
            partyId: newParty.id,
            accountHolder: acc.accountHolder,
            accountNumber: acc.accountNumber,
            bankName: acc.bankName,
            ifscCode: acc.ifscCode.toUpperCase(),
            branchName: acc.branchName || null,
            accountType: acc.accountType,
            // If nobody marked primary, auto-mark the first one
            isPrimary: acc.isPrimary ?? (primaryBanks.length === 0 && idx === 0),
          })),
        });
      }

      // 4. Create custom fields
      if (customFields.length > 0) {
        await tx.partyCustomField.createMany({
          data: customFields.map((field: any) => ({
            partyId: newParty.id,
            fieldName: String(field.fieldName).trim(),
            fieldValue: String(field.fieldValue).trim(),
          })),
        });
      }

      return newParty;
    });

    // Re-fetch with all relations for the response
    const fullParty = await prisma.party.findUnique({
      where: { id: party.id },
      include: { bankAccounts: true, customFields: true },
    });

    return res.status(201).json({
      success: true,
      message: "Party created successfully",
      data: fullParty,
    });

  } catch (error) {
    console.error("❌ Create Party Error:", error);
    return res.status(500).json({ success: false, message: "Failed to create party" });
  }
};

/**
 * ======================================================
 * UPDATE PARTY
 * PUT /api/parties/:id
 * ======================================================
 */
export const updateParty = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);

    if (isNaN(partyId)) {
      return res.status(400).json({ success: false, message: "Invalid party ID" });
    }

    const {
      partyName,
      mobileNumber,
      email,
      gstin,
      panNumber,
      partyCategory,
      billingAddress,
      shippingAddress,
      creditPeriod,
      creditLimit,
      contactPersonName,
      dateOfBirth,
    } = req.body;

    if (gstin && !validateGST(gstin)) {
      return res.status(400).json({ success: false, message: "Invalid GST number format" });
    }

    if (panNumber && !validatePAN(panNumber)) {
      return res.status(400).json({ success: false, message: "Invalid PAN number format" });
    }

    let gstData: any = null;
    if (gstin) {
      gstData = await fetchGSTDetails(gstin);
      if (!gstData) {
        return res.status(400).json({ success: false, message: "GSTIN not found or inactive" });
      }
    }

    const party = await prisma.party.update({
      where: { id: partyId },
      data: {
        name: gstData?.legal_name || partyName,
        partyName: gstData?.legal_name || partyName,
        mobileNumber,
        email,
        gstin,
        panNumber,
        partyCategory,
        billingAddress: gstData?.address || billingAddress,
        shippingAddress,
        creditPeriod,
        creditLimit,
        contactPersonName,
        dateOfBirth,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Party updated successfully",
      data: party,
    });

  } catch (error) {
    console.error("❌ Update Party Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update party" });
  }
};

/**
 * ======================================================
 * GET ALL PARTIES
 * GET /api/parties
 * ======================================================
 */
export const getAllParties = async (_req: Request, res: Response) => {
  try {
    const parties = await prisma.party.findMany({
      orderBy: { created_at: "desc" },
    });

    return res.status(200).json({ success: true, data: parties });

  } catch (error) {
    console.error("❌ Get Parties Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch parties" });
  }
};

/**
 * ======================================================
 * GET PARTY BY ID
 * GET /api/parties/:id
 * Includes bankAccounts and customFields
 * ======================================================
 */
export const getPartyById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid party ID" });
    }

    const party = await prisma.party.findUnique({
      where: { id },
      include: {
        bankAccounts: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
        customFields: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!party) {
      return res.status(404).json({ success: false, message: "Party not found" });
    }

    return res.status(200).json({ success: true, data: party });

  } catch (error) {
    console.error("❌ Get Party By ID Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * ======================================================
 * DELETE PARTY
 * DELETE /api/parties/:id
 * ======================================================
 */
export const deleteParty = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);

    if (isNaN(partyId)) {
      return res.status(400).json({ success: false, message: "Invalid party ID" });
    }

    const party = await prisma.party.findUnique({ where: { id: partyId } });

    if (!party) {
      return res.status(404).json({ success: false, message: "Party not found" });
    }

    await prisma.party.delete({ where: { id: partyId } });

    return res.status(200).json({ success: true, message: "Party deleted successfully" });

  } catch (error) {
    console.error("❌ Delete Party Error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete party" });
  }
};
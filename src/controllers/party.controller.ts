import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { validateGST, validatePAN } from "../utils/gstPanValidator";
import { fetchGSTDetails } from "../services/gstService";
import { BalanceType, LedgerRefType, LedgerType } from "@prisma/client";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const validateIFSC = (ifsc: string): boolean =>
  /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase());


// ======================================================
// CREATE PARTY
// POST /api/parties
//
// FIX: External GST lookup (fetchGSTDetails) is now OPTIONAL.
// If the GST format is valid, the party is saved regardless of
// whether the external API returns data or not.
// The "Get Details" button on the frontend handles the enrichment
// separately — saving should never be blocked by a third-party API.
// ======================================================

export const createParty = async (req: Request, res: Response) => {
  try {
    const {
      partyName,
      mobileNumber,
      email,
      partyType,
      partyCategory,
      billingAddress,
      shippingAddress,
      creditPeriod,
      creditLimit,
      openingBalance,
      openingBalanceType,
      bankAccounts = [],
      customFields = [],
    } = req.body;

    // ── FIX: Sanitize GST and PAN — trim whitespace + force uppercase ─────────
    // Ensures "22aaaaa0000a1z5" and "22AAAAA0000A1Z5" both pass validation.
    const gstin = req.body.gstin
      ? String(req.body.gstin).trim().toUpperCase()
      : undefined;
    const panNumber = req.body.panNumber
      ? String(req.body.panNumber).trim().toUpperCase()
      : undefined;

    if (!partyName || !partyType) {
      return res.status(400).json({
        success: false,
        message: "partyName and partyType are required",
      });
    }

    // Format-only validation — no external API call here ✅
    if (gstin && !validateGST(gstin)) {
      return res.status(400).json({
        success: false,
        message: "Invalid GST number format. Expected format: 22AAAAA0000A1Z5",
      });
    }

    if (panNumber && !validatePAN(panNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PAN number format. Expected format: AAAAA0000A",
      });
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
          message:
            "Each bank account must have accountHolder, accountNumber, bankName and ifscCode",
        });
      }
      if (!validateIFSC(acc.ifscCode)) {
        return res.status(400).json({
          success: false,
          message: `Invalid IFSC code: ${acc.ifscCode}`,
        });
      }
    }

    // ── FIX: GST enrichment is OPTIONAL — never blocks saving ────────────────
    // Try to enrich party details from GST portal, but if the API fails
    // or returns nothing, we still proceed and save the party with what we have.
    let gstData: any = null;
    if (gstin) {
      try {
        gstData = await fetchGSTDetails(gstin);
        // gstData may be null if the external API is down or GSTIN not found.
        // That is fine — we use fallbacks from the form below.
      } catch {
        // External GST API error — silently ignore, save party as-is
        gstData = null;
      }
    }

    const party = await prisma.$transaction(async (tx) => {
      const newParty = await tx.party.create({
        data: {
          // Use GST portal data when available, else fall back to form values ✅
          name:               gstData?.legal_name || partyName,
          partyName:          gstData?.legal_name || partyName,
          mobileNumber,
          email,
          gstin,           // saved as clean uppercase ✅
          panNumber,       // saved as clean uppercase ✅
          partyType,
          partyCategory,
          billingAddress:  gstData?.address || billingAddress,
          shippingAddress,
          creditPeriod,
          creditLimit,
          openingBalance,
          openingBalanceType,
        },
      });

      if (openingBalance && openingBalance > 0) {
        const isDebit = openingBalanceType === BalanceType.To_Collect;
        await tx.partyLedger.create({
          data: {
            partyId: newParty.id,
            refType: LedgerRefType.Opening,
            type:    isDebit ? LedgerType.DEBIT : LedgerType.CREDIT,
            debit:   isDebit ? openingBalance : null,
            credit:  isDebit ? null : openingBalance,
            balance: openingBalance,
          },
        });
      }

      if (bankAccounts.length > 0) {
        await tx.partyBankAccount.createMany({
          data: bankAccounts.map((acc: any) => ({
            partyId:       newParty.id,
            accountHolder: acc.accountHolder,
            accountNumber: acc.accountNumber,
            bankName:      acc.bankName,
            ifscCode:      acc.ifscCode.toUpperCase(),
            branchName:    acc.branchName || null,
            upiId:         acc.upiId     || null,
          })),
        });
      }

      if (customFields.length > 0) {
        await tx.partyCustomField.createMany({
          data: customFields.map((field: any) => ({
            partyId:    newParty.id,
            fieldName:  field.fieldName,
            fieldValue: field.fieldValue,
          })),
        });
      }

      return newParty;
    });

    const fullParty = await prisma.party.findUnique({
      where:   { id: party.id },
      include: {
        bankAccounts: { orderBy: { createdAt: "asc" } },
        customFields: { orderBy: { createdAt: "asc" } },
      },
    });

    return res.status(201).json({
      success: true,
      message: "Party created successfully",
      data:    fullParty,
    });

  } catch (error) {
    console.error("Create Party Error:", error);
    return res.status(500).json({ success: false, message: "Failed to create party" });
  }
};


// ======================================================
// GET GST DETAILS  (called ONLY by the "Get Details" button)
// POST /api/parties/gst-details
//
// This is the ONLY place fetchGSTDetails() is called.
// The Save button does NOT call this — it only validates format.
// ======================================================

export const getGstDetails = async (req: Request, res: Response) => {
  const { gstin } = req.body;

  if (!gstin) {
    return res.status(400).json({ success: false, message: "GSTIN is required" });
  }

  const cleaned = String(gstin).trim().toUpperCase();

  if (!validateGST(cleaned)) {
    return res.status(400).json({
      success: false,
      message: "Invalid GST number format. Expected format: 22AAAAA0000A1Z5",
    });
  }

  try {
    const gstData = await fetchGSTDetails(cleaned);

    if (!gstData) {
      return res.status(404).json({
        success: false,
        message: "GSTIN not found or inactive on GST portal",
      });
    }

    return res.json({
      success: true,
      data: {
        legalName:  gstData.legal_name  || null,
        tradeName:  gstData.trade_name  || null,
        address:    gstData.address     || null,
        status:     gstData.status      || null,
        stateCode:  cleaned.slice(0, 2),
      },
    });
  } catch (error) {
    console.error("GST Lookup Error:", error);
    return res.status(503).json({
      success: false,
      message: "GST portal is unreachable. Please try again later.",
    });
  }
};


// ======================================================
// UPDATE PARTY
// PUT /api/parties/:id
// ======================================================

export const updateParty = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const {
      partyName,
      mobileNumber,
      email,
      partyType,
      partyCategory,
      billingAddress,
      shippingAddress,
      creditPeriod,
      creditLimit,
      openingBalance,
      openingBalanceType,
      status,
      contactPersonName,
      dateOfBirth,
    } = req.body;

    // ── Sanitize GST and PAN ─────────────────────────────────────────────────
    const gstin = req.body.gstin !== undefined
      ? (req.body.gstin ? String(req.body.gstin).trim().toUpperCase() : null)
      : undefined;

    const panNumber = req.body.panNumber !== undefined
      ? (req.body.panNumber ? String(req.body.panNumber).trim().toUpperCase() : null)
      : undefined;

    // Format-only validation on update too ✅
    if (gstin && !validateGST(gstin)) {
      return res.status(400).json({
        success: false,
        message: "Invalid GST number format. Expected format: 22AAAAA0000A1Z5",
      });
    }
    if (panNumber && !validatePAN(panNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PAN number format. Expected format: AAAAA0000A",
      });
    }

    // Build update payload with only defined fields
    const data: any = {};
    if (partyName          !== undefined) { data.name = partyName; data.partyName = partyName; }
    if (mobileNumber       !== undefined) data.mobileNumber       = mobileNumber;
    if (email              !== undefined) data.email              = email;
    if (gstin              !== undefined) data.gstin              = gstin;
    if (panNumber          !== undefined) data.panNumber          = panNumber;
    if (partyType          !== undefined) data.partyType          = partyType;
    if (partyCategory      !== undefined) data.partyCategory      = partyCategory;
    if (billingAddress     !== undefined) data.billingAddress     = billingAddress;
    if (shippingAddress    !== undefined) data.shippingAddress    = shippingAddress;
    if (creditPeriod       !== undefined) data.creditPeriod       = creditPeriod;
    if (creditLimit        !== undefined) data.creditLimit        = creditLimit;
    if (openingBalance     !== undefined) data.openingBalance     = openingBalance;
    if (openingBalanceType !== undefined) data.openingBalanceType = openingBalanceType;
    if (status             !== undefined) data.status             = status;
    if (contactPersonName  !== undefined) data.contactPersonName  = contactPersonName;
    if (dateOfBirth        !== undefined) data.dateOfBirth        = dateOfBirth;

    const party = await prisma.party.update({ where: { id }, data });

    return res.json({ success: true, message: "Party updated", data: party });

  } catch (error) {
    console.error("Update Party Error:", error);
    res.status(500).json({ success: false, message: "Failed to update party" });
  }
};


// ======================================================
// GET ALL PARTIES
// GET /api/parties
// ======================================================

export const getAllParties = async (_req: Request, res: Response) => {
  try {
    const parties = await prisma.party.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: parties });
  } catch (error) {
    console.error("Get Parties Error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch parties" });
  }
};


// ======================================================
// GET PARTY BY ID
// GET /api/parties/:id
// ======================================================

export const getPartyById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const party = await prisma.party.findUnique({
      where:   { id },
      include: {
        bankAccounts: { orderBy: { createdAt: "asc" } },
        customFields: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!party) {
      return res.status(404).json({ success: false, message: "Party not found" });
    }

    res.json({ success: true, data: party });
  } catch (error) {
    console.error("Get Party Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// ======================================================
// DELETE PARTY
// DELETE /api/parties/:id
// ======================================================

export const deleteParty = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await prisma.party.delete({ where: { id } });
    res.json({ success: true, message: "Party deleted successfully" });
  } catch (error) {
    console.error("Delete Party Error:", error);
    res.status(500).json({ success: false, message: "Failed to delete party" });
  }
};

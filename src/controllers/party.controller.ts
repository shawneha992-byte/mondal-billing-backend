import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { validateGST, validatePAN } from "../utils/gstPanValidator";
import { fetchGSTDetails } from "../services/gstService";
import { BalanceType, LedgerRefType, LedgerType } from "@prisma/client";

/**
 * ======================================================
 * CREATE PARTY
 * POST /api/parties
 * ======================================================
 */
export const createParty = async (req: Request, res: Response) => {
  try {
    const {
      partyName,
      mobile,
      email,
      gstin,
      pan,
      partyType,
      category,
      billingAddress,
      shippingAddress,
      creditPeriod,
      creditLimit,
      openingBalance,
      openingBalanceType
    } = req.body;

    // 🔴 Basic validation
    if (!partyName || !partyType) {
      return res.status(400).json({
        success: false,
        message: "partyName and partyType are required"
      });
    }

    // 🔴 GST validation
    if (gstin && !validateGST(gstin)) {
      return res.status(400).json({
        success: false,
        message: "Invalid GST number format"
      });
    }

    // 🔴 PAN validation
    if (pan && !validatePAN(pan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PAN number format"
      });
    }

    // 🔴 Opening balance consistency
    if (openingBalance && !openingBalanceType) {
      return res.status(400).json({
        success: false,
        message: "openingBalanceType is required when openingBalance is provided"
      });
    }

    // 🟡 Fetch GST details if GSTIN is present
    let gstData: any = null;
    if (gstin) {
      gstData = await fetchGSTDetails(gstin);
      if (!gstData) {
        return res.status(400).json({
          success: false,
          message: "GSTIN not found or inactive"
        });
      }
    }

    // ✅ Create Party (SCHEMA ALIGNED)
    const party = await prisma.party.create({
      data: {
        name: gstData?.legal_name || partyName,     // ✅ REQUIRED
        partyName: gstData?.legal_name || partyName,

        mobile,
        email,
        gstin,
        pan,
        partyType,
        category,
        billingAddress: gstData?.address || billingAddress,
        shippingAddress,
        creditPeriod,
        creditLimit,
        openingBalance,
        openingBalanceType
      }
    });

    // ✅ Create Opening Ledger Entry (ONE TIME)
    if (openingBalance && openingBalance > 0) {
      let debit: number | null = null;
      let credit: number | null = null;
      let type: LedgerType;

      if (openingBalanceType === BalanceType.ToCollect) {
        debit = openingBalance;
        type = LedgerType.DEBIT;
      } else {
        credit = openingBalance;
        type = LedgerType.CREDIT;
      }

      await prisma.partyLedger.create({
        data: {
          partyId: party.id,

          refType: LedgerRefType.Opening,
          type,                                // ✅ REQUIRED

          debit,
          credit,
          balance: openingBalance
        }
      });
    }

    return res.status(201).json({
      success: true,
      message: "Party created successfully",
      data: party
    });

  } catch (error) {
    console.error("❌ Create Party Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create party"
    });
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
      return res.status(400).json({
        success: false,
        message: "Invalid party ID"
      });
    }

    const {
      partyName,
      mobile,
      email,
      gstin,
      pan,
      category,
      billingAddress,
      shippingAddress,
      creditPeriod,
      creditLimit
    } = req.body;

    // 🔴 GST validation
    if (gstin && !validateGST(gstin)) {
      return res.status(400).json({
        success: false,
        message: "Invalid GST number format"
      });
    }

    // 🔴 PAN validation
    if (pan && !validatePAN(pan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid PAN number format"
      });
    }

    // 🟡 Fetch GST details if GSTIN provided
    let gstData: any = null;
    if (gstin) {
      gstData = await fetchGSTDetails(gstin);
      if (!gstData) {
        return res.status(400).json({
          success: false,
          message: "GSTIN not found or inactive"
        });
      }
    }

    const party = await prisma.party.update({
      where: { id: partyId },
      data: {
        name: gstData?.legal_name || partyName,   // ✅ REQUIRED
        partyName: gstData?.legal_name || partyName,

        mobile,
        email,
        gstin,
        pan,
        category,
        billingAddress: gstData?.address || billingAddress,
        shippingAddress,
        creditPeriod,
        creditLimit
      }
    });

    return res.status(200).json({
      success: true,
      message: "Party updated successfully",
      data: party
    });

  } catch (error) {
    console.error("❌ Update Party Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update party"
    });
  }
};

/**
 * ======================================================
 * GET ALL PARTIES
 * ======================================================
 */
export const getAllParties = async (_req: Request, res: Response) => {
  try {
    const parties = await prisma.party.findMany({
      orderBy: { created_at: "desc" }
    });

    return res.status(200).json({
      success: true,
      data: parties
    });

  } catch (error) {
    console.error("❌ Get Parties Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch parties"
    });
  }
};

/**
 * ======================================================
 * GET PARTY BY ID
 * ======================================================
 */
export const getPartyById = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);

    if (isNaN(partyId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid party ID"
      });
    }

    const party = await prisma.party.findUnique({
      where: { id: partyId }
    });

    if (!party) {
      return res.status(404).json({
        success: false,
        message: "Party not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: party
    });

  } catch (error) {
    console.error("❌ Get Party Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch party"
    });
  }
};

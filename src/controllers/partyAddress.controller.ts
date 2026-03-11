import { Request, Response } from "express";
import prisma from "../utils/prisma";

// ============================================================
// GET ADDRESSES
// GET /api/parties/:id/addresses
// ============================================================
export const getPartyAddresses = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);
    if (isNaN(partyId)) {
      return res.status(400).json({ success: false, message: "Invalid party ID" });
    }

    const addresses = await prisma.partyAddress.findMany({
      where:   { partyId },
      orderBy: { created_at: "asc" },
    });

    return res.json({ success: true, data: addresses });
  } catch (error) {
    console.error("❌ Get Party Addresses Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch addresses" });
  }
};

// ============================================================
// CREATE ADDRESS
// POST /api/parties/:id/addresses
// ============================================================
export const createPartyAddress = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);
    if (isNaN(partyId)) {
      return res.status(400).json({ success: false, message: "Invalid party ID" });
    }

    const { addressType, addressLine, city, state, pincode, country, isDefault } = req.body;

    if (!addressType || !addressLine || !city || !state || !pincode) {
      return res.status(400).json({
        success: false,
        message: "addressType, addressLine, city, state and pincode are required",
      });
    }

    // Check party exists
    const party = await prisma.party.findUnique({ where: { id: partyId } });
    if (!party) {
      return res.status(404).json({ success: false, message: "Party not found" });
    }

    const address = await prisma.partyAddress.create({
      data: {
        partyId,
        addressType,
        addressLine,
        city,
        state,
        pincode,
        country:   country   ?? "India",
        isDefault: isDefault ?? false,
      },
    });

    return res.status(201).json({ success: true, data: address });
  } catch (error) {
    console.error("❌ Create Party Address Error:", error);
    return res.status(500).json({ success: false, message: "Failed to create address" });
  }
};

// ============================================================
// UPDATE ADDRESS
// PUT /api/parties/:id/addresses/:addrId
// ============================================================
export const updatePartyAddress = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);
    const addrId  = Number(req.params.addrId);

    if (isNaN(partyId) || isNaN(addrId)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const existing = await prisma.partyAddress.findFirst({ where: { id: addrId, partyId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    const { addressType, addressLine, city, state, pincode, country, isDefault } = req.body;

    const updated = await prisma.partyAddress.update({
      where: { id: addrId },
      data: {
        ...(addressType && { addressType }),
        ...(addressLine && { addressLine }),
        ...(city        && { city        }),
        ...(state       && { state       }),
        ...(pincode     && { pincode     }),
        ...(country     !== undefined && { country     }),
        ...(isDefault   !== undefined && { isDefault   }),
      },
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error("❌ Update Party Address Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update address" });
  }
};

// ============================================================
// DELETE ADDRESS
// DELETE /api/parties/:id/addresses/:addrId
// ============================================================
export const deletePartyAddress = async (req: Request, res: Response) => {
  try {
    const partyId = Number(req.params.id);
    const addrId  = Number(req.params.addrId);

    if (isNaN(partyId) || isNaN(addrId)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const existing = await prisma.partyAddress.findFirst({ where: { id: addrId, partyId } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    await prisma.partyAddress.delete({ where: { id: addrId } });

    return res.json({ success: true, message: "Address deleted successfully" });
  } catch (error) {
    console.error("❌ Delete Party Address Error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete address" });
  }
};
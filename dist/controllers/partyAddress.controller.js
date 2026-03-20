"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePartyAddress = exports.updatePartyAddress = exports.createPartyAddress = exports.getPartyAddresses = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
// ============================================================
// GET ADDRESSES
// GET /api/parties/:id/addresses
// ============================================================
const getPartyAddresses = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        if (isNaN(partyId)) {
            return res.status(400).json({ success: false, message: "Invalid party ID" });
        }
        const addresses = await prisma_1.default.partyAddress.findMany({
            where: { partyId },
            orderBy: { created_at: "asc" },
        });
        return res.json({ success: true, data: addresses });
    }
    catch (error) {
        console.error("❌ Get Party Addresses Error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch addresses" });
    }
};
exports.getPartyAddresses = getPartyAddresses;
// ============================================================
// CREATE ADDRESS
// POST /api/parties/:id/addresses
// ============================================================
const createPartyAddress = async (req, res) => {
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
        const party = await prisma_1.default.party.findUnique({ where: { id: partyId } });
        if (!party) {
            return res.status(404).json({ success: false, message: "Party not found" });
        }
        const address = await prisma_1.default.partyAddress.create({
            data: {
                partyId,
                addressType,
                addressLine,
                city,
                state,
                pincode,
                country: country ?? "India",
                isDefault: isDefault ?? false,
            },
        });
        return res.status(201).json({ success: true, data: address });
    }
    catch (error) {
        console.error("❌ Create Party Address Error:", error);
        return res.status(500).json({ success: false, message: "Failed to create address" });
    }
};
exports.createPartyAddress = createPartyAddress;
// ============================================================
// UPDATE ADDRESS
// PUT /api/parties/:id/addresses/:addrId
// ============================================================
const updatePartyAddress = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        const addrId = Number(req.params.addrId);
        if (isNaN(partyId) || isNaN(addrId)) {
            return res.status(400).json({ success: false, message: "Invalid ID" });
        }
        const existing = await prisma_1.default.partyAddress.findFirst({ where: { id: addrId, partyId } });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Address not found" });
        }
        const { addressType, addressLine, city, state, pincode, country, isDefault } = req.body;
        const updated = await prisma_1.default.partyAddress.update({
            where: { id: addrId },
            data: {
                ...(addressType && { addressType }),
                ...(addressLine && { addressLine }),
                ...(city && { city }),
                ...(state && { state }),
                ...(pincode && { pincode }),
                ...(country !== undefined && { country }),
                ...(isDefault !== undefined && { isDefault }),
            },
        });
        return res.json({ success: true, data: updated });
    }
    catch (error) {
        console.error("❌ Update Party Address Error:", error);
        return res.status(500).json({ success: false, message: "Failed to update address" });
    }
};
exports.updatePartyAddress = updatePartyAddress;
// ============================================================
// DELETE ADDRESS
// DELETE /api/parties/:id/addresses/:addrId
// ============================================================
const deletePartyAddress = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        const addrId = Number(req.params.addrId);
        if (isNaN(partyId) || isNaN(addrId)) {
            return res.status(400).json({ success: false, message: "Invalid ID" });
        }
        const existing = await prisma_1.default.partyAddress.findFirst({ where: { id: addrId, partyId } });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Address not found" });
        }
        await prisma_1.default.partyAddress.delete({ where: { id: addrId } });
        return res.json({ success: true, message: "Address deleted successfully" });
    }
    catch (error) {
        console.error("❌ Delete Party Address Error:", error);
        return res.status(500).json({ success: false, message: "Failed to delete address" });
    }
};
exports.deletePartyAddress = deletePartyAddress;

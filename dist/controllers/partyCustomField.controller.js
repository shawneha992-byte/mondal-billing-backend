"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.replaceAllCustomFields = exports.deleteCustomField = exports.updateCustomField = exports.getCustomFields = exports.addCustomFields = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
// ============================================================
// ADD CUSTOM FIELD(S) TO A PARTY
// POST /api/parties/:id/custom-fields
//
// Accepts a single object OR an array:
//   { fieldName: "Region", fieldValue: "North" }
//   [{ fieldName: "Region", fieldValue: "North" }, ...]
// ============================================================
const addCustomFields = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        if (isNaN(partyId)) {
            return res.status(400).json({ success: false, message: "Invalid party ID" });
        }
        // Normalise to array so both single and bulk are handled the same way
        const payload = Array.isArray(req.body)
            ? req.body
            : [req.body];
        if (payload.length === 0) {
            return res.status(400).json({ success: false, message: "No fields provided" });
        }
        // ── Validate each entry ──────────────────────────────────
        for (const field of payload) {
            if (!field.fieldName || field.fieldValue === undefined || field.fieldValue === null) {
                return res.status(400).json({
                    success: false,
                    message: "Each field must have fieldName and fieldValue",
                });
            }
            if (typeof field.fieldName !== "string" || field.fieldName.trim() === "") {
                return res.status(400).json({
                    success: false,
                    message: "fieldName must be a non-empty string",
                });
            }
        }
        // ── Party existence check ────────────────────────────────
        const party = await prisma_1.default.party.findUnique({ where: { id: partyId } });
        if (!party) {
            return res.status(404).json({ success: false, message: "Party not found" });
        }
        // ── Bulk insert ──────────────────────────────────────────
        const created = await prisma_1.default.$transaction(payload.map((field) => prisma_1.default.partyCustomField.create({
            data: {
                partyId,
                fieldName: field.fieldName.trim(),
                fieldValue: String(field.fieldValue).trim(),
            },
        })));
        return res.status(201).json({
            success: true,
            message: `${created.length} custom field(s) added successfully`,
            data: created,
        });
    }
    catch (error) {
        console.error("❌ Add Custom Fields Error:", error);
        return res.status(500).json({ success: false, message: "Failed to add custom fields" });
    }
};
exports.addCustomFields = addCustomFields;
// ============================================================
// GET ALL CUSTOM FIELDS FOR A PARTY
// GET /api/parties/:id/custom-fields
// ============================================================
const getCustomFields = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        if (isNaN(partyId)) {
            return res.status(400).json({ success: false, message: "Invalid party ID" });
        }
        const fields = await prisma_1.default.partyCustomField.findMany({
            where: { partyId },
            orderBy: { createdAt: "asc" },
        });
        return res.status(200).json({
            success: true,
            data: fields,
        });
    }
    catch (error) {
        console.error("❌ Get Custom Fields Error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch custom fields" });
    }
};
exports.getCustomFields = getCustomFields;
// ============================================================
// UPDATE A CUSTOM FIELD
// PUT /api/parties/:id/custom-fields/:fieldId
// ============================================================
const updateCustomField = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        const fieldId = Number(req.params.fieldId);
        if (isNaN(partyId) || isNaN(fieldId)) {
            return res.status(400).json({ success: false, message: "Invalid ID" });
        }
        const { fieldName, fieldValue } = req.body;
        if (!fieldName && fieldValue === undefined) {
            return res.status(400).json({
                success: false,
                message: "At least one of fieldName or fieldValue is required",
            });
        }
        // ── Confirm the field belongs to this party ──────────────
        const existing = await prisma_1.default.partyCustomField.findFirst({
            where: { id: fieldId, partyId },
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Custom field not found" });
        }
        const updated = await prisma_1.default.partyCustomField.update({
            where: { id: fieldId },
            data: {
                ...(fieldName && { fieldName: fieldName.trim() }),
                ...(fieldValue !== undefined && { fieldValue: String(fieldValue).trim() }),
            },
        });
        return res.status(200).json({
            success: true,
            message: "Custom field updated successfully",
            data: updated,
        });
    }
    catch (error) {
        console.error("❌ Update Custom Field Error:", error);
        return res.status(500).json({ success: false, message: "Failed to update custom field" });
    }
};
exports.updateCustomField = updateCustomField;
// ============================================================
// DELETE A CUSTOM FIELD
// DELETE /api/parties/:id/custom-fields/:fieldId
// ============================================================
const deleteCustomField = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        const fieldId = Number(req.params.fieldId);
        if (isNaN(partyId) || isNaN(fieldId)) {
            return res.status(400).json({ success: false, message: "Invalid ID" });
        }
        const existing = await prisma_1.default.partyCustomField.findFirst({
            where: { id: fieldId, partyId },
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Custom field not found" });
        }
        await prisma_1.default.partyCustomField.delete({ where: { id: fieldId } });
        return res.status(200).json({
            success: true,
            message: "Custom field deleted successfully",
        });
    }
    catch (error) {
        console.error("❌ Delete Custom Field Error:", error);
        return res.status(500).json({ success: false, message: "Failed to delete custom field" });
    }
};
exports.deleteCustomField = deleteCustomField;
// ============================================================
// BULK REPLACE CUSTOM FIELDS (UPSERT ALL AT ONCE)
// PUT /api/parties/:id/custom-fields
//
// Deletes all existing custom fields for the party and
// replaces them with the provided array. Useful for a
// "save all fields" UI action.
// ============================================================
const replaceAllCustomFields = async (req, res) => {
    try {
        const partyId = Number(req.params.id);
        if (isNaN(partyId)) {
            return res.status(400).json({ success: false, message: "Invalid party ID" });
        }
        const payload = Array.isArray(req.body)
            ? req.body
            : [];
        // Validate
        for (const field of payload) {
            if (!field.fieldName || field.fieldValue === undefined) {
                return res.status(400).json({
                    success: false,
                    message: "Each field must have fieldName and fieldValue",
                });
            }
        }
        const party = await prisma_1.default.party.findUnique({ where: { id: partyId } });
        if (!party) {
            return res.status(404).json({ success: false, message: "Party not found" });
        }
        // Delete all then re-insert in a single transaction
        const result = await prisma_1.default.$transaction(async (tx) => {
            await tx.partyCustomField.deleteMany({ where: { partyId } });
            if (payload.length === 0)
                return [];
            return await Promise.all(payload.map((field) => tx.partyCustomField.create({
                data: {
                    partyId,
                    fieldName: field.fieldName.trim(),
                    fieldValue: String(field.fieldValue).trim(),
                },
            })));
        });
        return res.status(200).json({
            success: true,
            message: `Custom fields replaced (${result.length} saved)`,
            data: result,
        });
    }
    catch (error) {
        console.error("❌ Replace Custom Fields Error:", error);
        return res.status(500).json({ success: false, message: "Failed to replace custom fields" });
    }
};
exports.replaceAllCustomFields = replaceAllCustomFields;

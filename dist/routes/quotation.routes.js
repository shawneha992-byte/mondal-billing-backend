"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const quotation_controller_1 = require("../controllers/quotation.controller");
const router = (0, express_1.Router)();
// ── Settings ──────────────────────────────────────────────────────────────────
router.get("/settings/", quotation_controller_1.getQuotationSettings);
router.put("/settings/", quotation_controller_1.saveQuotationSettings);
// ── Quotations CRUD ───────────────────────────────────────────────────────────
router.post("/", quotation_controller_1.createQuotation);
router.get("/", quotation_controller_1.getAllQuotations);
router.get("/:id", quotation_controller_1.getQuotationById);
router.put("/:id", quotation_controller_1.updateQuotation);
router.delete("/:id", quotation_controller_1.deleteQuotation);
// ── Actions ───────────────────────────────────────────────────────────────────
router.post("/:id/convert", quotation_controller_1.convertQuotationToInvoice);
router.post("/:id/duplicate", quotation_controller_1.duplicateQuotation);
exports.default = router;

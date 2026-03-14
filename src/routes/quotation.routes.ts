import { Router } from "express";
import {
  createQuotation,
  getAllQuotations,
  getQuotationById,
  updateQuotation,
  deleteQuotation,
  convertQuotationToInvoice,
  duplicateQuotation,
  getQuotationSettings,
  saveQuotationSettings,
} from "../controllers/quotation.controller";

import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

// ── Settings ──────────────────────────────────────────────────────────────────
router.get("/settings/", getQuotationSettings);
router.put("/settings/", saveQuotationSettings);

// ── Quotations CRUD ───────────────────────────────────────────────────────────
router.post("/", createQuotation);
router.get("/", getAllQuotations);
router.get("/:id", getQuotationById);
router.put("/:id", updateQuotation);
router.delete("/:id", deleteQuotation);

// ── Actions ───────────────────────────────────────────────────────────────────
router.post("/:id/convert", convertQuotationToInvoice);
router.post("/:id/duplicate", duplicateQuotation);

export default router;
import { Router } from "express";
import {
  createProformaInvoice,
  getProformaInvoices
} from "../controllers/proforma.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/", authMiddleware, createProformaInvoice);
router.get("/", authMiddleware, getProformaInvoices);

export default router;

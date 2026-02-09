import { Router } from "express";
import {
  createQuotation,
  getAllQuotations,
  getQuotationById,
} from "../controllers/quotation.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/", authMiddleware, createQuotation);
router.get("/", authMiddleware, getAllQuotations);
router.get("/:id", authMiddleware, getQuotationById);

export default router;

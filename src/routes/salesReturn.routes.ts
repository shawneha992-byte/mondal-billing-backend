/**
 * salesReturn.routes.ts
 * Register at index.ts with:
 *   app.use("/api/sales-return", salesReturnRouter);
 */

import { Router } from "express";
import {
  createSalesReturn,
  getSalesReturns,
  getSalesReturnById,
  getAvailableInvoicesForReturn,
  deleteSalesReturn,
} from "../controllers/salesReturn.controller";

const router = Router();

// ── Invoice availability check (must come before /:id routes) ──────────────
router.get("/available-invoices", getAvailableInvoicesForReturn);

// ── CRUD ───────────────────────────────────────────────────────────────────
router.post  ("/sales-return",     createSalesReturn);
router.get   ("/sales-return",     getSalesReturns);
router.get   ("/sales-return/:id", getSalesReturnById);
router.delete("/sales-return/:id", deleteSalesReturn);

export default router;
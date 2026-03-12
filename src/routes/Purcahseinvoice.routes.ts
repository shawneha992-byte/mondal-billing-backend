import { Router } from "express";

import {
  createPurchaseInvoice,
  getPurchaseInvoices,
  getPurchaseInvoiceById,
  updatePurchaseInvoice,
  deletePurchaseInvoice,
  cancelPurchaseInvoice,
  recordPurchaseInvoicePayment,
  getPurchaseInvoiceSummary
} from "../controllers/Purchaseinvoice.controller";

const router = Router();

/* -------------------------------------------------------
   SUMMARY (keep before /:id to avoid conflict)
------------------------------------------------------- */

router.get("/summary", getPurchaseInvoiceSummary);

/* -------------------------------------------------------
   CRUD ROUTES
------------------------------------------------------- */

router.post("/", createPurchaseInvoice);

router.get("/", getPurchaseInvoices);

router.get("/:id", getPurchaseInvoiceById);

router.put("/:id", updatePurchaseInvoice);

router.delete("/:id", deletePurchaseInvoice);

/* -------------------------------------------------------
   ACTION ROUTES
------------------------------------------------------- */

router.patch("/:id/cancel", cancelPurchaseInvoice);

router.patch("/:id/payment", recordPurchaseInvoicePayment);

export default router;
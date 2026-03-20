import { Router } from "express";

import {
  createPurchaseInvoice,
  getPurchaseInvoices,
  getPurchaseInvoiceById,
  updatePurchaseInvoice,
  deletePurchaseInvoice,
  cancelPurchaseInvoice,
  recordPurchaseInvoicePayment,
  getPurchaseInvoiceSummary,
  getPendingInvoicesByParty,
  getNextPurchaseInvoiceNumber,
} from "../controllers/Purchaseinvoice.controller";

import {
  getPurchaseInvoiceSettings,
  updatePurchaseInvoiceSettings,
} from "../controllers/purchaseInvoiceSettings.controller";

const router = Router();

/* -------------------------------------------------------
   SETTINGS (VERY IMPORTANT FOR PREFIX UI)
------------------------------------------------------- */
router.get("/settings", getPurchaseInvoiceSettings);
router.put("/settings", updatePurchaseInvoiceSettings);

/* -------------------------------------------------------
   SUMMARY
------------------------------------------------------- */
router.get("/summary", getPurchaseInvoiceSummary);

/* -------------------------------------------------------
   SPECIAL ROUTES (must be above /:id)
------------------------------------------------------- */
router.get("/next-invoice-number", getNextPurchaseInvoiceNumber);
router.get("/party/:partyId/pending", getPendingInvoicesByParty);

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
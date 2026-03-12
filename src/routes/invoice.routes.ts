import { Router } from "express";
import {
  createInvoice,
  getInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  cancelInvoice,
  recordInvoicePayment,
  getInvoiceSummary,
  getPartyItemWiseReport,
} from "../controllers/invoice.controller";

const router = Router();

// Summary and reports first (before /:id to avoid conflicts)
router.get(    "/summary",              getInvoiceSummary);       // GET  /api/invoices/summary
router.get(    "/party-item-wise/:id",  getPartyItemWiseReport);  // GET  /api/invoices/party-item-wise/:id

// CRUD
router.post(   "/",                     createInvoice);           // POST /api/invoices
router.get(    "/",                     getInvoices);             // GET  /api/invoices  (paginated + filtered)
router.get(    "/:id",                  getInvoiceById);          // GET  /api/invoices/:id
router.put(    "/:id",                  updateInvoice);           // PUT  /api/invoices/:id
router.delete( "/:id",                  deleteInvoice);           // DELETE /api/invoices/:id

// Actions
router.patch(  "/:id/cancel",           cancelInvoice);           // PATCH /api/invoices/:id/cancel
router.patch(  "/:id/payment",          recordInvoicePayment);    // PATCH /api/invoices/:id/payment

export default router;
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const invoice_controller_1 = require("../controllers/invoice.controller");
const router = (0, express_1.Router)();
// Summary and reports first (before /:id to avoid conflicts)
router.get("/summary", invoice_controller_1.getInvoiceSummary); // GET  /api/invoices/summary
router.get("/party-item-wise/:id", invoice_controller_1.getPartyItemWiseReport); // GET  /api/invoices/party-item-wise/:id
// CRUD
router.post("/", invoice_controller_1.createInvoice); // POST /api/invoices
router.get("/", invoice_controller_1.getInvoices); // GET  /api/invoices  (paginated + filtered)
router.get("/:id", invoice_controller_1.getInvoiceById); // GET  /api/invoices/:id
router.put("/:id", invoice_controller_1.updateInvoice); // PUT  /api/invoices/:id
router.delete("/:id", invoice_controller_1.deleteInvoice); // DELETE /api/invoices/:id
// Actions
router.patch("/:id/cancel", invoice_controller_1.cancelInvoice); // PATCH /api/invoices/:id/cancel
router.patch("/:id/payment", invoice_controller_1.recordInvoicePayment); // PATCH /api/invoices/:id/payment
exports.default = router;

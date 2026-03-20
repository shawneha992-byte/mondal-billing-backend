"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Purchaseinvoice_controller_1 = require("../controllers/Purchaseinvoice.controller");
const purchaseInvoiceSettings_controller_1 = require("../controllers/purchaseInvoiceSettings.controller");
const router = (0, express_1.Router)();
/* -------------------------------------------------------
   SETTINGS (VERY IMPORTANT FOR PREFIX UI)
------------------------------------------------------- */
router.get("/settings", purchaseInvoiceSettings_controller_1.getPurchaseInvoiceSettings);
router.put("/settings", purchaseInvoiceSettings_controller_1.updatePurchaseInvoiceSettings);
/* -------------------------------------------------------
   SUMMARY
------------------------------------------------------- */
router.get("/summary", Purchaseinvoice_controller_1.getPurchaseInvoiceSummary);
/* -------------------------------------------------------
   SPECIAL ROUTES (must be above /:id)
------------------------------------------------------- */
router.get("/next-invoice-number", Purchaseinvoice_controller_1.getNextPurchaseInvoiceNumber);
router.get("/party/:partyId/pending", Purchaseinvoice_controller_1.getPendingInvoicesByParty);
/* -------------------------------------------------------
   CRUD ROUTES
------------------------------------------------------- */
router.post("/", Purchaseinvoice_controller_1.createPurchaseInvoice);
router.get("/", Purchaseinvoice_controller_1.getPurchaseInvoices);
router.get("/:id", Purchaseinvoice_controller_1.getPurchaseInvoiceById);
router.put("/:id", Purchaseinvoice_controller_1.updatePurchaseInvoice);
router.delete("/:id", Purchaseinvoice_controller_1.deletePurchaseInvoice);
/* -------------------------------------------------------
   ACTION ROUTES
------------------------------------------------------- */
router.patch("/:id/cancel", Purchaseinvoice_controller_1.cancelPurchaseInvoice);
router.patch("/:id/payment", Purchaseinvoice_controller_1.recordPurchaseInvoicePayment);
exports.default = router;

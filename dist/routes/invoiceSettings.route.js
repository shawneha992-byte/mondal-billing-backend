"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const invoiceSettings_controller_1 = require("../controllers/invoiceSettings.controller");
const router = (0, express_1.Router)();
router.get("/", invoiceSettings_controller_1.getInvoiceSettings); // GET  /api/invoice-settings
router.post("/", invoiceSettings_controller_1.saveInvoiceSettings); // POST /api/invoice-settings
exports.default = router;

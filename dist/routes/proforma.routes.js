"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const proforma_controller_1 = require("../controllers/proforma.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post("/", auth_middleware_1.authMiddleware, proforma_controller_1.createProformaInvoice);
router.get("/", auth_middleware_1.authMiddleware, proforma_controller_1.getProformaInvoices);
exports.default = router;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const paymentIn_controller_1 = require("../controllers/paymentIn.controller");
const router = (0, express_1.Router)();
// IMPORTANT: fixed routes must come before /:id to avoid being caught as an id
router.get("/settings", paymentIn_controller_1.getPaymentInSettings); // GET  /api/payment-in/settings
router.get("/accounts", paymentIn_controller_1.getPaymentInAccounts); // GET  /api/payment-in/accounts
router.get("/", paymentIn_controller_1.getPaymentsIn); // GET  /api/payment-in
router.post("/", paymentIn_controller_1.createPaymentIn); // POST /api/payment-in
router.get("/:id", paymentIn_controller_1.getPaymentInById); // GET  /api/payment-in/:id
router.put("/:id", paymentIn_controller_1.updatePaymentIn); // PUT  /api/payment-in/:id
router.delete("/:id", paymentIn_controller_1.deletePaymentIn); // DELETE /api/payment-in/:id
exports.default = router;

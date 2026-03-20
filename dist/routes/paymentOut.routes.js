"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const paymentOut_controller_1 = require("../controllers/paymentOut.controller");
const paymentOutSettings_controller_1 = require("../controllers/paymentOutSettings.controller");
const router = express_1.default.Router();
/* ===============================
   CREATE PAYMENT
=============================== */
router.post("/", paymentOut_controller_1.createPaymentOut);
/* ===============================
   GET ALL PAYMENTS
=============================== */
router.get("/", paymentOut_controller_1.getAllPaymentOut);
/* ===============================
   PAYMENT SETTINGS
=============================== */
router.get("/settings", paymentOutSettings_controller_1.getPaymentOutSettings);
router.put("/settings", paymentOutSettings_controller_1.updatePaymentOutSettings);
/* ===============================
   GET SINGLE PAYMENT
=============================== */
router.get("/:id", paymentOut_controller_1.getPaymentOutById);
/* ===============================
   DELETE PAYMENT
=============================== */
router.delete("/:id", paymentOut_controller_1.deletePaymentOut);
exports.default = router;

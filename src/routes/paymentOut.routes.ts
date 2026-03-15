import express from "express";
import {
  createPaymentOut,
  getAllPaymentOut,
  getPaymentOutById,
  deletePaymentOut,
} from "../controllers/paymentOut.controller";

import {
  getPaymentOutSettings,
  updatePaymentOutSettings
} from "../controllers/paymentOutSettings.controller";

const router = express.Router();

/* ===============================
   CREATE PAYMENT
=============================== */
router.post("/", createPaymentOut);

/* ===============================
   GET ALL PAYMENTS
=============================== */
router.get("/", getAllPaymentOut);

/* ===============================
   PAYMENT SETTINGS
=============================== */
router.get("/settings", getPaymentOutSettings);
router.put("/settings", updatePaymentOutSettings);

/* ===============================
   GET SINGLE PAYMENT
=============================== */
router.get("/:id", getPaymentOutById);

/* ===============================
   DELETE PAYMENT
=============================== */
router.delete("/:id", deletePaymentOut);

export default router;
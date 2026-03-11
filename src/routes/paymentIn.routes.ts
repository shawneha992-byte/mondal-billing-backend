import { Router } from "express";
import {
  getPaymentsIn,
  getPaymentInById,
  getPaymentInSettings,
  createPaymentIn,
  updatePaymentIn,
  deletePaymentIn,
} from "../controllers/paymentIn.controller";

const router = Router();

// IMPORTANT: /settings must come before /:id to avoid being caught as an id
router.get("/settings", getPaymentInSettings);   // GET  /api/payment-in/settings
router.get("/",         getPaymentsIn);           // GET  /api/payment-in
router.post("/",        createPaymentIn);         // POST /api/payment-in
router.get("/:id",      getPaymentInById);        // GET  /api/payment-in/:id
router.put("/:id",      updatePaymentIn);         // PUT  /api/payment-in/:id
router.delete("/:id",   deletePaymentIn);         // DELETE /api/payment-in/:id

export default router;
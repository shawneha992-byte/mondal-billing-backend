import { Router } from "express";
import {
  getInvoiceDetailsSettings,
  saveInvoiceDetailsSettings,
} from "../controllers/invoicedetailssettings.controller";

const router = Router();

router.get("/", getInvoiceDetailsSettings);   // GET  /api/invoice-details-settings
router.put("/", saveInvoiceDetailsSettings);  // PUT  /api/invoice-details-settings

export default router;
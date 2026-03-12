import { Router } from "express";
import { getInvoiceSettings, saveInvoiceSettings } from "../controllers/invoiceSettings.controller";

const router = Router();

router.get("/",  getInvoiceSettings);   // GET  /api/invoice-settings
router.post("/", saveInvoiceSettings);  // POST /api/invoice-settings

export default router;
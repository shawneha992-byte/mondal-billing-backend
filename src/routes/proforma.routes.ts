import { Router } from "express";
import {
  createProformaInvoice,
  getProformaInvoices,
  getProformaInvoiceById,
  updateProformaInvoice,
  deleteProformaInvoice,
  convertProformaToInvoice,
} from "../controllers/proforma.controller";

const router = Router();

// All routes are protected
router.get("/settings", async (req, res) => {
  try {
    res.json({
      id: 1,
      prefix: "PI-",
      sequenceNumber: 1,
      enablePrefix: true,
      showItemImage: false,
      priceHistory: false,
      branchCode: null,
    });
  } catch (err) {
    console.error("SETTINGS ERROR:", err);
    res.status(500).json({ message: "Settings failed" });
  }
});
router.post("/",                    createProformaInvoice);
router.get("/",                     getProformaInvoices);
router.get("/:id",                getProformaInvoiceById);
router.put("/:id",                  updateProformaInvoice);
router.delete("/:id",               deleteProformaInvoice);
router.post("/:id/convert",         convertProformaToInvoice);   // ← NEW: convert to sales invoice

export default router;
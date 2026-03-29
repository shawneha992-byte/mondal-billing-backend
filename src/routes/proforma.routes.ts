import { Router } from "express";
import {
  createProformaInvoice,
  getProformaInvoices,
  getProformaInvoiceById,
  updateProformaInvoice,
  deleteProformaInvoice,
  convertProformaToInvoice,
  updateProformaStatus,   // FIX: new dedicated status endpoint
} from "../controllers/proforma.controller";

const router = Router();

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

router.post("/",               createProformaInvoice);
router.get("/",                getProformaInvoices);
router.get("/:id",             getProformaInvoiceById);
router.put("/:id",             updateProformaInvoice);
router.delete("/:id",          deleteProformaInvoice);

// FIX: Dedicated status-update endpoint called by CreateSalesInvoice AFTER
// the invoice is saved. This ensures the proforma is marked CONVERTED only
// once a real invoice exists — not when the user merely clicks "Convert".
router.patch("/:id/status",    updateProformaStatus);

// Convert endpoint — returns data only, does NOT change status
router.post("/:id/convert",    convertProformaToInvoice);

export default router;
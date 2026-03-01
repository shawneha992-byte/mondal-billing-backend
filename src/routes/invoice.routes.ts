import { Router } from "express";
import { createInvoice, getInvoices,getPartyItemWiseReport } from "../controllers/invoice.controller";

const router = Router();

router.post("/", createInvoice);
router.get("/", getInvoices);
router.get("/party-item-wise/:id", getPartyItemWiseReport);
export default router;

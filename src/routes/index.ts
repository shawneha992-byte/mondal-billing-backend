import { Router } from "express";
import authRoutes from "./auth.routes";
import quotationRoutes from "./quotation.routes";
import proformaRoutes from "./proforma.routes";
import salesReturnRoutes from "./salesReturn.routes";
import invoiceRoutes from "./invoice.routes";
const router = Router();

router.use("/api/auth", authRoutes);
router.use("/api/quotations", quotationRoutes);
router.use("/api/proforma", proformaRoutes);
router.use("/api/sales-return", salesReturnRoutes);
router.use("/api/invoices", invoiceRoutes);
    
export default router;

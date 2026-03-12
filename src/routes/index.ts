import { Router } from "express";

import authRoutes from "./auth.routes";
import itemRoutes from "./item.routes";
import invoiceRoutes from "./invoice.routes";
import partyRoutes from "./party.routes";
import partyLedgerRoutes from "./partyLedger.routes";
import paymentInRoutes from "./paymentIn.routes";
import salesReturnRoutes from "./salesReturn.routes";
import transactionRoutes from "./transaction.routes";
import partyExtraRoutes from "./partyExtra.routes";
import categoryRoutes from "./category.routes";
import godownRoutes from "./godown.routes";
import purchaseInvoiceRoutes from "./Purchaseinvoice.routes";
const router = Router();

router.use("/auth", authRoutes);
router.use("/items", itemRoutes);
router.use("/invoices", invoiceRoutes);
router.use("/parties", partyRoutes);
router.use("/party-ledger", partyLedgerRoutes);
router.use("/payments-in", paymentInRoutes);
router.use("/sales-return", salesReturnRoutes);
router.use("/transactions", transactionRoutes);
router.use("/", partyExtraRoutes);
router.use("/categories", categoryRoutes);
router.use("/godowns", godownRoutes);
router.use("/purchase-invoices", purchaseInvoiceRoutes);
export default router;
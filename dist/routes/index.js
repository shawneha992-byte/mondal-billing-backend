"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_routes_1 = __importDefault(require("./auth.routes"));
const item_routes_1 = __importDefault(require("./item.routes"));
const invoice_routes_1 = __importDefault(require("./invoice.routes"));
const party_routes_1 = __importDefault(require("./party.routes"));
const partyLedger_routes_1 = __importDefault(require("./partyLedger.routes"));
const paymentIn_routes_1 = __importDefault(require("./paymentIn.routes"));
const salesReturn_routes_1 = __importDefault(require("./salesReturn.routes"));
const transaction_routes_1 = __importDefault(require("./transaction.routes"));
const partyExtra_routes_1 = __importDefault(require("./partyExtra.routes"));
const category_routes_1 = __importDefault(require("./category.routes"));
const godown_routes_1 = __importDefault(require("./godown.routes"));
const Purchaseinvoice_routes_1 = __importDefault(require("./Purchaseinvoice.routes"));
const quotation_routes_1 = __importDefault(require("./quotation.routes"));
const productStock_routes_1 = __importDefault(require("./productStock.routes"));
const StockLedger_routes_1 = __importDefault(require("./StockLedger.routes"));
const invoiceSettings_route_1 = __importDefault(require("./invoiceSettings.route"));
const paymentOut_routes_1 = __importDefault(require("./paymentOut.routes"));
const purchaseOrder_routes_1 = __importDefault(require("./purchaseOrder.routes"));
const accounts_routes_1 = __importDefault(require("./accounts.routes"));
const router = (0, express_1.Router)();
router.use("/auth", auth_routes_1.default);
router.use("/items", item_routes_1.default);
router.use("/invoices", invoice_routes_1.default);
router.use("/parties", party_routes_1.default);
router.use("/accounts", accounts_routes_1.default);
router.use("/party-ledger", partyLedger_routes_1.default);
router.use("/payments-in", paymentIn_routes_1.default);
router.use("/sales-return", salesReturn_routes_1.default);
router.use("/transactions", transaction_routes_1.default);
router.use("/", partyExtra_routes_1.default);
router.use("/categories", category_routes_1.default);
router.use("/godowns", godown_routes_1.default);
router.use("/purchase-invoices", Purchaseinvoice_routes_1.default);
router.use("/quotations", quotation_routes_1.default);
router.use("/product-stocks", productStock_routes_1.default); // ← ADD: stock opening management
router.use("/stock-ledger", StockLedger_routes_1.default); // ← ADD: stock history / audit
router.use("/invoice-settings", invoiceSettings_route_1.default); // ← ADD: prefix / sequence settings
router.use("/payment-out", paymentOut_routes_1.default);
router.use("/purchase-orders", purchaseOrder_routes_1.default);
exports.default = router;

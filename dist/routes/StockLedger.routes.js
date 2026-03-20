"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Stockledger_controller_1 = require("../controllers/Stockledger.controller");
const router = (0, express_1.Router)();
router.get("/summary", Stockledger_controller_1.getStockSummary); // GET  /api/stock-ledger/summary
router.get("/product/:productId", Stockledger_controller_1.getProductStockLedger); // GET  /api/stock-ledger/product/:id
router.get("/", Stockledger_controller_1.getStockLedger); // GET  /api/stock-ledger
router.post("/adjustment", Stockledger_controller_1.createStockAdjustment); // POST /api/stock-ledger/adjustment
exports.default = router;

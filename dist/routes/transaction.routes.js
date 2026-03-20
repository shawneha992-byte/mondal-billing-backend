"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const transaction_controller_1 = require("../controllers/transaction.controller");
const router = (0, express_1.Router)();
router.get("/party/:id", transaction_controller_1.getPartyTransactions);
router.get("/party/:id/items", transaction_controller_1.getPartyItemWise);
exports.default = router;

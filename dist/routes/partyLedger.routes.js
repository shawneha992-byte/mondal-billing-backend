"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const partyLedger_controller_1 = require("../controllers/partyLedger.controller");
const router = express_1.default.Router();
router.get("/party/:id/ledger", partyLedger_controller_1.getPartyLedger);
router.get("/party/:id/balance", partyLedger_controller_1.getPartyBalance);
exports.default = router;

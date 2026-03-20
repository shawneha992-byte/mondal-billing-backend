"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const party_controller_1 = require("../controllers/party.controller");
const partyBankAccount_controller_1 = require("../controllers/partyBankAccount.controller");
const partyAddress_controller_1 = require("../controllers/partyAddress.controller");
const router = express_1.default.Router();
// ── Party CRUD ────────────────────────────────────────────────────────────────
router.post("/", party_controller_1.createParty); // POST   /api/parties
router.get("/", party_controller_1.getAllParties); // GET    /api/parties
router.get("/:id", party_controller_1.getPartyById); // GET    /api/parties/:id
router.put("/:id", party_controller_1.updateParty); // PUT    /api/parties/:id
router.delete("/:id", party_controller_1.deleteParty); // DELETE /api/parties/:id
// ── Bank Accounts ─────────────────────────────────────────────────────────────
router.post("/:id/bank-accounts", partyBankAccount_controller_1.addBankAccount); // POST   /api/parties/:id/bank-accounts
router.get("/:id/bank-accounts", partyBankAccount_controller_1.getBankAccounts); // GET    /api/parties/:id/bank-accounts
router.put("/:id/bank-accounts/:accountId", partyBankAccount_controller_1.updateBankAccount); // PUT    /api/parties/:id/bank-accounts/:accountId
router.delete("/:id/bank-accounts/:accountId", partyBankAccount_controller_1.deleteBankAccount); // DELETE /api/parties/:id/bank-accounts/:accountId
// ── Shipping Addresses ────────────────────────────────────────────────────────
router.get("/:id/addresses", partyAddress_controller_1.getPartyAddresses); // GET    /api/parties/:id/addresses
router.post("/:id/addresses", partyAddress_controller_1.createPartyAddress); // POST   /api/parties/:id/addresses
router.put("/:id/addresses/:addrId", partyAddress_controller_1.updatePartyAddress); // PUT    /api/parties/:id/addresses/:addrId
router.delete("/:id/addresses/:addrId", partyAddress_controller_1.deletePartyAddress); // DELETE /api/parties/:id/addresses/:addrId
exports.default = router;

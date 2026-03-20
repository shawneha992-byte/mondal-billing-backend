"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const partyBankAccount_controller_1 = require("../controllers/partyBankAccount.controller");
const partyCustomField_controller_1 = require("../controllers/partyCustomField.controller");
const router = express_1.default.Router();
// ============================================================
// BANK ACCOUNT ROUTES
// Base: /api/parties/:id/bank-accounts
// ============================================================
// Add a bank account to a party
router.post("/parties/:id/bank-accounts", partyBankAccount_controller_1.addBankAccount);
// Get all bank accounts for a party
router.get("/parties/:id/bank-accounts", partyBankAccount_controller_1.getBankAccounts);
// Update a specific bank account
router.put("/parties/:id/bank-accounts/:accountId", partyBankAccount_controller_1.updateBankAccount);
// Delete a specific bank account
router.delete("/parties/:id/bank-accounts/:accountId", partyBankAccount_controller_1.deleteBankAccount);
// ============================================================
// CUSTOM FIELD ROUTES
// Base: /api/parties/:id/custom-fields
// ============================================================
// Add one or multiple custom fields (POST body: object or array)
router.post("/parties/:id/custom-fields", partyCustomField_controller_1.addCustomFields);
// Get all custom fields for a party
router.get("/parties/:id/custom-fields", partyCustomField_controller_1.getCustomFields);
// Bulk replace all custom fields (full overwrite)
router.put("/parties/:id/custom-fields", partyCustomField_controller_1.replaceAllCustomFields);
// Update a specific custom field
router.put("/parties/:id/custom-fields/:fieldId", partyCustomField_controller_1.updateCustomField);
// Delete a specific custom field
router.delete("/parties/:id/custom-fields/:fieldId", partyCustomField_controller_1.deleteCustomField);
exports.default = router;

import express from "express";
import {
  addBankAccount,
  getBankAccounts,
  updateBankAccount,
  deleteBankAccount
} from "../controllers/partyBankAccount.controller";

import {
  addCustomFields,
  getCustomFields,
  updateCustomField,
  deleteCustomField,
  replaceAllCustomFields
} from "../controllers/partyCustomField.controller";

const router = express.Router();


// ============================================================
// BANK ACCOUNT ROUTES
// Base: /api/parties/:id/bank-accounts
// ============================================================

// Add a bank account to a party
router.post("/parties/:id/bank-accounts", addBankAccount);

// Get all bank accounts for a party
router.get("/parties/:id/bank-accounts", getBankAccounts);

// Update a specific bank account
router.put("/parties/:id/bank-accounts/:accountId", updateBankAccount);

// Delete a specific bank account
router.delete("/parties/:id/bank-accounts/:accountId", deleteBankAccount);


// ============================================================
// CUSTOM FIELD ROUTES
// Base: /api/parties/:id/custom-fields
// ============================================================

// Add one or multiple custom fields (POST body: object or array)
router.post("/parties/:id/custom-fields", addCustomFields);

// Get all custom fields for a party
router.get("/parties/:id/custom-fields", getCustomFields);

// Bulk replace all custom fields (full overwrite)
router.put("/parties/:id/custom-fields", replaceAllCustomFields);

// Update a specific custom field
router.put("/parties/:id/custom-fields/:fieldId", updateCustomField);

// Delete a specific custom field
router.delete("/parties/:id/custom-fields/:fieldId", deleteCustomField);


export default router;
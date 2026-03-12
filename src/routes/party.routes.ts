import express from "express";
import {
  createParty,
  updateParty,
  getAllParties,
  getPartyById,
  deleteParty,
} from "../controllers/party.controller";
import {
  addBankAccount,
  getBankAccounts,
  updateBankAccount,
  deleteBankAccount,
} from "../controllers/partyBankAccount.controller";
import {
  getPartyAddresses,
  createPartyAddress,
  updatePartyAddress,
  deletePartyAddress,
} from "../controllers/partyAddress.controller";

const router = express.Router();

// ── Party CRUD ────────────────────────────────────────────────────────────────
router.post(  "/",     createParty);    // POST   /api/parties
router.get(   "/",     getAllParties);  // GET    /api/parties
router.get(   "/:id",  getPartyById);  // GET    /api/parties/:id
router.put(   "/:id",  updateParty);   // PUT    /api/parties/:id
router.delete("/:id",  deleteParty);   // DELETE /api/parties/:id

// ── Bank Accounts ─────────────────────────────────────────────────────────────
router.post(  "/:id/bank-accounts",              addBankAccount);    // POST   /api/parties/:id/bank-accounts
router.get(   "/:id/bank-accounts",              getBankAccounts);   // GET    /api/parties/:id/bank-accounts
router.put(   "/:id/bank-accounts/:accountId",   updateBankAccount); // PUT    /api/parties/:id/bank-accounts/:accountId
router.delete("/:id/bank-accounts/:accountId",   deleteBankAccount); // DELETE /api/parties/:id/bank-accounts/:accountId

// ── Shipping Addresses ────────────────────────────────────────────────────────
router.get(   "/:id/addresses",          getPartyAddresses);   // GET    /api/parties/:id/addresses
router.post(  "/:id/addresses",          createPartyAddress);  // POST   /api/parties/:id/addresses
router.put(   "/:id/addresses/:addrId",  updatePartyAddress);  // PUT    /api/parties/:id/addresses/:addrId
router.delete("/:id/addresses/:addrId",  deletePartyAddress);  // DELETE /api/parties/:id/addresses/:addrId

export default router;
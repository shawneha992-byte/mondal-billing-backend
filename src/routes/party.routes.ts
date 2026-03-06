import express from "express";
import {
  createParty,
  updateParty,
  getAllParties,
  getPartyById
} from "../controllers/party.controller";
import { deleteParty } from "../controllers/party.controller";
const router = express.Router();

/**
 * PARTY ROUTES
 */

// Create Party
router.post("/parties", createParty);

// Get All Parties
router.get("/parties", getAllParties);

// Get Party By ID
router.get("/parties/:id", getPartyById);

// Update Party
router.put("/parties/:id", updateParty);

//Delete party
router.delete("/parties/:id", deleteParty);

export default router;

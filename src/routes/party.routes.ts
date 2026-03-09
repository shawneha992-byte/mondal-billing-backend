import express from "express";
import {
  createParty,
  updateParty,
  getAllParties,
  getPartyById,
  deleteParty
} from "../controllers/party.controller";

const router = express.Router();

// Create Party
router.post("/", createParty);

// Get All Parties
router.get("/", getAllParties);

// Get Party By ID
router.get("/:id", getPartyById);

// Update Party
router.put("/:id", updateParty);

// Delete Party
router.delete("/:id", deleteParty);

export default router;
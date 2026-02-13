import express from "express";
import { getPartyLedger, getPartyBalance } from "../controllers/partyLedger.controller";

const router = express.Router();

router.get("/party/:id/ledger", getPartyLedger);
router.get("/party/:id/balance", getPartyBalance);

export default router;

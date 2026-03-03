import { Router } from "express";
import {
  getPartyTransactions,
  getPartyItemWise,
} from "../controllers/transaction.controller";

const router = Router();

router.get("/party/:id", getPartyTransactions);
router.get("/party/:id/items", getPartyItemWise);

export default router;
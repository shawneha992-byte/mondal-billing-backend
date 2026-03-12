import { Router } from "express";
import {
  getStockLedger,
  getProductStockLedger,
  createStockAdjustment,
  getStockSummary,
} from "../controllers/Stockledger.controller";

const router = Router();

router.get(  "/summary",              getStockSummary);         // GET  /api/stock-ledger/summary
router.get(  "/product/:productId",   getProductStockLedger);   // GET  /api/stock-ledger/product/:id
router.get(  "/",                     getStockLedger);           // GET  /api/stock-ledger
router.post( "/adjustment",           createStockAdjustment);   // POST /api/stock-ledger/adjustment

export default router;
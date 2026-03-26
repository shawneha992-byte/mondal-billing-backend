// routes/deliveryChallanRoutes.ts
import { Router } from "express";
import {
  getChallanSettings,
  saveChallanSettings,
  getNextChallanNumber,
  listChallans,
  getChallanById,
  createChallan,
  updateChallan,
  deleteChallan,
  updateChallanStatus,
  convertToInvoice,
  duplicateChallan,
} from "../controllers/deliverychallan.controller";

const router = Router();


// ── Settings ─────────────────────────────────────────────────────────────────
router.get  ("/settings",     getChallanSettings);
router.put  ("/settings",     saveChallanSettings);
router.get  ("/next-number",  getNextChallanNumber);

// ── CRUD ─────────────────────────────────────────────────────────────────────
router.get  ("/",             listChallans);
router.post ("/",             createChallan);
router.get  ("/:id",          getChallanById);
router.put  ("/:id",          updateChallan);
router.delete("/:id",         deleteChallan);

// ── Actions ──────────────────────────────────────────────────────────────────
router.patch ("/:id/status",              updateChallanStatus);
router.post  ("/:id/convert-to-invoice",  convertToInvoice);
router.post  ("/:id/duplicate",           duplicateChallan);

export default router;

// ─────────────────────────────────────────────────────────────────────────────
// In your app.ts / index.ts, mount this router:
//
//   import deliveryChallanRouter from "./routes/deliveryChallanRoutes";
//   app.use("/api/delivery-challan", deliveryChallanRouter);
// ─────────────────────────────────────────────────────────────────────────────
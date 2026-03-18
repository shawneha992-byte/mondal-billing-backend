import express from "express";
import {
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
  duplicatePurchaseOrder,
  getPurchaseOrderHistory
} from "../controllers/purchaseOrder.controller";

const router = express.Router();

router.post("/", createPurchaseOrder);
router.get("/", getPurchaseOrders);
router.get("/:id", getPurchaseOrderById);
router.put("/:id", updatePurchaseOrder);
router.delete("/:id", deletePurchaseOrder);

router.post("/:id/duplicate", duplicatePurchaseOrder);
router.get("/:id/history", getPurchaseOrderHistory);

export default router;
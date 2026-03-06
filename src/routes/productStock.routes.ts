import { Router } from "express";

import {
  createProductStock,
  getProductStocks,
  getProductStockById,
  updateProductStock,
  deleteProductStock
} from "../controllers/productStock.controller";

const router = Router();

router.post("/", createProductStock);

router.get("/", getProductStocks);

router.get("/:id", getProductStockById);

router.put("/:id", updateProductStock);

router.delete("/:id", deleteProductStock);

export default router;
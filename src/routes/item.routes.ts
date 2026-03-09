import { Router } from "express";
import {
  createItem,
  getItems,
  getItemById,
  updateItem,
  deleteItem,
  getItemsByGodown,
  adjustStock,
} from "../controllers/item.controller";

const router = Router();

router.post("/", createItem);
router.get("/", getItems);
router.get("/godown/:godownId", getItemsByGodown);
router.get("/:id", getItemById);
router.post("/:id/adjust-stock", adjustStock);
router.put("/:id", updateItem);
router.delete("/:id", deleteItem);

export default router;
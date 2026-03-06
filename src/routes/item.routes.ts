import { Router } from "express";
import {
  createItem,
  getItems,
  updateItem,
  deleteItem,
  getItemsByGodown
} from "../controllers/item.controller";

const router = Router();

router.post("/", createItem);

router.get("/", getItems);

router.get("/godown/:godownId", getItemsByGodown);

router.put("/:id", updateItem);

router.delete("/:id", deleteItem);


export default router;
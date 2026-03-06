import { Router } from "express";

import {
  createGodown,
  getGodowns,
  getGodownById,
  updateGodown,
  deleteGodown
} from "../controllers/godown.controller";

const router = Router();

router.post("/create", createGodown);

router.get("/", getGodowns);

router.get("/:id", getGodownById);

router.put("/:id", updateGodown);

router.delete("/:id", deleteGodown);

export default router;
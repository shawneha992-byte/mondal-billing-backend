import { Router } from "express";
import { createSalesReturn, getSalesReturns } 
from "../controllers/salesReturn.controller";

import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/sales-return", authMiddleware, createSalesReturn);
router.get("/sales-return", authMiddleware, getSalesReturns);

export default router;

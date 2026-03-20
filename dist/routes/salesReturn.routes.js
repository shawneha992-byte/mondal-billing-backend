"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const salesReturn_controller_1 = require("../controllers/salesReturn.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post("/sales-return", auth_middleware_1.authMiddleware, salesReturn_controller_1.createSalesReturn);
router.get("/sales-return", auth_middleware_1.authMiddleware, salesReturn_controller_1.getSalesReturns);
exports.default = router;

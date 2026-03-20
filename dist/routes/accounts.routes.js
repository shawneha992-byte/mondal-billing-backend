"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const accounts_controller_1 = require("../controllers/accounts.controller");
const router = (0, express_1.Router)();
router.get("/", accounts_controller_1.getAccounts); // GET    /api/accounts
router.post("/", accounts_controller_1.createAccount); // POST   /api/accounts
router.delete("/:id", accounts_controller_1.deleteAccount); // DELETE /api/accounts/:id
exports.default = router;

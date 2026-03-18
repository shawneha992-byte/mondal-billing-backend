import { Router } from "express";
import { getAccounts, createAccount, deleteAccount } from "../controllers/accounts.controller";

const router = Router();

router.get("/",     getAccounts);     // GET    /api/accounts
router.post("/",    createAccount);   // POST   /api/accounts
router.delete("/:id", deleteAccount); // DELETE /api/accounts/:id

export default router;
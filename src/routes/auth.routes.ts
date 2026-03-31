import { Router } from "express";
import { login, me, forgotPassword, resetPasswordWithOtp } from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/login", login);
router.get("/me", authMiddleware, me);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPasswordWithOtp);

export default router;

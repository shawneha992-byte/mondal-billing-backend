import express from "express"
import { createPaymentIn } from "../controllers/paymentIn.controller"

const router = express.Router()

router.post("/", createPaymentIn)

export default router

import "dotenv/config";
import express from "express";
import cors from "cors";

import routes from "./routes"; // index routes
import partyLedgerRoutes from "./routes/partyLedger.routes";
import partyRoutes from "./routes/party.routes";
import paymentInRoutes from "./routes/paymentIn.routes";
import invoiceRoutes from "./routes/invoice.routes";
import salesRoutes from "./routes/salesReturn.routes";
import transactionRoutes from "./routes/transaction.routes";
import partyExtraRoutes from "./routes/partyExtra.routes";

const app = express();

/**
 * ✅ CORS configuration for Electron desktop app
 * - Electron runs on file:// or localhost
 * - Backend is local-only
 */
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], // ✅ added PATCH for set-primary
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/**
 * ✅ Parse JSON request body
 */
app.use(express.json());

/**
 * ✅ Health check
 * Electron uses this to verify backend is running
 */
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "OK" });
});

/**
 * ✅ Register ALL routes
 */
app.use(routes);                           // from routes/index.ts
app.use("/api", partyLedgerRoutes);        // ✅ fixed: was "api" (missing slash)
app.use("/api", partyRoutes);
app.use("/api/payment-in", paymentInRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/salesReturn", salesRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api", partyExtraRoutes);         // ✅ NEW: /api/parties/:id/bank-accounts & /api/parties/:id/custom-fields

export default app;

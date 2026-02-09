import express from "express";
import cors from "cors";
import routes from "./routes"; // ✅ only this import

const app = express();

/**
 * ✅ CORS configuration for Electron desktop app
 * - Electron runs on file:// or localhost
 * - Backend is local-only
 */
app.use(
  cors({
    origin: "*", // Safe for desktop app
    methods: ["GET", "POST", "PUT", "DELETE"],
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
 * ✅ Register ALL routes from index.ts
 */
app.use(routes);

export default app;

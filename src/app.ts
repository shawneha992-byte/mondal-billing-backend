import "dotenv/config";
import express from "express";
import cors from "cors";

import routes from "./routes";   // only this

const app = express();

/**
 * CORS configuration
 */
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/**
 * Parse JSON
 */
app.use(express.json());

/**
 * Health check
 */
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "OK" });
});

/**
 * Register all routes
 */
app.use("/api", routes);

export default app;
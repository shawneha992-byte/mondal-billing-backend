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
    origin: "*",
    credentials: false,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/**
 * Parse JSON — limit raised to 5 MB to support base64 signature images
 */
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

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
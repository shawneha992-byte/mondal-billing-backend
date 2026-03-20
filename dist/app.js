"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const routes_1 = __importDefault(require("./routes")); // only this
const app = (0, express_1.default)();
/**
 * CORS configuration
 */
app.use((0, cors_1.default)({
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
/**
 * Parse JSON — limit raised to 5 MB to support base64 signature images
 */
app.use(express_1.default.json({ limit: "5mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "5mb" }));
/**
 * Health check
 */
app.get("/health", (_req, res) => {
    res.status(200).json({ status: "OK" });
});
/**
 * Register all routes
 */
app.use("/api", routes_1.default);
exports.default = app;

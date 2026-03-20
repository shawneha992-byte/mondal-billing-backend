"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app_1 = __importDefault(require("./app"));
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const HOST = process.env.HOST || "127.0.0.1";
console.log("DATABASE_URL =", process.env.DATABASE_URL);
const server = app_1.default.listen(PORT, HOST, () => {
    console.log(`✅ Backend running at http://${HOST}:${PORT}`);
});
// Graceful shutdown (optional but professional)
process.on("SIGTERM", () => {
    console.log("🛑 Server shutting down...");
    server.close(() => {
        console.log("✅ Server closed");
        process.exit(0);
    });
});

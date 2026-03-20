process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import dotenv from "dotenv";
dotenv.config();

import app from "./app";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const HOST = process.env.HOST || "127.0.0.1";

console.log("DATABASE_URL =", process.env.DATABASE_URL);

const server = app.listen(PORT, HOST, () => {
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

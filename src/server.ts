process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import dotenv from "dotenv";
dotenv.config();

import app from "./app";

// ✅ Use Render PORT
const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;

// ❌ DO NOT use 127.0.0.1
// ✅ Use 0.0.0.0 for Render
const HOST = "0.0.0.0";

console.log("DATABASE_URL =", process.env.DATABASE_URL);

// ✅ Start server correctly
const server = app.listen(PORT, HOST, () => {
  console.log(`✅ Backend running at http://${HOST}:${PORT}`);
});

// ✅ Graceful shutdown (keep this)
process.on("SIGTERM", () => {
  console.log("🛑 Server shutting down...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
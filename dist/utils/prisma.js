"use strict";
// src/utils/prisma.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single shared PrismaClient instance for the entire app.
// NEVER create `new PrismaClient()` anywhere else — always import this file.
//
// connection_limit=3 keeps us well inside Aiven free-tier's 25-connection cap
// even across multiple nodemon restarts.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
// Append connection_limit to DATABASE_URL so Prisma's pool never exceeds 3.
// Aiven free plan: ~25 total connections. 3 per process leaves plenty of room.
function buildUrl() {
    const base = process.env.DATABASE_URL ?? "";
    if (!base)
        throw new Error("DATABASE_URL is not set");
    if (base.includes("connection_limit="))
        return base; // already set, don't double-add
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}connection_limit=3&pool_timeout=10`;
}
const prisma = new client_1.PrismaClient({
    datasources: {
        db: { url: buildUrl() },
    },
    log: ["error", "warn"],
});
// Graceful shutdown — frees all DB connections immediately when nodemon restarts
async function disconnect() {
    await prisma.$disconnect();
}
process.on("SIGINT", disconnect);
process.on("SIGTERM", disconnect);
process.on("exit", () => { prisma.$disconnect(); });
exports.default = prisma;

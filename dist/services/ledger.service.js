"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLastPartyBalance = getLastPartyBalance;
exports.getLastPartyBalanceTx = getLastPartyBalanceTx;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function getLastPartyBalance(partyId) {
    const lastEntry = await prisma.partyLedger.findFirst({
        where: { partyId },
        orderBy: { id: "desc" },
    });
    return lastEntry ? Number(lastEntry.balance) : 0;
}
async function getLastPartyBalanceTx(tx, partyId) {
    const lastEntry = await tx.partyLedger.findFirst({
        where: { partyId },
        orderBy: { id: "desc" },
    });
    return lastEntry ? Number(lastEntry.balance) : 0;
}

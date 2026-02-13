import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

export async function getLastPartyBalance(partyId: number) {
  const lastEntry = await prisma.partyLedger.findFirst({
    where: { partyId },
    orderBy: { id: "desc" },
  })

  return lastEntry ? Number(lastEntry.balance) : 0
}
export async function getLastPartyBalanceTx(
  tx: any,
  partyId: number
) {
  const lastEntry = await tx.partyLedger.findFirst({
    where: { partyId },
    orderBy: { id: "desc" },
  })

  return lastEntry ? Number(lastEntry.balance) : 0
}



import { PrismaClient, LedgerRefType, LedgerType } from "@prisma/client";
import { Request, Response } from "express";
import { generatePaymentNo } from "../utils/generateNumber";
import { getLastPartyBalanceTx } from "../services/ledger.service";

const prisma = new PrismaClient();

export const createPaymentIn = async (req: Request, res: Response) => {
  const { partyId, date, mode, amount, notes, allocations = [] } = req.body;

  if (!partyId || !amount || amount <= 0) {
    return res.status(400).json({ message: "Invalid payment data" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {

      const lastPayment = await tx.paymentIn.findFirst({
        orderBy: { id: "desc" },
      });

      const paymentNo = generatePaymentNo(lastPayment?.paymentNo);

      const lastBalance = await getLastPartyBalanceTx(tx, partyId);
      const newBalance = lastBalance - amount;

      const payment = await tx.paymentIn.create({
        data: {
          paymentNo,
          partyId,
          date: new Date(date),
          mode,
          amount,
          notes,
        },
      });

      // ✅ Party Ledger entry (schema aligned)
      await tx.partyLedger.create({
        data: {
          partyId,

          refType: LedgerRefType.Payment,
          refId: payment.id,

          type: LedgerType.CREDIT,   // ✅ REQUIRED
          debit: null,
          credit: amount,

          balance: newBalance,       // ✅ REQUIRED
        },
      });

      // Invoice allocation (optional – MVP safe)
      let allocatedTotal = 0;

      for (const alloc of allocations) {
        allocatedTotal += alloc.amount;

        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: alloc.invoiceId,
            amount: alloc.amount,
          },
        });
      }

      if (allocatedTotal > amount) {
        throw new Error("Allocated amount exceeds payment amount");
      }

      return payment;
    });

    res.status(201).json({
      message: "Payment received",
      data: result,
    });

  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

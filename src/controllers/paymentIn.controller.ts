import { PrismaClient, LedgerRefType, LedgerType, PaymentMode, InvoiceStatus } from "@prisma/client";
import { Request, Response } from "express";
import { generatePaymentNo } from "../utils/generateNumber";
import { getLastPartyBalanceTx } from "../services/ledger.service";

const prisma = new PrismaClient();

// ─── Map frontend mode string → Prisma PaymentMode enum ──────────────────────
function toPaymentMode(mode: string): PaymentMode {
  const map: Record<string, PaymentMode> = {
    Cash: PaymentMode.Cash,
    UPI: PaymentMode.UPI,
    Card: PaymentMode.Card,
    Netbanking: PaymentMode.Bank,
    "Bank Transfer": PaymentMode.Bank,
    Cheque: PaymentMode.Bank,
  };
  return map[mode] ?? PaymentMode.Cash;
}

// ─── Helper: recalculate invoice status after payment change ─────────────────
function calcStatus(outstanding: number, total: number): InvoiceStatus {
  if (outstanding <= 0) return InvoiceStatus.PAID;
  if (outstanding < total) return InvoiceStatus.PARTIAL;
  return InvoiceStatus.OPEN;
}

// ────────────────────────────────────────────────────────────────────────────
//  GET /api/payments-in              — paginated list
// ────────────────────────────────────────────────────────────────────────────
export const getPaymentsIn = async (req: Request, res: Response) => {
  const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
  const limit = Math.min(200, parseInt(req.query.limit as string) || 50);
  const skip  = (page - 1) * limit;

  const search    = (req.query.search   as string) || "";
  const dateFrom  = req.query.dateFrom  as string | undefined;
  const dateTo    = req.query.dateTo    as string | undefined;
  const partyIdQ  = req.query.partyId   as string | undefined;   // ← NEW: filter by party

  const where: any = {};
  if (partyIdQ) {
    where.partyId = Number(partyIdQ);
  }
  if (search) {
    where.OR = [
      { paymentNo:  { contains: search, mode: "insensitive" } },
      { party: { partyName: { contains: search, mode: "insensitive" } } },
    ];
  }
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = new Date(dateFrom);
    if (dateTo)   where.date.lte = new Date(`${dateTo}T23:59:59`);
  }

  try {
    const [total, payments] = await Promise.all([
      prisma.paymentIn.count({ where }),
      prisma.paymentIn.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: "desc" },
        include: {
          party: { select: { id: true, partyName: true } },
          allocations: {
            include: {
              invoice: {
                select: {
                  id: true, invoiceNo: true, invoiceDate: true, dueDate: true,
                  totalAmount: true, outstandingAmount: true,
                },
              },
            },
          },
        },
      }),
    ]);

    res.json({
      payments: payments.map(p => ({
        id:                 p.id,
        paymentNo:          p.paymentNo,
        partyId:            p.partyId,
        partyName:          p.party.partyName,
        date:               p.date.toISOString().split("T")[0],
        mode:               p.mode,
        amount:             Number(p.amount),
        notes:              p.notes ?? "",
        totalAmountSettled: p.allocations.reduce((s, a) => s + Number(a.amount), 0),
        allocations: p.allocations.map(a => ({
          invoiceId:      a.invoiceId,
          invoiceNo:      a.invoice.invoiceNo,
          invoiceDate:    a.invoice.invoiceDate?.toISOString().split("T")[0] ?? "",
          dueDate:        a.invoice.dueDate?.toISOString().split("T")[0]    ?? "",
          totalAmount:    Number(a.invoice.totalAmount),
          amountReceived: Number(a.amount),
          balanceAmount:  Number(a.invoice.outstandingAmount),
          tds:            0,
          discount:       0,
        })),
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
//  GET /api/payments-in/:id          — single payment
// ────────────────────────────────────────────────────────────────────────────
export const getPaymentInById = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  try {
    const p = await prisma.paymentIn.findUnique({
      where: { id },
      include: {
        party: { select: { id: true, partyName: true } },
        allocations: {
          include: {
            invoice: {
              select: {
                id: true, invoiceNo: true, invoiceDate: true, dueDate: true,
                totalAmount: true, outstandingAmount: true,
              },
            },
          },
        },
      },
    });
    if (!p) return res.status(404).json({ message: "Payment not found" });

    res.json({
      id:                 p.id,
      paymentNo:          p.paymentNo,
      partyId:            p.partyId,
      partyName:          p.party.partyName,
      date:               p.date.toISOString().split("T")[0],
      mode:               p.mode,
      amount:             Number(p.amount),
      notes:              p.notes ?? "",
      totalAmountSettled: p.allocations.reduce((s, a) => s + Number(a.amount), 0),
      allocations: p.allocations.map(a => ({
        invoiceId:      a.invoiceId,
        invoiceNo:      a.invoice.invoiceNo,
        invoiceDate:    a.invoice.invoiceDate?.toISOString().split("T")[0] ?? "",
        dueDate:        a.invoice.dueDate?.toISOString().split("T")[0]    ?? "",
        totalAmount:    Number(a.invoice.totalAmount),
        amountReceived: Number(a.amount),
        balanceAmount:  Number(a.invoice.outstandingAmount),
        tds:            0,
        discount:       0,
      })),
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
//  GET /api/payments-in/settings     — next payment number
// ────────────────────────────────────────────────────────────────────────────
export const getPaymentInSettings = async (_req: Request, res: Response) => {
  try {
    const last = await prisma.paymentIn.findFirst({ orderBy: { id: "desc" } });
    const nextNo = generatePaymentNo(last?.paymentNo);
    res.json({ nextPaymentNo: nextNo });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
//  POST /api/payments-in             — create
// ────────────────────────────────────────────────────────────────────────────
export const createPaymentIn = async (req: Request, res: Response) => {
  const { partyId, date, mode, amount, notes, allocations = [] } = req.body;

  if (!partyId || !amount || amount <= 0) {
    return res.status(400).json({ message: "partyId and a positive amount are required" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Generate payment number
      const lastPayment = await tx.paymentIn.findFirst({ orderBy: { id: "desc" } });
      const paymentNo   = generatePaymentNo(lastPayment?.paymentNo);

      // 2. Create payment record
      const payment = await tx.paymentIn.create({
        data: {
          paymentNo,
          partyId,
          date:  new Date(date),
          mode:  toPaymentMode(mode),
          amount,
          notes: notes || null,
        },
      });

      // 3. Ledger entry
      const lastBalance = await getLastPartyBalanceTx(tx, partyId);
      const newBalance  = lastBalance - amount;
      await tx.partyLedger.create({
        data: {
          partyId,
          refType: LedgerRefType.Payment,
          refId:   payment.id,
          type:    LedgerType.CREDIT,
          debit:   null,
          credit:  amount,
          balance: newBalance,
        },
      });

      // 4. Invoice allocations + update outstanding / status
      let allocatedTotal = 0;
      for (const alloc of allocations) {
        if (!alloc.invoiceId || alloc.amount <= 0) continue;
        allocatedTotal += Number(alloc.amount);

        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: alloc.invoiceId,
            amount:    alloc.amount,
          },
        });

        // Reduce invoice outstanding
        const inv = await tx.invoice.findUnique({ where: { id: alloc.invoiceId } });
        if (inv) {
          const newOutstanding = Math.max(0, Number(inv.outstandingAmount) - Number(alloc.amount));
          const newReceived    = Number(inv.receivedAmount ?? 0) + Number(alloc.amount);
          await tx.invoice.update({
            where: { id: alloc.invoiceId },
            data: {
              receivedAmount:    newReceived,
              outstandingAmount: newOutstanding,
              status:            calcStatus(newOutstanding, Number(inv.totalAmount)),
            },
          });
        }
      }

      if (allocatedTotal > Number(amount) + 0.01) {
        throw new Error("Allocated amount exceeds payment amount");
      }

      return payment;
    });

    res.status(201).json({ message: "Payment recorded", data: { id: result.id, paymentNo: result.paymentNo } });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
//  PUT /api/payments-in/:id          — update
// ────────────────────────────────────────────────────────────────────────────
export const updatePaymentIn = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { date, mode, amount, notes, allocations = [] } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ message: "A positive amount is required" });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.paymentIn.findUnique({
        where: { id },
        include: { allocations: true },
      });
      if (!existing) throw new Error("Payment not found");

      const oldAmount = Number(existing.amount);

      // 1. Revert old allocations on invoices
      for (const old of existing.allocations) {
        const inv = await tx.invoice.findUnique({ where: { id: old.invoiceId } });
        if (inv) {
          const restoredOutstanding = Math.min(
            Number(inv.totalAmount),
            Number(inv.outstandingAmount) + Number(old.amount)
          );
          const restoredReceived = Math.max(0, Number(inv.receivedAmount ?? 0) - Number(old.amount));
          await tx.invoice.update({
            where: { id: old.invoiceId },
            data: {
              receivedAmount:    restoredReceived,
              outstandingAmount: restoredOutstanding,
              status:            calcStatus(restoredOutstanding, Number(inv.totalAmount)),
            },
          });
        }
      }

      // 2. Delete old allocations
      await tx.paymentAllocation.deleteMany({ where: { paymentId: id } });

      // 3. Revert old ledger entry
      await tx.partyLedger.deleteMany({
        where: { refType: LedgerRefType.Payment, refId: id },
      });

      // 4. Update payment record
      await tx.paymentIn.update({
        where: { id },
        data: {
          date:  new Date(date),
          mode:  toPaymentMode(mode),
          amount,
          notes: notes || null,
        },
      });

      // 5. New ledger entry
      const lastBalance = await getLastPartyBalanceTx(tx, existing.partyId);
      const newBalance  = lastBalance - amount;
      await tx.partyLedger.create({
        data: {
          partyId: existing.partyId,
          refType: LedgerRefType.Payment,
          refId:   id,
          type:    LedgerType.CREDIT,
          debit:   null,
          credit:  amount,
          balance: newBalance,
        },
      });

      // 6. New allocations
      let allocatedTotal = 0;
      for (const alloc of allocations) {
        if (!alloc.invoiceId || alloc.amount <= 0) continue;
        allocatedTotal += Number(alloc.amount);

        await tx.paymentAllocation.create({
          data: { paymentId: id, invoiceId: alloc.invoiceId, amount: alloc.amount },
        });

        const inv = await tx.invoice.findUnique({ where: { id: alloc.invoiceId } });
        if (inv) {
          const newOutstanding = Math.max(0, Number(inv.outstandingAmount) - Number(alloc.amount));
          const newReceived    = Number(inv.receivedAmount ?? 0) + Number(alloc.amount);
          await tx.invoice.update({
            where: { id: alloc.invoiceId },
            data: {
              receivedAmount:    newReceived,
              outstandingAmount: newOutstanding,
              status:            calcStatus(newOutstanding, Number(inv.totalAmount)),
            },
          });
        }
      }

      if (allocatedTotal > Number(amount) + 0.01) {
        throw new Error("Allocated amount exceeds payment amount");
      }
    });

    res.json({ message: "Payment updated" });
  } catch (error: any) {
    console.error(error);
    res.status(error.message === "Payment not found" ? 404 : 500).json({ message: error.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
//  DELETE /api/payments-in/:id       — delete
// ────────────────────────────────────────────────────────────────────────────
export const deletePaymentIn = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.paymentIn.findUnique({
        where: { id },
        include: { allocations: true },
      });
      if (!existing) throw new Error("Payment not found");

      // Revert invoice outstanding amounts
      for (const alloc of existing.allocations) {
        const inv = await tx.invoice.findUnique({ where: { id: alloc.invoiceId } });
        if (inv) {
          const restoredOutstanding = Math.min(
            Number(inv.totalAmount),
            Number(inv.outstandingAmount) + Number(alloc.amount)
          );
          const restoredReceived = Math.max(0, Number(inv.receivedAmount ?? 0) - Number(alloc.amount));
          await tx.invoice.update({
            where: { id: alloc.invoiceId },
            data: {
              receivedAmount:    restoredReceived,
              outstandingAmount: restoredOutstanding,
              status:            calcStatus(restoredOutstanding, Number(inv.totalAmount)),
            },
          });
        }
      }

      // Delete allocations, ledger entries, then payment
      await tx.paymentAllocation.deleteMany({ where: { paymentId: id } });
      await tx.partyLedger.deleteMany({ where: { refType: LedgerRefType.Payment, refId: id } });
      await tx.paymentIn.delete({ where: { id } });
    });

    res.json({ message: "Payment deleted" });
  } catch (error: any) {
    console.error(error);
    res.status(error.message === "Payment not found" ? 404 : 500).json({ message: error.message });
  }
};
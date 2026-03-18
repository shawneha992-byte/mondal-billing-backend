import { PrismaClient, LedgerRefType, LedgerType, PaymentMode, InvoiceStatus } from "@prisma/client";
import { Request, Response } from "express";
import { generatePaymentNo } from "../utils/generateNumber";
import { getLastPartyBalanceTx } from "../services/ledger.service";

const prisma = new PrismaClient();

// ─── Map frontend mode string → Prisma PaymentMode enum ──────────────────────
function toPaymentMode(mode: string): PaymentMode {
  const normalized = mode.trim().toLowerCase();

  const map: Record<string, PaymentMode> = {
    cash: PaymentMode.CASH,
    upi: PaymentMode.UPI,
    card: PaymentMode.CARD,
    netbanking: PaymentMode.NETBANKING,
    "bank transfer": PaymentMode.BANK_TRANSFER,
    cheque: PaymentMode.CHEQUE,
  };

  return map[normalized] ?? PaymentMode.CASH;
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

  const search   = (req.query.search   as string) || "";
  const dateFrom = req.query.dateFrom  as string | undefined;
  const dateTo   = req.query.dateTo    as string | undefined;
  const partyIdQ = req.query.partyId   as string | undefined;

  const where: any = {};
  if (partyIdQ) where.partyId = Number(partyIdQ);
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
      payments: payments.map((p) => ({
        id:                 p.id,
        paymentNo:          p.paymentNo,
        partyId:            p.partyId,
        partyName:          p.party.partyName,
        date:               p.date.toISOString().split("T")[0],
        mode:               p.mode,
        amount:             Number(p.amount),
        notes:              p.notes ?? "",
        totalAmountSettled: p.allocations.reduce((s, a) => s + Number(a.amount), 0),
        allocations: p.allocations.map((a) => ({
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
      allocations: p.allocations.map((a) => ({
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
    const last   = await prisma.paymentIn.findFirst({ orderBy: { id: "desc" } });
    const nextNo = generatePaymentNo(last?.paymentNo);
    res.json({ nextPaymentNo: nextNo });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
//  POST /api/payments-in             — create
//  FIX: timeout: 15000, parallel invoice updates via Promise.all
// ────────────────────────────────────────────────────────────────────────────
export const createPaymentIn = async (req: Request, res: Response) => {
  const { partyId, date, mode, amount, notes, allocations = [] } = req.body;

  if (!partyId || !amount || amount <= 0) {
    return res.status(400).json({ message: "partyId and a positive amount are required" });
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
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

        // 4. Validate allocation total
        const allocatedTotal = allocations.reduce(
          (s: number, a: any) => s + (a.amount > 0 ? Number(a.amount) : 0),
          0
        );
        if (allocatedTotal > Number(amount) + 0.01) {
          throw new Error("Allocated amount exceeds payment amount");
        }

        // 5. Process allocations — create records first (bulk)
        const validAllocs = allocations.filter((a: any) => a.invoiceId && a.amount > 0);
        if (validAllocs.length > 0) {
          await tx.paymentAllocation.createMany({
            data: validAllocs.map((a: any) => ({
              paymentId: payment.id,
              invoiceId: a.invoiceId,
              amount:    a.amount,
            })),
          });

          // Fetch all affected invoices in ONE query
          const invoiceIds    = validAllocs.map((a: any) => a.invoiceId);
          const affectedInvs  = await tx.invoice.findMany({ where: { id: { in: invoiceIds } } });
          const invMap        = new Map(affectedInvs.map((inv) => [inv.id, inv]));

          // Update invoices in PARALLEL
          await Promise.all(
            validAllocs.map((alloc: any) => {
              const inv = invMap.get(alloc.invoiceId);
              if (!inv) return Promise.resolve();
              const newOutstanding = Math.max(0, Number(inv.outstandingAmount) - Number(alloc.amount));
              const newReceived    = Number(inv.receivedAmount ?? 0) + Number(alloc.amount);
              return tx.invoice.update({
                where: { id: alloc.invoiceId },
                data: {
                  receivedAmount:    newReceived,
                  outstandingAmount: newOutstanding,
                  status:            calcStatus(newOutstanding, Number(inv.totalAmount)),
                },
              });
            })
          );
        }

        return payment;
      },
      { timeout: 15000 }
    );

    res.status(201).json({
      message: "Payment recorded",
      data: { id: result.id, paymentNo: result.paymentNo },
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
//  PUT /api/payments-in/:id          — update
//  FIX: timeout: 15000, parallel invoice revert + update
// ────────────────────────────────────────────────────────────────────────────
export const updatePaymentIn = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { date, mode, amount, notes, allocations = [] } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ message: "A positive amount is required" });
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const existing = await tx.paymentIn.findUnique({
          where:   { id },
          include: { allocations: true },
        });
        if (!existing) throw new Error("Payment not found");

        // 1. Fetch all old-allocation invoices in ONE query
        const oldInvoiceIds   = existing.allocations.map((a) => a.invoiceId);
        const oldInvoices     = oldInvoiceIds.length > 0
          ? await tx.invoice.findMany({ where: { id: { in: oldInvoiceIds } } })
          : [];
        const oldInvMap = new Map(oldInvoices.map((inv) => [inv.id, inv]));

        // 2. Revert old allocations in PARALLEL
        await Promise.all(
          existing.allocations.map((old) => {
            const inv = oldInvMap.get(old.invoiceId);
            if (!inv) return Promise.resolve();
            const restoredOutstanding = Math.min(
              Number(inv.totalAmount),
              Number(inv.outstandingAmount) + Number(old.amount)
            );
            const restoredReceived = Math.max(0, Number(inv.receivedAmount ?? 0) - Number(old.amount));
            return tx.invoice.update({
              where: { id: old.invoiceId },
              data: {
                receivedAmount:    restoredReceived,
                outstandingAmount: restoredOutstanding,
                status:            calcStatus(restoredOutstanding, Number(inv.totalAmount)),
              },
            });
          })
        );

        // 3. Delete old allocations + old ledger in PARALLEL
        await Promise.all([
          tx.paymentAllocation.deleteMany({ where: { paymentId: id } }),
          tx.partyLedger.deleteMany({ where: { refType: LedgerRefType.Payment, refId: id } }),
        ]);

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
        const validAllocs    = allocations.filter((a: any) => a.invoiceId && a.amount > 0);
        const allocatedTotal = validAllocs.reduce((s: number, a: any) => s + Number(a.amount), 0);
        if (allocatedTotal > Number(amount) + 0.01) {
          throw new Error("Allocated amount exceeds payment amount");
        }

        if (validAllocs.length > 0) {
          await tx.paymentAllocation.createMany({
            data: validAllocs.map((a: any) => ({
              paymentId: id, invoiceId: a.invoiceId, amount: a.amount,
            })),
          });

          const newInvoiceIds = validAllocs.map((a: any) => a.invoiceId);
          const newInvoices   = await tx.invoice.findMany({ where: { id: { in: newInvoiceIds } } });
          const newInvMap     = new Map(newInvoices.map((inv) => [inv.id, inv]));

          await Promise.all(
            validAllocs.map((alloc: any) => {
              const inv = newInvMap.get(alloc.invoiceId);
              if (!inv) return Promise.resolve();
              const newOutstanding = Math.max(0, Number(inv.outstandingAmount) - Number(alloc.amount));
              const newReceived    = Number(inv.receivedAmount ?? 0) + Number(alloc.amount);
              return tx.invoice.update({
                where: { id: alloc.invoiceId },
                data: {
                  receivedAmount:    newReceived,
                  outstandingAmount: newOutstanding,
                  status:            calcStatus(newOutstanding, Number(inv.totalAmount)),
                },
              });
            })
          );
        }
      },
      { timeout: 15000 }
    );

    res.json({ message: "Payment updated" });
  } catch (error: any) {
    console.error(error);
    res.status(error.message === "Payment not found" ? 404 : 500).json({ message: error.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
//  DELETE /api/payments-in/:id       — delete
//  FIX: timeout: 15000, parallel invoice restore
// ────────────────────────────────────────────────────────────────────────────
export const deletePaymentIn = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.$transaction(
      async (tx) => {
        const existing = await tx.paymentIn.findUnique({
          where:   { id },
          include: { allocations: true },
        });
        if (!existing) throw new Error("Payment not found");

        // Fetch invoices in ONE query
        const invoiceIds = existing.allocations.map((a) => a.invoiceId);
        const invoices   = invoiceIds.length > 0
          ? await tx.invoice.findMany({ where: { id: { in: invoiceIds } } })
          : [];
        const invMap = new Map(invoices.map((inv) => [inv.id, inv]));

        // Restore invoice outstanding amounts in PARALLEL
        await Promise.all(
          existing.allocations.map((alloc) => {
            const inv = invMap.get(alloc.invoiceId);
            if (!inv) return Promise.resolve();
            const restoredOutstanding = Math.min(
              Number(inv.totalAmount),
              Number(inv.outstandingAmount) + Number(alloc.amount)
            );
            const restoredReceived = Math.max(0, Number(inv.receivedAmount ?? 0) - Number(alloc.amount));
            return tx.invoice.update({
              where: { id: alloc.invoiceId },
              data: {
                receivedAmount:    restoredReceived,
                outstandingAmount: restoredOutstanding,
                status:            calcStatus(restoredOutstanding, Number(inv.totalAmount)),
              },
            });
          })
        );

        // Delete allocations, ledger, payment in PARALLEL where possible
        await Promise.all([
          tx.paymentAllocation.deleteMany({ where: { paymentId: id } }),
          tx.partyLedger.deleteMany({ where: { refType: LedgerRefType.Payment, refId: id } }),
        ]);

        await tx.paymentIn.delete({ where: { id } });
      },
      { timeout: 15000 }
    );

    res.json({ message: "Payment deleted" });
  } catch (error: any) {
    console.error(error);
    res.status(error.message === "Payment not found" ? 404 : 500).json({ message: error.message });
  }
};
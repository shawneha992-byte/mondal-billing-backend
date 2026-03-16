import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { InvoiceStatus, LedgerRefType, LedgerType } from "@prisma/client";
import { getLastPartyBalanceTx } from "../services/ledger.service";


/* ═══════════════════════════════════════════════════════════
   HELPER
═══════════════════════════════════════════════════════════ */
const deriveStatus = (received: number, total: number): InvoiceStatus => {
  if (received <= 0)     return InvoiceStatus.OPEN;
  if (received >= total) return InvoiceStatus.PAID;
  return InvoiceStatus.PARTIAL;
};

/* ═══════════════════════════════════════════════════════════
   CREATE INVOICE
   POST /api/invoices
═══════════════════════════════════════════════════════════ */
export const createInvoice = async (req: Request, res: Response) => {
  const {
    partyId,
    branchCode,
    invoiceDate,
    dueDate,
    items              = [],
    additionalCharges  = [],   // [{ name, amount }]
    discountAmount     = 0,
    roundOff           = 0,
    paymentMode,
    receivedAmount     = 0,
    notes,
    termsConditions,
    ewayBillNo,
    challanNo,
    financedBy,
    salesman,
    emailId,
    warrantyPeriod,
    applyTcs           = false,
    autoRoundOff       = false,
    signatureUrl,
    showEmptySignatureBox = false,
  } = req.body;

  if (!partyId || !items || items.length === 0) {
    return res.status(400).json({ success: false, message: "partyId and items are required" });
  }

  try {
    const invoice = await prisma.$transaction(async (tx) => {

      // ── 1. Validate products & accumulate totals ──────────
      let subTotal  = 0;
      let taxAmount = 0;

      for (const item of items) {
     const product = await tx.product.findUnique({
  where: { id: item.productId }
});

if (!product) {
  throw new Error(`Product not found (ID: ${item.productId})`);
}

if (product.itemType === "Product") {
  const stock = item.godownId
    ? await tx.productStock.findUnique({
        where: {
          productId_godownId: {
            productId: item.productId,
            godownId: item.godownId
          }
        }
      })
    : await tx.productStock.findFirst({
        where: { productId: item.productId }
      });

  const availableStock = stock?.currentStock ?? stock?.openingStock ?? 0;

if (!stock || availableStock < item.quantity) {
  throw new Error(`Insufficient stock for "${product.name}"`);
}
}

      // ── 2. Totals ─────────────────────────────────────────
      const additionalChargesTotal: number = additionalCharges.reduce(
        (sum: number, c: { name: string; amount: number }) => sum + (c.amount ?? 0),
        0
      );
      const taxableAmount     = subTotal - discountAmount;
      const totalAmount       = taxableAmount + taxAmount + additionalChargesTotal + roundOff;
      const outstandingAmount = totalAmount - receivedAmount;

      // ── 3. Invoice number — reads InvoiceSettings for prefix/sequence ──
      // Load settings (outside tx to avoid nested read issues)
      const invoiceSettings = await prisma.invoiceSettings.findFirst({
        orderBy: { id: "asc" },
      });

      const usePrefix  = invoiceSettings?.enablePrefix  ?? false;
      const prefix     = usePrefix && invoiceSettings?.prefix?.trim()
                           ? invoiceSettings.prefix.trim()
                           : "INV-";
      const seqFromSettings = invoiceSettings?.sequenceNumber ?? 1;

      // Also check existing invoices with this prefix to avoid duplicates
      // (handles case where DB was seeded with old numbers)
      const allNos = await tx.invoice.findMany({ select: { invoiceNo: true } });
      let maxExistingSeq = 0;
      for (const inv of allNos) {
        if (inv.invoiceNo?.startsWith(prefix)) {
          const m = inv.invoiceNo.slice(prefix.length).match(/^(\d+)$/);
          if (m) maxExistingSeq = Math.max(maxExistingSeq, parseInt(m[1], 10));
        }
      }

      // Use whichever is higher: the saved sequence or the max existing
      let nextSeq = Math.max(seqFromSettings, maxExistingSeq + 1);

      // Safety loop — skip any that somehow still exist
      let invoiceNo = `${prefix}${String(nextSeq).padStart(5, "0")}`;
      while (await tx.invoice.findUnique({ where: { invoiceNo } })) {
        nextSeq++;
        invoiceNo = `${prefix}${String(nextSeq).padStart(5, "0")}`;
      }

      // ── 4. Persist invoice ────────────────────────────────
      // `as any` because the generated Prisma client may be behind the schema.
      // Fix: run `npx prisma db push && npx prisma generate`
      const created = await (tx.invoice.create as any)({
        data: {
          invoiceNo,
          partyId,                                            // scalar FK
          branchCode:  branchCode ?? null,                   // scalar FK
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          dueDate:     dueDate    ? new Date(dueDate)     : null,

          ewayBillNo:     ewayBillNo     ?? null,
          challanNo:      challanNo      ?? null,
          financedBy:     financedBy     ?? null,
          salesman:       salesman       ?? null,
          emailId:        emailId        ?? null,
          warrantyPeriod: warrantyPeriod ?? null,
          notes:          notes          ?? null,
          termsConditions: termsConditions ?? null,

          subTotal,
          taxableAmount,
          discountAmount,
          additionalChargesTotal,
          taxAmount,
          roundOff,
          totalAmount,
          receivedAmount,
          outstandingAmount,
          paymentMode: paymentMode ?? null,
          applyTcs,
          autoRoundOff,
          signatureUrl:          signatureUrl          ?? null,
          showEmptySignatureBox: showEmptySignatureBox ?? false,
          status: deriveStatus(receivedAmount, totalAmount),

          items: {
            create: items.map((item: any) => ({
              productId: item.productId,
              quantity:  item.quantity,
              price:     item.price,
              discount:  item.discount  ?? 0,
              taxRate:   item.taxRate   ?? 0,
              taxAmount: (item.price * item.quantity * (item.taxRate || 0)) / 100,
              total:     item.price * item.quantity,
            })),
          },

          ...(additionalCharges.length > 0 && {
            additionalCharges: {
              create: additionalCharges.map((c: { name: string; amount: number }) => ({
                name:   c.name,
                amount: c.amount,
              })),
            },
          }),
        },
      });

    // ── 5. Reduce stock ───────────────────────────────────
for (const item of items) {
  const product = await tx.product.findUnique({
    where: { id: item.productId }
  });

  if (product?.itemType !== "Product") continue;

  const stock = item.godownId
    ? await tx.productStock.findUnique({
        where: {
          productId_godownId: {
            productId: item.productId,
            godownId: item.godownId
          }
        }
      })
    : await tx.productStock.findFirst({
        where: { productId: item.productId }
      });

  if (!stock) continue;

  const currentBalance = stock.currentStock ?? stock.openingStock ?? 0;
  const newBalance = Math.max(0, currentBalance - Number(item.quantity));

  await tx.productStock.update({
    where: { id: stock.id },
    data: {
      currentStock: newBalance
    }
  });
}
      // ── 6. Ledger DEBIT — full invoice amount ─────────────
      const balanceAfterDebit = (await getLastPartyBalanceTx(tx, partyId)) + totalAmount;

      await tx.partyLedger.create({
        data: {
          partyId,
          refType:   LedgerRefType.Invoice,
          refId:     created.id,
          reference: created.invoiceNo,
          type:      LedgerType.DEBIT,
          debit:     totalAmount,
          credit:    null,
          balance:   balanceAfterDebit,
        },
      });

      // ── 7. If upfront payment — CREDIT immediately ────────
      if (receivedAmount > 0) {
        await tx.partyLedger.create({
          data: {
            partyId,
            refType:   LedgerRefType.Payment,
            refId:     created.id,
            reference: created.invoiceNo,
            type:      LedgerType.CREDIT,
            debit:     null,
            credit:    receivedAmount,
            balance:   balanceAfterDebit - receivedAmount,
          },
        });
      }

      // ── 8. Increment sequenceNumber in InvoiceSettings for next invoice ──
      if (invoiceSettings?.id) {
        await prisma.invoiceSettings.update({
          where: { id: invoiceSettings.id },
          data:  { sequenceNumber: nextSeq + 1 },
        });
      }

      return created;
   } });


    return res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      data: invoice,
    });
  } catch (error: any) {
    console.error("❌ Create Invoice Error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   GET ALL INVOICES
   GET /api/invoices
═══════════════════════════════════════════════════════════ */
export const getInvoices = async (req: Request, res: Response) => {
  try {
    const { partyId, status, limit, page } = req.query;

    // Build where clause from query params
    const where: any = {};

    if (partyId) {
      where.partyId = Number(partyId);
    }

    if (status) {
      // Support single status ("OPEN") or comma-separated ("OPEN,PARTIAL")
      const statuses = String(status).split(",").map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        where.status = statuses[0];
      } else if (statuses.length > 1) {
        where.status = { in: statuses };
      }
    }

    const take = limit ? Math.min(500, Number(limit)) : undefined;
    const skip = page && take ? (Number(page) - 1) * take : undefined;

    const invoices = await (prisma.invoice.findMany as any)({
      where,
      include: {
        party:             true,
        items:             { include: { product: true } },
        additionalCharges: true,
        allocations:       true,
        salesReturns:      true,
      },
      orderBy: { createdAt: "desc" },
      ...(take ? { take } : {}),
      ...(skip ? { skip } : {}),
    });

    return res.json({ success: true, data: invoices });
  } catch (error) {
    console.error("❌ Fetch Invoices Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch invoices" });
  }
};

/* ═══════════════════════════════════════════════════════════
   GET SINGLE INVOICE
   GET /api/invoices/:id
═══════════════════════════════════════════════════════════ */
export const getInvoiceById = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid invoice ID" });

  try {
    const invoice = await (prisma.invoice.findUnique as any)({
      where: { id },
      include: {
        party:             true,
        items:             { include: { product: true } },
        additionalCharges: true,
        allocations:       true,
        salesReturns:      true,
      },
    });

    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    return res.json({ success: true, data: invoice });
  } catch (error) {
    console.error("❌ Fetch Invoice Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch invoice" });
  }
};

/* ═══════════════════════════════════════════════════════════
   UPDATE INVOICE  (non-financial meta fields only)
   PUT /api/invoices/:id
═══════════════════════════════════════════════════════════ */
export const updateInvoice = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid invoice ID" });

  const {
    dueDate, ewayBillNo, challanNo, financedBy,
    salesman, emailId, warrantyPeriod,
    notes, termsConditions,
    signatureUrl, showEmptySignatureBox,
  } = req.body;

  try {
    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: "Invoice not found" });
    if (existing.status === InvoiceStatus.CANCELLED) {
      return res.status(400).json({ success: false, message: "Cannot update a cancelled invoice" });
    }

    const updated = await (prisma.invoice.update as any)({
      where: { id },
      data: {
        dueDate:               dueDate ? new Date(dueDate) : undefined,
        ewayBillNo:            ewayBillNo            ?? undefined,
        challanNo:             challanNo             ?? undefined,
        financedBy:            financedBy            ?? undefined,
        salesman:              salesman              ?? undefined,
        emailId:               emailId               ?? undefined,
        warrantyPeriod:        warrantyPeriod        ?? undefined,
        notes:                 notes                 ?? undefined,
        termsConditions:       termsConditions       ?? undefined,
        signatureUrl:          signatureUrl          !== undefined ? signatureUrl          : undefined,
        showEmptySignatureBox: showEmptySignatureBox !== undefined ? showEmptySignatureBox : undefined,
      },
    });

    return res.json({ success: true, message: "Invoice updated", data: updated });
  } catch (error: any) {
    console.error("❌ Update Invoice Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   CANCEL INVOICE
   PATCH /api/invoices/:id/cancel
═══════════════════════════════════════════════════════════ */
export const cancelInvoice = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid invoice ID" });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where:   { id },
        include: { items: true },
      });

      if (!invoice)                                   throw new Error("Invoice not found");
      if (invoice.status === InvoiceStatus.CANCELLED) throw new Error("Invoice is already cancelled");

      // Restore stock
      for (const item of invoice.items) {
        const stock = await tx.productStock.findFirst({ where: { productId: item.productId } });
        if (stock) {
          await tx.productStock.update({
            where: { id: stock.id },
            data:  { openingStock: { increment: item.quantity } },
          });
        }
      }

      // Reversal ledger entry
      const newBalance = (await getLastPartyBalanceTx(tx, invoice.partyId)) - invoice.totalAmount.toNumber();

      await tx.partyLedger.create({
        data: {
          partyId:   invoice.partyId,
          refType:   LedgerRefType.Return,
          refId:     invoice.id,
          reference: invoice.invoiceNo,
          type:      LedgerType.CREDIT,
          debit:     null,
          credit:    invoice.totalAmount,
          balance:   newBalance,
        },
      });

      return tx.invoice.update({
        where: { id },
        data:  { status: InvoiceStatus.CANCELLED },
      });
    });

    return res.json({ success: true, message: "Invoice cancelled", data: result });
  } catch (error: any) {
    console.error("❌ Cancel Invoice Error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   RECORD PAYMENT ON INVOICE
   PATCH /api/invoices/:id/payment
   body: { amount, paymentMode }
═══════════════════════════════════════════════════════════ */
export const recordInvoicePayment = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid invoice ID" });

  const { amount, paymentMode } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "Invalid payment amount" });

  try {
    const result = await prisma.$transaction(async (tx) => {
      // `as any` because stale client may not have receivedAmount / paymentMode on the type
      const invoice: any = await tx.invoice.findUnique({ where: { id } });

      if (!invoice)                                   throw new Error("Invoice not found");
      if (invoice.status === InvoiceStatus.CANCELLED) throw new Error("Cannot pay a cancelled invoice");
      if (invoice.status === InvoiceStatus.PAID)      throw new Error("Invoice is already fully paid");

      const currentOutstanding = Number(invoice.outstandingAmount ?? 0);
      if (amount > currentOutstanding) {
        throw new Error(`Payment (${amount}) exceeds outstanding amount (${currentOutstanding})`);
      }

      const newReceived    = Number(invoice.receivedAmount ?? 0) + amount;
      const newOutstanding = currentOutstanding - amount;
      const newStatus      = deriveStatus(newReceived, Number(invoice.totalAmount));

      const updated = await (tx.invoice.update as any)({
        where: { id },
        data: {
          receivedAmount:    newReceived,
          outstandingAmount: newOutstanding,
          paymentMode:       paymentMode ?? invoice.paymentMode ?? null,
          status:            newStatus,
        },
      });

      // Ledger CREDIT
      const newBalance = (await getLastPartyBalanceTx(tx, invoice.partyId)) - amount;

      await tx.partyLedger.create({
        data: {
          partyId:   invoice.partyId,
          refType:   LedgerRefType.Payment,
          refId:     invoice.id,
          reference: invoice.invoiceNo,
          type:      LedgerType.CREDIT,
          debit:     null,
          credit:    amount,
          balance:   newBalance,
        },
      });

      return updated;
    });

    return res.json({ success: true, message: "Payment recorded", data: result });
  } catch (error: any) {
    console.error("❌ Record Payment Error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   INVOICE SUMMARY
   GET /api/invoices/summary
═══════════════════════════════════════════════════════════ */
export const getInvoiceSummary = async (_req: Request, res: Response) => {
  try {
    // Use separate aggregate calls to avoid _sum fields that the stale
    // client doesn't know about yet (receivedAmount / outstandingAmount)
    const [totalAgg, statusCounts] = await Promise.all([
      prisma.invoice.aggregate({
        where: { status: { not: InvoiceStatus.CANCELLED } },
        _sum:  { totalAmount: true },
      }),
      prisma.invoice.groupBy({
        by:     ["status"],
        _count: { id: true },
      }),
    ]);

    // receivedAmount / outstandingAmount aggregate via raw-safe approach
    const extraAgg: any = await (prisma.invoice.aggregate as any)({
      where: { status: { not: InvoiceStatus.CANCELLED } },
      _sum:  { receivedAmount: true, outstandingAmount: true },
    });

    // Cancelled invoices total
    const cancelledAgg = await prisma.invoice.aggregate({
      where: { status: InvoiceStatus.CANCELLED },
      _sum:  { totalAmount: true },
    });

    const statusMap: Record<string, number> = {};
    statusCounts.forEach((c) => { statusMap[c.status] = c._count.id; });

    return res.json({
      success: true,
      data: {
        totalInvoiced:    totalAgg._sum?.totalAmount          ?? 0,
        totalReceived:    extraAgg?._sum?.receivedAmount      ?? 0,
        totalOutstanding: extraAgg?._sum?.outstandingAmount   ?? 0,
        totalCancelled:   cancelledAgg._sum?.totalAmount      ?? 0,
        openCount:        statusMap[InvoiceStatus.OPEN]       ?? 0,
        partialCount:     statusMap[InvoiceStatus.PARTIAL]    ?? 0,
        paidCount:        statusMap[InvoiceStatus.PAID]       ?? 0,
        cancelledCount:   statusMap[InvoiceStatus.CANCELLED]  ?? 0,
      },
    });
  } catch (error) {
    console.error("❌ Invoice Summary Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch invoice summary" });
  }
};

/* ═══════════════════════════════════════════════════════════
   PARTY ITEM-WISE REPORT
   GET /api/invoices/party-item-wise/:id
═══════════════════════════════════════════════════════════ */
export const getPartyItemWiseReport = async (req: Request, res: Response) => {
  const partyId = Number(req.params.id);
  if (isNaN(partyId)) return res.status(400).json({ success: false, message: "Invalid party ID" });

  try {
    const invoices = await prisma.invoice.findMany({
      where:   { partyId },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
    });

    const data = invoices.flatMap((invoice) =>
      invoice.items.map((item) => ({
        partyId,
        invoiceNo: invoice.invoiceNo,
        itemName:  item.product.name,
        itemCode:  item.product.itemCode ?? null,
        quantity:  item.quantity,
        price:     Number(item.price),
        amount:    Number(item.total),
        type:      "Sale",
        date:      invoice.createdAt,
      }))
    );

    return res.json({ success: true, data });
  } catch (error) {
    console.error("❌ Item-wise Report Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch item-wise report" });
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   DELETE /api/invoices/:id  — hard delete invoice + its ledger entries
═══════════════════════════════════════════════════════════════════════════ */
export const deleteInvoice = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid invoice ID" });

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Check exists
      const invoice = await tx.invoice.findUnique({ where: { id } });
      if (!invoice) throw new Error("Invoice not found");

      // 2. Remove ledger entries for this invoice
      await tx.partyLedger.deleteMany({
        where: { refType: "Invoice", refId: id },
      });

      // 3. Remove payment allocations linked to this invoice
      await (tx as any).paymentAllocation?.deleteMany?.({ where: { invoiceId: id } }).catch(() => {});

      // 4. Remove invoice items
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      // 5. Delete invoice
      await tx.invoice.delete({ where: { id } });
    });

    return res.json({ success: true, message: "Invoice deleted successfully" });
  } catch (error: any) {
    console.error("❌ Delete Invoice Error:", error);
    if (error.message === "Invoice not found")
      return res.status(404).json({ success: false, message: "Invoice not found" });
    return res.status(500).json({ success: false, message: "Failed to delete invoice" });
  }
};
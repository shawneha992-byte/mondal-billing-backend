/**
 * salesReturn.controller.ts
 * ─────────────────────────────────────────────────────────────
 * Sales Return = customer returns items → stock comes back IN.
 * Writes StockRefType.SALES_RETURN ledger entry.
 * On delete → reverses the entry (stock goes back OUT).
 *
 * Route file: salesReturn.routes.ts  (already registered in index.ts)
 */

import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { StockRefType, LedgerRefType, LedgerType } from "@prisma/client";
import { writeStockLedger, reverseStockLedger } from "../services/stockLedger.service";

/* ═══════════════════════════════════════════════════════════
   CREATE SALES RETURN
   POST /api/sales-return/sales-return
═══════════════════════════════════════════════════════════ */
export const createSalesReturn = async (req: Request, res: Response) => {
  try {
    const { invoiceId, partyId, items = [], reason } = req.body;

    if (!invoiceId || !partyId || !items.length) {
      return res.status(400).json({
        success: false,
        message: "invoiceId, partyId and items are required",
      });
    }

    const result = await prisma.$transaction(async (tx) => {

      // Validate the source invoice
      const invoice = await tx.invoice.findUnique({
        where:   { id: Number(invoiceId) },
        include: { items: true },
      });
      if (!invoice) throw new Error("Invoice not found");

      // Compute return total
      const totalAmount = items.reduce(
        (s: number, i: any) => s + Number(i.price) * Number(i.quantity), 0
      );

      // Create SalesReturn record
      const salesReturn = await tx.salesReturn.create({
        data: {
          invoiceId:   Number(invoiceId),
          partyId:     Number(partyId),
          totalAmount,
          items: {
            create: items.map((i: any) => ({
              productId: Number(i.productId),
              quantity:  Number(i.quantity),
              price:     Number(i.price),
            })),
          },
        },
        include: { items: true },
      });

      // ── STOCK IN — returned items go back into stock ───────
      for (const item of salesReturn.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (product?.itemType !== "Product") continue;

        // Use same godown as the original invoice item where possible
        const originalItem = await tx.invoiceItem.findFirst({
          where: { invoiceId: Number(invoiceId), productId: item.productId },
        });

        await writeStockLedger({
          tx,
          productId:  item.productId,
          godownId:   (originalItem as any)?.godownId ?? null,
          refType:    StockRefType.SALES_RETURN,
          refId:      salesReturn.id,
          quantityIn: item.quantity,
          remarks:    `Sales Return — ${invoice.invoiceNo}`,
          date:       new Date(),
        });
      }

      // ── Party Ledger CREDIT — reduce what party owes ───────
      const lastBalance = await getLastPartyBalance(tx, Number(partyId));
      await tx.partyLedger.create({
        data: {
          partyId:   Number(partyId),
          refType:   LedgerRefType.Return,
          refId:     salesReturn.id,
          reference: `RET-${salesReturn.id}`,
          type:      LedgerType.CREDIT,
          credit:    totalAmount,
          debit:     null,
          balance:   lastBalance - totalAmount,
        },
      });

      return salesReturn;
    });

    return res.status(201).json({ success: true, message: "Sales return created", data: result });
  } catch (error: any) {
    console.error("❌ createSalesReturn:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

/* ═══════════════════════════════════════════════════════════
   GET ALL SALES RETURNS
   GET /api/sales-return/sales-return
═══════════════════════════════════════════════════════════ */
export const getSalesReturns = async (req: Request, res: Response) => {
  try {
    const { partyId, invoiceId } = req.query;
    const where: any = {};
    if (partyId)   where.partyId   = Number(partyId);
    if (invoiceId) where.invoiceId = Number(invoiceId);

    const returns = await prisma.salesReturn.findMany({
      where,
      include: {
        party:   { select: { id: true, partyName: true } },
        invoice: { select: { id: true, invoiceNo: true } },
        items:   { include: { product: { select: { id: true, name: true, unit: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ success: true, data: returns });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch sales returns" });
  }
};

/* ═══════════════════════════════════════════════════════════
   DELETE SALES RETURN  (reverses stock correction)
   DELETE /api/sales-return/:id  ← add this route if needed
═══════════════════════════════════════════════════════════ */
export const deleteSalesReturn = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    await prisma.$transaction(async (tx) => {
      const ret = await tx.salesReturn.findUnique({ where: { id } });
      if (!ret) throw new Error("Sales return not found");

      // ✅ Reverse stock — returned items go back OUT
      await reverseStockLedger(tx, StockRefType.SALES_RETURN, id);

      // Reverse party ledger credit
      await tx.partyLedger.deleteMany({
        where: { refType: LedgerRefType.Return, refId: id },
      });

      await tx.salesReturnItem.deleteMany({ where: { salesReturnId: id } });
      await tx.salesReturn.delete({ where: { id } });
    });

    return res.json({ success: true, message: "Sales return deleted" });
  } catch (error: any) {
    console.error("❌ deleteSalesReturn:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ─────────────────────────────────────────────
   HELPER — last party ledger balance
───────────────────────────────────────────── */
async function getLastPartyBalance(tx: any, partyId: number): Promise<number> {
  const last = await tx.partyLedger.findFirst({
    where:   { partyId },
    orderBy: { createdAt: "desc" },
    select:  { balance: true },
  });
  return last ? Number(last.balance) : 0;
}
/**
 * stockLedger.service.ts
 * ──────────────────────────────────────────────────────────────
 * Single source of truth for ALL stock movements.
 * Every transaction that touches inventory calls one of these helpers.
 *
 *  ┌─────────────────────────────────────────────┐
 *  │  Action               │  quantityIn/Out      │
 *  ├─────────────────────────────────────────────┤
 *  │  Opening stock set    │  IN  = openingStock  │
 *  │  Purchase received    │  IN  = qty bought    │
 *  │  Sale made            │  OUT = qty sold      │
 *  │  Sales return         │  IN  = qty returned  │
 *  │  Purchase return      │  OUT = qty returned  │
 *  │  Manual adjustment    │  IN or OUT           │
 *  └─────────────────────────────────────────────┘
 *
 * Usage (inside a Prisma $transaction):
 *   await writeStockLedger(tx, { ... });
 */

import { StockRefType } from "@prisma/client";

interface StockMovement {
  tx:          any;              // Prisma transaction client
  productId:   number;
  godownId?:   number | null;
  refType:     StockRefType;
  refId?:      number | null;   // Invoice/Purchase/Return ID
  quantityIn?: number;           // stock coming IN  (purchase, sales-return, opening)
  quantityOut?: number;          // stock going OUT  (sale, purchase-return)
  remarks?:    string;
  date?:       Date;
}

/**
 * writeStockLedger
 * Resolves current balance, writes a StockLedger row,
 * and updates ProductStock.currentStock — all in one call.
 */
export async function writeStockLedger(params: StockMovement): Promise<void> {
  const {
    tx, productId, godownId, refType, refId,
    quantityIn = 0, quantityOut = 0, remarks, date,
  } = params;

  // ── 1. Find or auto-create ProductStock row ──────────────────────────────
  let stock = godownId
    ? await tx.productStock.findUnique({
        where: { productId_godownId: { productId, godownId } },
      })
    : await tx.productStock.findFirst({ where: { productId } });

  if (!stock && godownId) {
    // Auto-create a zero-balance stock row so ledger can be written
    stock = await tx.productStock.create({
      data: {
        productId,
        godownId,
        openingStock: 0,
        currentStock: 0,
        asOfDate:     date ?? new Date(),
      },
    });
  }

  const prevBalance = stock ? (stock.currentStock ?? stock.openingStock ?? 0) : 0;
  const newBalance  = Math.max(0, prevBalance + quantityIn - quantityOut);

  // ── 2. Write StockLedger row ─────────────────────────────────────────────
  await tx.stockLedger.create({
    data: {
      productId,
      godownId:    stock?.godownId ?? godownId ?? null,
      date:        date ?? new Date(),
      refType,
      refId:       refId ?? null,
      quantityIn:  quantityIn  > 0 ? quantityIn  : null,
      quantityOut: quantityOut > 0 ? quantityOut : null,
      balance:     newBalance,
      remarks:     remarks ?? null,
    },
  });

  // ── 3. Update ProductStock.currentStock ──────────────────────────────────
  if (stock) {
    await tx.productStock.update({
      where: { id: stock.id },
      data:  { currentStock: newBalance },
    });
  }
}

/**
 * reverseStockLedger
 * Called when an invoice/purchase is deleted or cancelled.
 * Finds all StockLedger entries for that refType+refId,
 * reverses each movement, removes the ledger rows.
 */
export async function reverseStockLedger(
  tx: any,
  refType: StockRefType,
  refId:   number,
): Promise<void> {
  const entries = await tx.stockLedger.findMany({
    where: { refType, refId },
  });

  for (const entry of entries) {
    const stock = entry.godownId
      ? await tx.productStock.findUnique({
          where: { productId_godownId: { productId: entry.productId, godownId: entry.godownId } },
        })
      : await tx.productStock.findFirst({ where: { productId: entry.productId } });

    if (stock) {
      // Reverse: what went out comes back, what came in goes out
      const reversed = (stock.currentStock ?? stock.openingStock ?? 0)
        + (entry.quantityOut ?? 0)
        - (entry.quantityIn  ?? 0);
      await tx.productStock.update({
        where: { id: stock.id },
        data:  { currentStock: Math.max(0, reversed) },
      });
    }
  }

  // Delete all ledger rows for this reference
  await tx.stockLedger.deleteMany({ where: { refType, refId } });
}
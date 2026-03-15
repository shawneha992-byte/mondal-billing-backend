/**
 * stockLedger.service.ts
 * ──────────────────────────────────────────────────────────────
 * Single source of truth for ALL stock movements.
 * Every transaction that touches inventory calls one of these helpers.
 */

import { StockRefType } from "@prisma/client";

interface StockMovement {
  tx: any; // Prisma transaction client
  productId: number;
  godownId?: number | null;
  refType: StockRefType;
  refId?: number | null;
  quantityIn?: number;
  quantityOut?: number;
  remarks?: string;
  date?: Date;
}

/**
 * writeStockLedger
 * Resolves current balance, writes a StockLedger row,
 * and updates ProductStock.currentStock.
 */
export async function writeStockLedger(params: StockMovement): Promise<void> {
  const {
    tx,
    productId,
    godownId,
    refType,
    refId,
    quantityIn = 0,
    quantityOut = 0,
    remarks,
    date,
  } = params;

  /* ─────────────────────────────────────────────
     1. Find existing ProductStock row
  ───────────────────────────────────────────── */

  let stock = godownId
    ? await tx.productStock.findUnique({
        where: {
          productId_godownId: {
            productId,
            godownId,
          },
        },
      })
    : await tx.productStock.findFirst({
        where: { productId },
      });

  /* ─────────────────────────────────────────────
     2. Auto-create stock row if missing
  ───────────────────────────────────────────── */

  if (!stock && godownId) {
    stock = await tx.productStock.create({
      data: {
        productId,
        godownId,
        openingStock: 0,
        currentStock: 0,
        asOfDate: date ?? new Date(),
      },
    });
  }

  const prevBalance =
    stock?.currentStock ?? stock?.openingStock ?? 0;

  const newBalance = prevBalance + quantityIn - quantityOut;

  /* ─────────────────────────────────────────────
     3. Write StockLedger entry
  ───────────────────────────────────────────── */

  await tx.stockLedger.create({
    data: {
      product: {
        connect: { id: productId },
      },

      godown:
        stock?.godownId || godownId
          ? {
              connect: {
                godown_id: stock?.godownId ?? godownId, // ✅ FIXED
              },
            }
          : undefined,

      date: date ?? new Date(),
      refType,
      refId: refId ?? null,
      quantityIn: quantityIn > 0 ? quantityIn : 0,
      quantityOut: quantityOut > 0 ? quantityOut : 0,
      balance: newBalance,
      remarks: remarks ?? null,
    },
  });

  /* ─────────────────────────────────────────────
     4. Update ProductStock
  ───────────────────────────────────────────── */

  if (stock) {
    await tx.productStock.update({
      where: { id: stock.id },
      data: {
        currentStock: newBalance,
      },
    });
  }
}

/**
 * reverseStockLedger
 * Used when cancelling/deleting invoice/purchase.
 */
export async function reverseStockLedger(
  tx: any,
  refType: StockRefType,
  refId: number
): Promise<void> {
  const entries = await tx.stockLedger.findMany({
    where: { refType, refId },
  });

  for (const entry of entries) {
    const stock = entry.godownId
      ? await tx.productStock.findUnique({
          where: {
            productId_godownId: {
              productId: entry.productId,
              godownId: entry.godownId,
            },
          },
        })
      : await tx.productStock.findFirst({
          where: { productId: entry.productId },
        });

    if (stock) {
      const reversed =
        (stock.currentStock ?? stock.openingStock ?? 0) +
        (entry.quantityOut ?? 0) -
        (entry.quantityIn ?? 0);

      await tx.productStock.update({
        where: { id: stock.id },
        data: {
          currentStock: reversed,
        },
      });
    }
  }

  await tx.stockLedger.deleteMany({
    where: { refType, refId },
  });
}
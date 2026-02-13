import { Request, Response } from "express";
import prisma from "../utils/prisma";


/**
 * GET Party Ledger
 * URL: /api/party/:id/ledger
 */
export const getPartyLedger = async (req: Request, res: Response) => {
  try {

    const partyId = Number(req.params.id);

    const ledger = await prisma.partyLedger.findMany({
      where: { partyId },
      orderBy: { date: "asc" }
    });

    return res.status(200).json({
      success: true,
      data: ledger
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch party ledger"
    });
  }
};


/**
 * GET Party Balance
 * URL: /api/party/:id/balance
 */
export const getPartyBalance = async (req: Request, res: Response) => {
  try {

    const partyId = Number(req.params.id);

    const latestEntry = await prisma.partyLedger.findFirst({
      where: { partyId },
      orderBy: { date: "desc" }
    });

    return res.status(200).json({
      success: true,
      balance: latestEntry?.balance || 0
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch party balance"
    });
  }
};

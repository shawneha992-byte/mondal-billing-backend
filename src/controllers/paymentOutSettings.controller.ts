import { Request, Response } from "express";
import prisma from "../utils/prisma";

/* =========================================
   GET PAYMENT OUT SETTINGS
========================================= */

export const getPaymentOutSettings = async (_req: Request, res: Response) => {
  try {
    let settings = await prisma.paymentOutSettings.findFirst();

    if (!settings) {
      settings = await prisma.paymentOutSettings.create({
        data: {
          prefix: "PO/",
          sequenceNumber: 0, // last used sequence
        },
      });
    }

    res.json(settings);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to fetch payment out settings",
    });
  }
};

/* =========================================
   UPDATE PAYMENT OUT SETTINGS
========================================= */

export const updatePaymentOutSettings = async (req: Request, res: Response) => {
  try {
    const { prefix } = req.body;

    const settings = await prisma.paymentOutSettings.findFirst();

    if (!settings) {
      return res.status(404).json({
        message: "Settings not found",
      });
    }

    const updated = await prisma.paymentOutSettings.update({
      where: { id: settings.id },
      data: {
        prefix,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to update payment out settings",
    });
  }
};
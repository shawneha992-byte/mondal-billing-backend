import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* CREATE ITEM (Product or Service) */

export const createItem = async (req: Request, res: Response) => {
  try {
    const {
      name,
      itemType,
      category,
      salesPrice,
      gstRate,
      unit,
      openingStock,
      godownId,
      asOfDate,
      serviceCode,
      enableSerial,
      showOnlineStore
    } = req.body;

    if (!name || !itemType || !salesPrice) {
      return res.status(400).json({
        success: false,
        message: "Name, ItemType and SalesPrice are required"
      });
    }

    const item = await prisma.product.create({
      data: {
        name,
        itemType,
        category,
        salesPrice: Number(salesPrice),
        gstRate: gstRate ? Number(gstRate) : null,
        unit,
        openingStock: itemType === "Product" ? Number(openingStock || 0) : null,
        serviceCode: itemType === "Service" ? serviceCode : null,
        enableSerial: enableSerial ?? false,
        showOnlineStore: showOnlineStore ?? false,
       
      
      }
    });

    if (itemType === "Product" && godownId) {

  await prisma.productStock.create({
    data: {
      productId: item.id,
      godownId: Number(godownId),
      openingStock: Number(openingStock || 0),
      asOfDate: asOfDate ? new Date(asOfDate) : new Date()
    }
  });

}

    return res.status(201).json({
      success: true,
      message: "Item created successfully",
      data: item
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
};


/* GET ALL ITEMS */

export const getItems = async (req: Request, res: Response) => {
  try {

    const items = await prisma.product.findMany({
      orderBy: { createdAt: "desc" }
    });

    res.json({
      success: true,
      data: items
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch items"
    });
  }
};

/* GET ITEMS BY GODOWN */

export const getItemsByGodown = async (req: Request, res: Response) => {
  try {

    const godownId = Number(req.params.godownId);

    const stocks = await prisma.productStock.findMany({
      where: { godownId },
      include: {
        product: true
      }
    });

    const items = stocks.map((stock) => ({
      id: stock.product.id,
      name: stock.product.name,
      itemType: stock.product.itemType,
      salesPrice: stock.product.salesPrice,
      stockQty: stock.openingStock
    }));

    res.json({
      success: true,
      data: items
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch items by godown"
    });
  }
};



export const updateItem = async (req: Request, res: Response) => {
  try {

    const { id } = req.params;

    const {
      name,
      itemType,
      category,
      salesPrice,
      gstRate,
      unit,
      openingStock,
      serviceCode,
      enableSerial,
      showOnlineStore
    } = req.body;

    const updatedItem = await prisma.product.update({
      where: { id: Number(id) },
      data: {
        name,
        itemType,
        category,
        salesPrice,
        gstRate,
        unit,
        openingStock,
        serviceCode,
        enableSerial,
        showOnlineStore
      }
    });

    res.json(updatedItem);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating item" });
  }
};


/* DELETE ITEM */

export const deleteItem = async (req: Request, res: Response) => {
  try {

    const id = Number(req.params.id);

    await prisma.product.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: "Item deleted successfully"
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Delete failed"
    });
  }
};
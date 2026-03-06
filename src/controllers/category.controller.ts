import { Request, Response } from "express";
import prisma from "../utils/prisma";

/* GET ALL CATEGORIES */

export const getCategories = async (_req: Request, res: Response) => {
  try {

    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" }
    });

    res.json(categories);

  } catch (error) {
    res.status(500).json({ message: "Failed to fetch categories" });
  }
};


/* ADD CATEGORY */

export const createCategory = async (req: Request, res: Response) => {
  try {

    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Category name required" });
    }

    const category = await prisma.category.create({
      data: { name }
    });

    res.status(201).json(category);

  } catch (error) {
    res.status(500).json({ message: "Failed to create category" });
  }
};
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCategory = exports.getCategories = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
/* GET ALL CATEGORIES */
const getCategories = async (_req, res) => {
    try {
        const categories = await prisma_1.default.category.findMany({
            orderBy: { name: "asc" }
        });
        res.json(categories);
    }
    catch (error) {
        res.status(500).json({ message: "Failed to fetch categories" });
    }
};
exports.getCategories = getCategories;
/* ADD CATEGORY */
const createCategory = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ message: "Category name required" });
        }
        const category = await prisma_1.default.category.create({
            data: { name }
        });
        res.status(201).json(category);
    }
    catch (error) {
        res.status(500).json({ message: "Failed to create category" });
    }
};
exports.createCategory = createCategory;

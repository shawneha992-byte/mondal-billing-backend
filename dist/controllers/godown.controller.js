"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteGodown = exports.updateGodown = exports.getGodownById = exports.getGodowns = exports.createGodown = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
/* CREATE GODOWN */
const createGodown = async (req, res) => {
    try {
        const { godownName, streetAddress, stateName, cityName, pincode } = req.body;
        if (!godownName) {
            return res.status(400).json({
                success: false,
                message: "Godown name is required"
            });
        }
        const godown = await prisma_1.default.godown.create({
            data: {
                godown_name: godownName,
                street_address: streetAddress,
                state_name: stateName,
                city_name: cityName,
                pincode
            }
        });
        res.status(201).json({
            success: true,
            data: godown
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Error creating godown"
        });
    }
};
exports.createGodown = createGodown;
/* GET ALL GODOWNS */
const getGodowns = async (req, res) => {
    try {
        const godowns = await prisma_1.default.godown.findMany({
            orderBy: {
                created_at: "desc"
            }
        });
        res.json({
            success: true,
            data: godowns
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching godowns"
        });
    }
};
exports.getGodowns = getGodowns;
/* GET SINGLE GODOWN */
const getGodownById = async (req, res) => {
    try {
        const godown_id = Number(req.params.id);
        const godown = await prisma_1.default.godown.findUnique({
            where: { godown_id }
        });
        if (!godown) {
            return res.status(404).json({
                success: false,
                message: "Godown not found"
            });
        }
        res.json({
            success: true,
            data: godown
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching godown"
        });
    }
};
exports.getGodownById = getGodownById;
/* UPDATE GODOWN */
const updateGodown = async (req, res) => {
    try {
        const godown_id = Number(req.params.id);
        const { godownName, streetAddress, stateName, cityName, pincode } = req.body;
        const godown = await prisma_1.default.godown.update({
            where: { godown_id },
            data: {
                godown_name: godownName,
                street_address: streetAddress,
                state_name: stateName,
                city_name: cityName,
                pincode
            }
        });
        res.json({
            success: true,
            data: godown
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating godown"
        });
    }
};
exports.updateGodown = updateGodown;
/* DELETE GODOWN */
const deleteGodown = async (req, res) => {
    try {
        const godown_id = Number(req.params.id);
        await prisma_1.default.godown.delete({
            where: { godown_id }
        });
        res.json({
            success: true,
            message: "Godown deleted successfully"
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting godown"
        });
    }
};
exports.deleteGodown = deleteGodown;

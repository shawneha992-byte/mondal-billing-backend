"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPurchaseOrderHistory = exports.duplicatePurchaseOrder = exports.deletePurchaseOrder = exports.updatePurchaseOrder = exports.getPurchaseOrderById = exports.getPurchaseOrders = exports.createPurchaseOrder = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
/* ======================================================
   GENERATE SAFE PO NUMBER
====================================================== */
async function generatePoNumber(tx) {
    const last = await tx.purchaseOrder.findFirst({
        orderBy: { poNumber: "desc" },
        select: { poNumber: true }
    });
    return (last?.poNumber || 0) + 1;
}
/* ======================================================
   CREATE PURCHASE ORDER
====================================================== */
const createPurchaseOrder = async (req, res) => {
    try {
        const result = await prisma_1.default.$transaction(async (tx) => {
            const poNumber = await generatePoNumber(tx);
            const { partyId, branchCode, poDate, validTill, notes, termsConditions, items, additionalCharges, totalAmount, subTotal, taxAmount, discountAmount, taxableAmount, roundOff } = req.body;
            const order = await tx.purchaseOrder.create({
                data: {
                    poNumber,
                    partyId,
                    branchCode,
                    poDate: new Date(poDate),
                    validTill: validTill ? new Date(validTill) : null,
                    notes,
                    termsConditions,
                    totalAmount,
                    subTotal,
                    taxAmount,
                    discountAmount,
                    taxableAmount,
                    roundOff,
                    items: {
                        create: items || []
                    },
                    additionalCharges: {
                        create: additionalCharges || []
                    },
                    PurchaseOrderHistory: {
                        create: {
                            action: "CREATED",
                            description: `PO ${poNumber} created`
                        }
                    }
                },
                include: {
                    party: true,
                    items: {
                        include: { product: true }
                    },
                    additionalCharges: true
                }
            });
            return order;
        });
        res.json(result);
    }
    catch (error) {
        console.error("CREATE PO ERROR:", error);
        res.status(500).json({ message: "Failed to create purchase order" });
    }
};
exports.createPurchaseOrder = createPurchaseOrder;
/* ======================================================
   GET ALL PURCHASE ORDERS
====================================================== */
const getPurchaseOrders = async (_req, res) => {
    try {
        const orders = await prisma_1.default.purchaseOrder.findMany({
            include: {
                party: true,
                items: {
                    include: { product: true }
                },
                additionalCharges: true
            },
            orderBy: {
                id: "desc"
            }
        });
        res.json(orders);
    }
    catch (error) {
        console.error("FETCH PO ERROR:", error);
        res.status(500).json({ message: "Failed to fetch purchase orders" });
    }
};
exports.getPurchaseOrders = getPurchaseOrders;
/* ======================================================
   GET SINGLE PURCHASE ORDER
====================================================== */
const getPurchaseOrderById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const order = await prisma_1.default.purchaseOrder.findUnique({
            where: { id },
            include: {
                party: true,
                items: {
                    include: { product: true }
                },
                additionalCharges: true
            }
        });
        if (!order) {
            return res.status(404).json({ message: "Purchase order not found" });
        }
        res.json(order);
    }
    catch (error) {
        console.error("FETCH PO BY ID ERROR:", error);
        res.status(500).json({ message: "Failed to fetch purchase order" });
    }
};
exports.getPurchaseOrderById = getPurchaseOrderById;
/* ======================================================
   UPDATE PURCHASE ORDER
====================================================== */
const updatePurchaseOrder = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { partyId, poDate, validTill, notes, termsConditions, items, additionalCharges, totalAmount, subTotal, taxAmount, discountAmount, taxableAmount, roundOff } = req.body;
        const result = await prisma_1.default.$transaction(async (tx) => {
            /* Remove existing children */
            await tx.purchaseOrderItem.deleteMany({
                where: { purchaseOrderId: id }
            });
            await tx.purchaseOrderAdditionalCharge.deleteMany({
                where: { purchaseOrderId: id }
            });
            const updated = await tx.purchaseOrder.update({
                where: { id },
                data: {
                    partyId,
                    poDate: new Date(poDate),
                    validTill: validTill ? new Date(validTill) : null,
                    notes,
                    termsConditions,
                    totalAmount,
                    subTotal,
                    taxAmount,
                    discountAmount,
                    taxableAmount,
                    roundOff,
                    items: {
                        create: items || []
                    },
                    additionalCharges: {
                        create: additionalCharges || []
                    },
                    PurchaseOrderHistory: {
                        create: {
                            action: "UPDATED",
                            description: "Purchase order updated"
                        }
                    }
                },
                include: {
                    party: true,
                    items: {
                        include: { product: true }
                    },
                    additionalCharges: true
                }
            });
            return updated;
        });
        res.json(result);
    }
    catch (error) {
        console.error("UPDATE PO ERROR:", error);
        res.status(500).json({ message: "Failed to update purchase order" });
    }
};
exports.updatePurchaseOrder = updatePurchaseOrder;
/* ======================================================
   DELETE PURCHASE ORDER
====================================================== */
const deletePurchaseOrder = async (req, res) => {
    try {
        const id = Number(req.params.id);
        await prisma_1.default.$transaction(async (tx) => {
            await tx.purchaseOrderItem.deleteMany({
                where: { purchaseOrderId: id }
            });
            await tx.purchaseOrderAdditionalCharge.deleteMany({
                where: { purchaseOrderId: id }
            });
            await tx.purchaseOrderHistory.deleteMany({
                where: { purchaseOrderId: id }
            });
            await tx.purchaseOrder.delete({
                where: { id }
            });
        });
        res.json({ message: "Purchase order deleted successfully" });
    }
    catch (error) {
        console.error("DELETE PO ERROR:", error);
        res.status(500).json({ message: "Failed to delete purchase order" });
    }
};
exports.deletePurchaseOrder = deletePurchaseOrder;
/* ======================================================
   DUPLICATE PURCHASE ORDER
====================================================== */
const duplicatePurchaseOrder = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const order = await prisma_1.default.purchaseOrder.findUnique({
            where: { id },
            include: {
                items: true,
                additionalCharges: true
            }
        });
        if (!order) {
            return res.status(404).json({ message: "Purchase order not found" });
        }
        const result = await prisma_1.default.$transaction(async (tx) => {
            const poNumber = await generatePoNumber(tx);
            const newOrder = await tx.purchaseOrder.create({
                data: {
                    poNumber,
                    partyId: order.partyId,
                    branchCode: order.branchCode,
                    poDate: new Date(),
                    totalAmount: order.totalAmount,
                    subTotal: order.subTotal,
                    taxAmount: order.taxAmount,
                    discountAmount: order.discountAmount,
                    taxableAmount: order.taxableAmount,
                    roundOff: order.roundOff,
                    items: {
                        create: order.items.map(i => ({
                            productId: i.productId,
                            quantity: i.quantity,
                            price: i.price,
                            discount: i.discount,
                            taxRate: i.taxRate,
                            taxAmount: i.taxAmount,
                            total: i.total,
                            hsnSac: i.hsnSac
                        }))
                    },
                    additionalCharges: {
                        create: order.additionalCharges.map(c => ({
                            name: c.name,
                            amount: c.amount
                        }))
                    },
                    PurchaseOrderHistory: {
                        create: {
                            action: "DUPLICATED",
                            description: `Duplicated from PO ${order.poNumber}`
                        }
                    }
                }
            });
            return newOrder;
        });
        res.json(result);
    }
    catch (error) {
        console.error("DUPLICATE PO ERROR:", error);
        res.status(500).json({ message: "Failed to duplicate purchase order" });
    }
};
exports.duplicatePurchaseOrder = duplicatePurchaseOrder;
/* ======================================================
   PURCHASE ORDER HISTORY
====================================================== */
const getPurchaseOrderHistory = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const history = await prisma_1.default.purchaseOrderHistory.findMany({
            where: { purchaseOrderId: id },
            orderBy: { createdAt: "desc" }
        });
        res.json(history);
    }
    catch (error) {
        console.error("PO HISTORY ERROR:", error);
        res.status(500).json({ message: "Failed to fetch history" });
    }
};
exports.getPurchaseOrderHistory = getPurchaseOrderHistory;

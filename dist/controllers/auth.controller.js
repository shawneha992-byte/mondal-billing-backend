"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.forgotPassword = exports.me = exports.login = void 0;
const prisma_1 = __importDefault(require("../utils/prisma"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const login = async (req, res) => {
    const { username, password, role, branch } = req.body;
    const user = await prisma_1.default.user.findFirst({
        where: {
            OR: [{ email: username }, { mobile: String(username) }],
        },
    });
    if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
    }
    const passwordMatch = await bcrypt_1.default.compare(password, user.password_hash);
    if (!passwordMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
    }
    if (!user.isActive) {
        return res.status(403).json({ message: "Inactive user" });
    }
    if (user.role !== role) {
        return res.status(403).json({ message: "Wrong role" });
    }
    if (user.branch_code !== branch) {
        return res.status(403).json({ message: "Wrong branch" });
    }
    const token = jsonwebtoken_1.default.sign({ id: user.id, role: user.role, branch: user.branch_code }, process.env.JWT_SECRET, { expiresIn: "1d" });
    res.json({
        token,
        user: {
            id: user.id,
            name: user.name,
            role: user.role,
            branch: user.branch_code,
        },
    });
};
exports.login = login;
const me = async (req, res) => {
    const userId = req.user.id;
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            role: true,
            branch: true,
        },
    });
    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
};
exports.me = me;
const forgotPassword = async (_req, res) => {
    res.json({ message: "Reset link sent (mock)" });
};
exports.forgotPassword = forgotPassword;

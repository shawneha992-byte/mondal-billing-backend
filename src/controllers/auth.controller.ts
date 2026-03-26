import { Request, Response } from "express";
import prisma from "../utils/prisma";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { sendEmail } from "../utils/sendEmail"; // ✅ NEW

// ================= LOGIN (UNCHANGED) =================
export const login = async (req: Request, res: Response) => {
  const { username, password, role, branch } = req.body;

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: username }, { mobile: String(username) }],
    },
  });

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);

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

  const token = jwt.sign(
    { id: user.id, role: user.role, branch: user.branch_code },
    process.env.JWT_SECRET!,
    { expiresIn: "1d" }
  );

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

// ================= ME (UNCHANGED) =================
export const me = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;

  const user = await prisma.user.findUnique({
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

// ================= FORGOT PASSWORD (OTP) =================
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { username } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        email: username, // OTP → email only
      },
    });

    if (!user) {
      return res.json({ message: "If user exists, OTP sent" });
    }

    // 🔢 Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 🔐 Hash OTP
    const hashedOtp = await bcrypt.hash(otp, 10);

    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await prisma.user.update({
      where: { id: user.id },
      data: {
        reset_otp: hashedOtp,
        reset_otp_expiry: expiry,
      },
    });

    // 📧 Send OTP via email
    await sendEmail(user.email!, otp);

    res.json({ message: "OTP sent to your email" });

  } catch (err) {
    res.status(500).json({ message: "Something went wrong" });
  }
};

// ================= RESET PASSWORD WITH OTP =================
export const resetPasswordWithOtp = async (req: Request, res: Response) => {
  try {
    let { username, otp, newPassword } = req.body;

    if (!username || !otp || !newPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const cleanEmail = username.trim().toLowerCase();
    const cleanOtp = otp.trim();

    if (cleanOtp.length !== 6) {
      return res.status(400).json({ message: "Invalid OTP format" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user || !user.reset_otp || !user.reset_otp_expiry) {
      return res.status(400).json({ message: "Invalid request" });
    }

    if (user.reset_otp_expiry < new Date()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    const isValid = await bcrypt.compare(cleanOtp, user.reset_otp);

    if (!isValid) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: hashedPassword,
        reset_otp: null,
        reset_otp_expiry: null,
      },
    });

    res.json({ message: "Password reset successful" });

  } catch (err) {
    console.error("Reset Password Error:", err);
    res.status(500).json({ message: "Error resetting password" });
  }
};
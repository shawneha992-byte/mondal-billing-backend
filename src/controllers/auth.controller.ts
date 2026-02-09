import { Request, Response } from "express";
import prisma from "../utils/prisma";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

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

  const passwordMatch = await bcrypt.compare(password, user.password);

  if (!passwordMatch) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (!user.isActive) {
    return res.status(403).json({ message: "Inactive user" });
  }

  if (user.role !== role) {
    return res.status(403).json({ message: "Wrong role" });
  }

  if (user.branch !== branch) {
    return res.status(403).json({ message: "Wrong branch" });
  }


  const token = jwt.sign(
    { id: user.id, role: user.role, branch: user.branch },
    process.env.JWT_SECRET!,
    { expiresIn: "1d" }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      branch: user.branch,
    },
  });
};

export const me = async (req: Request, res: Response) => {
  res.json((req as any).user);
};

export const forgotPassword = async (_req: Request, res: Response) => {
  res.json({ message: "Reset link sent (mock)" });
};   
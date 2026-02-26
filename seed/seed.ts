import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // 1️⃣ Create / Update Branch (safe)
  const branch = await prisma.branch.upsert({
    where: { branch_code: "MAIN001" },
    update: {},
    create: {
      branch_name: "Main Store",
      branch_code: "MAIN001",
      address: "Head Office Location",
      status: "active"
    }
  });

  // 2️⃣ Hash passwords
  const adminHash = await bcrypt.hash("admin123", 10);
  const cashierHash = await bcrypt.hash("cashier123", 10);
  const accountantHash = await bcrypt.hash("accountant123", 10);

  // 3️⃣ Create / Update Users (safe)
  await prisma.user.upsert({
    where: { email: "admin@billing.com" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@billing.com",
      mobile: "9000000001",
      password_hash: adminHash,
      role: "Admin",
      branch_code: branch.branch_code
    }
  });

  await prisma.user.upsert({
    where: { email: "cashier@billing.com" },
    update: {},
    create: {
      name: "Cashier User",
      email: "cashier@billing.com",
      mobile: "9000000002",
      password_hash: cashierHash,
      role: "Cashier",
      branch_code: branch.branch_code
    }
  });

  await prisma.user.upsert({
    where: { email: "accountant@billing.com" },
    update: {},
    create: {
      name: "Accountant User",
      email: "accountant@billing.com",
      mobile: "9000000003",
      password_hash: accountantHash,
      role: "Accountant",
      branch_code: branch.branch_code
    }
  });

  console.log("✅ Seed data inserted successfully");
}

main()
  .catch((err) => {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

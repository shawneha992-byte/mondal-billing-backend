import dotenv from "dotenv";
dotenv.config();

import app from "./app";

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;

console.log("DATABASE_URL =", process.env.DATABASE_URL);

// ✅ ONLY PORT — NO HOST
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
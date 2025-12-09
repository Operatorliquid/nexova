// backend/src/prisma.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Usamos la misma URL que definimos en .env (DATABASE_URL="file:./dev.db")
// y, si por algún motivo no está, usamos file:./dev.db como fallback.
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./dev.db",
});

// Exportamos una única instancia de PrismaClient
export const prisma = new PrismaClient({ adapter });

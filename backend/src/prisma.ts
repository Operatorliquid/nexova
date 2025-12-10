import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está definido");
}

const adapter = new PrismaPg({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // opcional si Railway lo requiere
  },
});

export const prisma = new PrismaClient({ adapter });

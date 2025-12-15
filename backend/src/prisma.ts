import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está definido");
}

const needsSSL = !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1");

const adapter = new PrismaPg({
  connectionString,
  ssl: needsSSL
    ? { rejectUnauthorized: false }
    : false,
});

export const prisma = new PrismaClient({ adapter });

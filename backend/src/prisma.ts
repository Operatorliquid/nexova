// backend/src/prisma.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// Exportamos una única instancia de PrismaClient apuntando al datasource configurado (Postgres en producción)
export const prisma = new PrismaClient();

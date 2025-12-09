"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
// backend/src/prisma.ts
require("dotenv/config");
const client_1 = require("@prisma/client");
const adapter_better_sqlite3_1 = require("@prisma/adapter-better-sqlite3");
// Usamos la misma URL que definimos en .env (DATABASE_URL="file:./dev.db")
// y, si por algún motivo no está, usamos file:./dev.db como fallback.
const adapter = new adapter_better_sqlite3_1.PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || "file:./dev.db",
});
// Exportamos una única instancia de PrismaClient
exports.prisma = new client_1.PrismaClient({ adapter });

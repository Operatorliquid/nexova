"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
require("dotenv/config");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL no está definido");
}
const needsSSL = !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1");
const adapter = new adapter_pg_1.PrismaPg({
    connectionString,
    ssl: needsSSL
        ? { rejectUnauthorized: false }
        : false,
});
exports.prisma = new client_1.PrismaClient({ adapter });

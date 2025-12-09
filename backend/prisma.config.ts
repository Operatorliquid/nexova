// backend/prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  // Dónde está tu schema
  schema: "prisma/schema.prisma",

  // Dónde se van a guardar las migraciones
  migrations: {
    path: "prisma/migrations",
  },

  // Prisma 7: acá va la URL de la base de datos
  datasource: {
    url: env("DATABASE_URL"),
  },
});

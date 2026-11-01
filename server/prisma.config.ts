// Prisma commands run with Bun: `bunx --bun prisma <command>`.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Not env(), which throws when unset: `prisma generate` needs no database,
    // and it runs on every install, including Netlify's frontend build.
    url: process.env.DATABASE_URL,
  },
});

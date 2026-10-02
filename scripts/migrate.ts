// Applies pending SQL migrations from ./drizzle.
//   Uses the first of DATABASE_URL_UNPOOLED, NETLIFY_DATABASE_URL_UNPOOLED, DATABASE_URL, NETLIFY_DATABASE_URL
//   (direct connections first: DDL shouldn't go through a pooler). None set → local PGlite in ./data/pglite
//   (stop `pnpm dev` first; PGlite is single-process). Safe to re-run: applied migrations are skipped.
import "./env";
import { migrationDatabaseUrl } from "../src/lib/env";
import fs from "node:fs";
import path from "node:path";

const folder = path.join(process.cwd(), "drizzle");

async function main() {
  const target = migrationDatabaseUrl();
  if (target) {
    const { url, source } = target;
    const { Pool, neonConfig } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
    const { default: ws } = await import("ws");
    const { configureNeon } = await import("../src/lib/neon-config");
    configureNeon(neonConfig, ws);
    const pool = new Pool({ connectionString: url });
    await migrate(drizzle({ client: pool }), { migrationsFolder: folder });
    await pool.end();
    console.log(`Migrations applied (${source}, host ${new URL(url).host}).`);
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dir = process.env.PGLITE_DIR ?? path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "pglite");
    fs.mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    await migrate(drizzle({ client }), { migrationsFolder: folder });
    await client.close();
    console.log(`Migrations applied to local PGlite at ${dir}.`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

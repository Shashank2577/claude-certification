import "server-only";
import fs from "node:fs";
import path from "node:path";
import { sql, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { configureNeon } from "./neon-config";
import { databaseUrl, isHostedRuntime } from "./env";

// All SQL lives behind src/lib/repo/*. Two backends share one schema:
//   DATABASE_URL or NETLIFY_DATABASE_URL set → Neon (Postgres over WebSockets; supports interactive transactions)
//   neither set                              → PGlite, an embedded Postgres in ./data/pglite (zero-setup local dev)

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
/** A database handle or an open transaction; repo functions accept either. */
export type Executor = Db;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export function dataDir(): string {
  return process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(process.cwd(), "data");
}

async function connectNeon(url: string): Promise<Db> {
  const [{ Pool, neonConfig }, { drizzle }, { default: ws }] = await Promise.all([
    import("@neondatabase/serverless"),
    import("drizzle-orm/neon-serverless"),
    import("ws"),
  ]);
  configureNeon(neonConfig, ws);
  const pool = new Pool({ connectionString: url });
  return drizzle({ client: pool, schema }) as unknown as Db;
}

async function connectPglite(): Promise<Db> {
  if (isHostedRuntime()) {
    throw new Error("No database configured. Set DATABASE_URL (or provision Netlify DB, which sets NETLIFY_DATABASE_URL).");
  }
  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  const dir = process.env.PGLITE_DIR ?? path.join(dataDir(), "pglite");
  if (dir !== "memory://") fs.mkdirSync(dir, { recursive: true });
  const client = dir === "memory://" ? new PGlite() : new PGlite(dir);
  const db = drizzle({ client, schema });
  // Local only: applying pending migrations on boot is idempotent and keeps `pnpm dev` zero-setup.
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Db;
}

export function connect(): Promise<Db> {
  const url = databaseUrl();
  return url ? connectNeon(url) : connectPglite();
}

// One connection per server process, surviving dev hot reloads.
const g = globalThis as unknown as { __ccpDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!g.__ccpDb) {
    g.__ccpDb = connect().catch((err) => {
      g.__ccpDb = undefined;
      throw err;
    });
  }
  return g.__ccpDb;
}

export async function tx<T>(fn: (q: Executor) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction((t) => fn(t as unknown as Executor));
}

/** Run raw SQL and return typed rows. Cast aggregates in SQL (`::int`) since Postgres returns bigint as text. */
export async function rows<T>(q: SQL, ex?: Executor): Promise<T[]> {
  const db = ex ?? (await getDb());
  const res = (await db.execute(q)) as unknown as { rows: T[] };
  return res.rows;
}

export async function one<T>(q: SQL, ex?: Executor): Promise<T | undefined> {
  return (await rows<T>(q, ex))[0];
}

/** Single integer from an aggregate query aliased as `n`. */
export async function num(q: SQL, ex?: Executor): Promise<number> {
  const r = await one<{ n: number | string | null }>(q, ex);
  return r?.n == null ? 0 : Number(r.n);
}

export { sql, schema };

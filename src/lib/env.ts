// Environment helpers shared by the app and CLI scripts. No framework imports.

/** Runtime connection string. Netlify DB (Neon) provides NETLIFY_DATABASE_URL. */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || undefined;
}

/** Connection for migrations: prefer a direct (unpooled) URL so DDL doesn't go through PgBouncer. */
export function migrationDatabaseUrl(): { url: string; source: string } | undefined {
  const candidates = ["DATABASE_URL_UNPOOLED", "NETLIFY_DATABASE_URL_UNPOOLED", "DATABASE_URL", "NETLIFY_DATABASE_URL"] as const;
  for (const name of candidates) {
    const url = process.env[name];
    if (url) return { url, source: name };
  }
  return undefined;
}

/**
 * True on a hosting platform (build or runtime), where the app must not fall back to the
 * embedded database or write files. Covers Netlify (build: NETLIFY/CONTEXT, functions run on
 * AWS Lambda) and Vercel.
 */
export function isHostedRuntime(): boolean {
  const e = process.env;
  return !!(e.NETLIFY || e.CONTEXT || e.AWS_LAMBDA_FUNCTION_NAME || e.VERCEL);
}

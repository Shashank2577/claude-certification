import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseUrl, isHostedRuntime, migrationDatabaseUrl } from "./env";
import { connect } from "./db";

afterEach(() => vi.unstubAllEnvs());

describe("database URL selection", () => {
  it("uses DATABASE_URL, then Netlify DB's URL", () => {
    vi.stubEnv("NETLIFY_DATABASE_URL", "postgres://pooled/netlify");
    expect(databaseUrl()).toBe("postgres://pooled/netlify");
    vi.stubEnv("DATABASE_URL", "postgres://own/db");
    expect(databaseUrl()).toBe("postgres://own/db");
  });

  it("prefers unpooled URLs for migrations", () => {
    vi.stubEnv("NETLIFY_DATABASE_URL", "postgres://pooled/netlify");
    vi.stubEnv("NETLIFY_DATABASE_URL_UNPOOLED", "postgres://direct/netlify");
    expect(migrationDatabaseUrl()).toEqual({ url: "postgres://direct/netlify", source: "NETLIFY_DATABASE_URL_UNPOOLED" });
    vi.stubEnv("NETLIFY_DATABASE_URL_UNPOOLED", "");
    expect(migrationDatabaseUrl()?.source).toBe("NETLIFY_DATABASE_URL");
  });
});

describe("hosted runtime guard", () => {
  it("detects Netlify builds and functions, and Vercel", () => {
    for (const k of ["NETLIFY", "CONTEXT", "AWS_LAMBDA_FUNCTION_NAME", "VERCEL"]) vi.stubEnv(k, "");
    expect(isHostedRuntime()).toBe(false);
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "___netlify-server-handler");
    expect(isHostedRuntime()).toBe(true);
  });

  it("refuses to fall back to the embedded database when hosted without a URL", async () => {
    vi.stubEnv("NETLIFY", "true");
    await expect(connect()).rejects.toThrow(/No database configured/);
  });
});

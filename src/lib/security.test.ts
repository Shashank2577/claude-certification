// Security regressions: open redirect after login, client-IP trust, and the IP-independent login limiter.
import { beforeAll, describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";
import { pickClientIp } from "./auth-core";
import { getDb } from "./db";
import { hitRateLimit, LOGIN_EMAIL_RULE, LOGIN_RULE, resetRateLimit } from "./repo/rate-limit";

describe("safeNext", () => {
  it.each([
    ["/\\evil.com/x"],
    ["/\t/evil.com"],
    ["/\n/evil.com"],
    ["/\r/evil.com"],
    ["/\x00/evil.com"],
    ["/\x7f/evil.com"],
    ["//evil.com"],
    ["https://evil.com"],
    ["javascript:alert(1)"],
    ["evil.com"],
    [""],
    [undefined],
    [null],
    [42],
  ])("rejects %j", (v) => {
    expect(safeNext(v)).toBe("/today");
  });

  it("keeps an encoded backslash as a local path", () => {
    const r = safeNext("/%5Cevil.com");
    expect(r).toBe("/%5Cevil.com");
    expect(r.startsWith("//")).toBe(false);
  });

  it("preserves a local path with query and hash", () => {
    expect(safeNext("/learn/foundations?x=1#a")).toBe("/learn/foundations?x=1#a");
  });

  it("normalizes dot segments without leaving the site", () => {
    expect(safeNext("/a/../../b")).toBe("/b");
  });

  it("uses a custom fallback", () => {
    expect(safeNext("//evil.com", "/")).toBe("/");
  });
});

describe("pickClientIp", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  const spoof = { "x-nf-client-connection-ip": "6.6.6.6", "x-real-ip": "7.7.7.7", "x-forwarded-for": "9.9.9.9, 1.2.3.4" };

  it("ignores platform headers off-platform and uses the last forwarded hop", () => {
    expect(pickClientIp(h(spoof), {})).toBe("1.2.3.4");
    expect(pickClientIp(h({}), {})).toBe("local");
  });

  it("trusts x-nf-client-connection-ip only on Netlify (build flag or function runtime vars)", () => {
    expect(pickClientIp(h(spoof), { NETLIFY: "true" })).toBe("6.6.6.6");
    expect(pickClientIp(h(spoof), { SITE_ID: "abc", SITE_NAME: "site" })).toBe("6.6.6.6");
  });

  it("trusts x-real-ip only on Vercel", () => {
    expect(pickClientIp(h(spoof), { VERCEL: "1" })).toBe("7.7.7.7");
  });
});

describe("login per-email limiter (database-backed)", () => {
  beforeAll(async () => {
    await getDb();
  });

  it("blocks one account after the limit regardless of rotating IPs", async () => {
    const email = "victim@example.com";
    const t = 5_000_000;
    let ipBlocks = 0;
    let emailBlocks = 0;
    for (let i = 0; i < LOGIN_EMAIL_RULE.limit + 3; i++) {
      const ip = `10.0.0.${i}`; // a fresh IP each attempt, as a header-rotating client would
      if (await hitRateLimit(LOGIN_RULE, `${ip}:${email}`, t + i)) ipBlocks++;
      if (await hitRateLimit(LOGIN_EMAIL_RULE, email, t + i)) emailBlocks++;
    }
    expect(ipBlocks).toBe(0); // the IP-scoped rule alone is bypassed
    expect(emailBlocks).toBe(3); // the email-only rule is not
  });

  it("resets on demand (successful login)", async () => {
    const email = "reset@example.com";
    const t = 6_000_000;
    for (let i = 0; i <= LOGIN_EMAIL_RULE.limit; i++) await hitRateLimit(LOGIN_EMAIL_RULE, email, t);
    expect(await hitRateLimit(LOGIN_EMAIL_RULE, email, t)).toBeGreaterThan(0);
    await resetRateLimit(LOGIN_EMAIL_RULE, email);
    expect(await hitRateLimit(LOGIN_EMAIL_RULE, email, t)).toBe(0);
  });
});

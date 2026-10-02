// Validates a post-login redirect target so it can only point at a path on this site.
// Pure and framework-free so it can be used from server actions, pages and tests.

const BASE = "http://internal.invalid";

/**
 * Returns a same-origin path (pathname + search + hash) or `fallback`.
 * Rejects anything that is not a single-slash relative path, contains a backslash
 * (browsers treat "/\" like "//"), or contains control characters (browsers strip tab/CR/LF,
 * so "/\t/evil.com" becomes "//evil.com").
 */
export function safeNext(value: unknown, fallback = "/today"): string {
  if (typeof value !== "string" || value === "") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  if (/[\x00-\x1f\x7f]/.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  return url.pathname + url.search + url.hash;
}

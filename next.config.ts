import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (local development only) loads WASM and data files from its package directory; don't bundle it.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;

// Shared @neondatabase/serverless setup for the app and CLI scripts.
import type { neonConfig as NeonConfig } from "@neondatabase/serverless";

export function configureNeon(neonConfig: typeof NeonConfig, ws: unknown) {
  // Node runtimes without a global WebSocket need the ws implementation.
  if (typeof WebSocket === "undefined") neonConfig.webSocketConstructor = ws as typeof WebSocket;
  // Local testing only: tunnel to a plain Postgres through a WebSocket proxy (e.g. "localhost:5498").
  const proxy = process.env.NEON_WS_PROXY;
  if (proxy) {
    neonConfig.wsProxy = () => proxy;
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineTLS = false;
    neonConfig.pipelineConnect = false;
  }
}

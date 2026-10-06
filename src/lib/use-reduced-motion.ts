"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;

// The media query cannot be read while server-rendering, so the server and the hydration render
// both answer false. Any value derived from it therefore produces identical markup on both sides,
// and React re-reads the real preference on the first client commit. Use this instead of
// `useReducedMotion` from motion/react, which answers the true value on the very first client
// render and so hydrates mismatch whenever a visual feeds it into `initial`, `style` or a branch.
const getServerSnapshot = () => false;

/** Whether the user prefers reduced motion. False during SSR and the hydration render, live after mount. */
export function useHydratedReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

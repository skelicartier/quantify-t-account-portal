import { useSyncExternalStore } from "react";

/**
 * The page a pressed link is on its way to, known from the moment of the press.
 *
 * The address only changes when the new page starts to arrive. Until then the rail would
 * keep the old section tinted, which reads as "nothing happened". `RouteProgress` records
 * where the press is going; the rail tints that section at once.
 */
let pending: string | null = null;
const listeners = new Set<() => void>();

export function setPendingPath(path: string | null): void {
  if (pending === path) return;
  pending = path;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The pathname being opened, or null when nothing is loading. */
export function usePendingPath(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => pending,
    () => null,
  );
}

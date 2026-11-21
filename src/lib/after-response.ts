import "server-only";

import { after } from "next/server";

/**
 * Run work once the response has gone out, so the person is not kept waiting for it.
 *
 * For bookkeeping only: a session heartbeat, a breadcrumb. Never for anything the page
 * depends on or a check that decides what is shown. Where there is no response to wait
 * for (outside a request, as in a test) the work starts at once and is not awaited; in
 * both cases its failure is its own and reaches nobody.
 */
export function afterResponse(work: () => Promise<unknown>): void {
  const quietly = async () => {
    try {
      await work();
    } catch {
      // Bookkeeping that failed is retried by the next request, not reported to this one.
    }
  };
  try {
    after(quietly);
  } catch {
    void quietly();
  }
}

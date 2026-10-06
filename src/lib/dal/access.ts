import "server-only";

import { cache } from "react";

import { accessHoldOf, type AccessHold } from "@/lib/account/access";
import { getAccountAccessStatus } from "@/lib/admin/access";
import { getCurrentAccount } from "@/lib/dal/account";

/**
 * The hold on the signed-in account — `pending` or `declined` — or null when it is admitted
 * or the console cannot tell.
 *
 * Read from `me` first: the same per-request `me` the shell's role comes from, and the status
 * the gate itself reads. Only when `me` says nothing (an older service, or a failed read) does
 * it fall back to the account overview the layout already loaded from `auth/user`. Never
 * throws: a page that cannot read the status goes on to make its own read, and the API refuses
 * that read with `access_*` if the account is held, which the page shows the same way. The
 * status is a courtesy that saves a refused call; the API is the gate.
 */
export const getCurrentAccessHold = cache(async (): Promise<AccessHold | null> => {
  const fromMe = await getAccountAccessStatus();
  if (fromMe) return accessHoldOf(fromMe);
  try {
    const account = await getCurrentAccount();
    return accessHoldOf(account?.accessStatus);
  } catch {
    return null;
  }
});

/**
 * Thrown by a loader whose page has nothing to show but the hold, when the API refused its
 * read for access. Carries which hold, so the page can say the right sentence.
 */
export class AccountAccessHeldError extends Error {
  readonly hold: AccessHold;

  constructor(hold: AccessHold) {
    super("This account has not been admitted to the product.");
    this.name = "AccountAccessHeldError";
    this.hold = hold;
  }
}

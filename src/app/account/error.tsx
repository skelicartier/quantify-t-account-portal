"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

/**
 * Route-segment boundary for the authenticated account pages.
 *
 * Catches availability failures raised by a page guard — a provider error on the
 * profile read, an absent row, a malformed or cross-owner row — and keeps the console
 * shell rendered. Failures raised by the account *layout* guard cannot be caught by a
 * sibling boundary and are handled by the root `src/app/error.tsx` instead. Either way
 * the visitor sees a generic message rather than a misleading login redirect, and no
 * provider detail is rendered.
 */
export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page-state">
      <h1 id="account-error-heading">We could not refresh this account view</h1>
      <div className="page-content">
        <Callout tone="danger" title="Nothing was changed">
          Your session remains protected and no account changes were applied. Refresh to try again;
          if this keeps happening, sign in again on a trusted device or contact support.
        </Callout>
      </div>
      <div className="page-state__actions">
        <Button variant="primary" onClick={() => reset()}>
          Refresh
        </Button>
        <ButtonLink href="/account">Return to account</ButtonLink>
      </div>
      {error.digest && <p className="page-state__ref">Reference {error.digest}</p>}
    </div>
  );
}

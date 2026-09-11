"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

/**
 * Root boundary.
 *
 * A segment's own `error.tsx` wraps that segment's children, not its layout, so a
 * throw from `src/app/account/layout.tsx` — where `requireCurrentAccount()` runs —
 * can only be caught here. Availability failures such as a provider outage, an
 * unusable identity, or a failed server-client factory therefore render this page
 * instead of falsely redirecting an authenticated visitor to the login route.
 * Only the generic message is shown; no provider detail is rendered.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="auth" id="main-content">
      <div className="auth__main">
        <div className="auth__stack">
          <section className="auth-card" aria-labelledby="root-error-heading">
            <p className="eyebrow">Quantify Terminal</p>
            <h1 className="auth-card__title" id="root-error-heading">
              This secure view could not load
            </h1>
            <p className="auth-card__desc">
              The account service did not finish the request, so no changes were applied. Your
              current session remains protected.
            </p>
            <div className="auth-form">
              <Callout tone="danger" compact>
                Refresh to try again. If the problem continues, sign in again from the login page.
              </Callout>
              <Button variant="primary" block onClick={() => reset()}>
                Refresh
              </Button>
              <ButtonLink href="/login" block>
                Go to sign in
              </ButtonLink>
            </div>
            {error.digest && <p className="auth-card__hint">Reference {error.digest}</p>}
          </section>
        </div>
      </div>
    </main>
  );
}

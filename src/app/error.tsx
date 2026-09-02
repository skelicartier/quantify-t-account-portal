"use client";

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
export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="auth-shell" id="main-content">
      <section className="auth-card" aria-labelledby="root-error-heading">
        <p className="eyebrow">Quantify Terminal</p>
        <h1 id="root-error-heading">Something went wrong</h1>
        <p>
          The service could not be reached, so nothing was changed. If you were signed in, your
          session is still valid.
        </p>
        <button type="button" className="button button--primary" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}

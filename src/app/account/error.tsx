"use client";

/**
 * Route-segment boundary for the authenticated account pages.
 *
 * This catches availability failures raised by the page guard — a provider error
 * on the profile read, an absent row, a malformed or cross-owner row — and keeps
 * the account shell rendered. Failures raised by the account *layout* guard
 * (`requireCurrentAccount()`) cannot be caught by a sibling boundary and are
 * handled by the root `src/app/error.tsx` instead. Either way the visitor sees a
 * generic error page rather than a misleading login redirect, and no provider
 * detail is rendered.
 */
export default function AccountError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="account-main" id="main-content">
      <section className="account-page-heading" aria-labelledby="account-error-heading">
        <p className="eyebrow">Shared account</p>
        <h1 id="account-error-heading">Account data is temporarily unavailable</h1>
        <p>
          Your session is still signed in. The account service could not be reached, so nothing was
          changed. Try again in a moment.
        </p>
      </section>
      <section className="account-form-panel" aria-labelledby="account-error-actions-heading">
        <div>
          <p className="account-card__label">Next step</p>
          <h2 id="account-error-actions-heading">Retry this page</h2>
          <p>If the problem continues, sign out and sign back in, or contact support.</p>
        </div>
        <button type="button" className="button button--primary" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}

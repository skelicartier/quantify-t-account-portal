"use client";

import Link from "next/link";

export default function AdminError() {
  return (
    <main className="account-main" id="main-content">
      <section className="admin-state-panel" aria-labelledby="admin-error-heading">
        <p className="account-card__label">Administration</p>
        <h1 id="admin-error-heading">Admin controls are not ready yet</h1>
        <p>
          The portal could not complete the privileged authorization check through the Account API.
          No administrative data was shown.
        </p>
        <Link className="button" href="/account">
          Return to account
        </Link>
      </section>
    </main>
  );
}

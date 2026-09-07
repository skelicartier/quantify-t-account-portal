"use client";

import Link from "next/link";

export default function AdminError() {
  return (
    <main className="account-main" id="main-content">
      <section className="admin-state-panel" aria-labelledby="admin-error-heading">
        <p className="account-card__label">Administration unavailable</p>
        <h1 id="admin-error-heading">Account administration could not be reached</h1>
        <p>
          The portal could not verify administrative authorization through the Account API. No
          privileged data was shown.
        </p>
        <Link className="button" href="/account">
          Return to account
        </Link>
      </section>
    </main>
  );
}

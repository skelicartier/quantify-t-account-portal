import Link from "next/link";

import type { AccountOverviewDto } from "@/lib/dto/account";

type AccountOverviewProps = {
  account: AccountOverviewDto;
};

function formatDate(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function formatLabel(value: string): string {
  return value
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function AccountOverview({ account }: AccountOverviewProps) {
  return (
    <main className="account-main" id="main-content">
      <section className="account-hero" aria-labelledby="account-overview-heading">
        <div>
          <p className="eyebrow">Cloud account</p>
          <h1 id="account-overview-heading">Account overview</h1>
          <p>
            Review the identity currently connected to Quantify Terminal. Profile and preference
            controls remain UUID-owned and server-authorized.
          </p>
        </div>
        <div className="account-avatar" aria-hidden="true">
          {account.initials}
        </div>
      </section>

      {account.profileState !== "ready" && (
        <div className="account-notice" role="status">
          {account.profileState === "missing"
            ? "Your verified identity is active, but its cloud profile is not available yet."
            : "Your verified identity is available. Cloud profile details could not be refreshed."}
        </div>
      )}

      <section className="account-grid" aria-label="Account summary">
        <article className="account-card account-card--identity">
          <p className="account-card__label">Account holder</p>
          <h2>{account.displayName}</h2>
          <p className="account-card__email">{account.email ?? "Email unavailable"}</p>
          <dl className="account-details">
            <div>
              <dt>Email verification</dt>
              <dd>{account.emailConfirmed ? "Confirmed" : "Not confirmed"}</dd>
            </div>
            <div>
              <dt>Account ID</dt>
              <dd className="account-id">{account.userId}</dd>
            </div>
          </dl>
        </article>
        <article className="account-card">
          <p className="account-card__label">Account standing</p>
          <dl className="account-metrics">
            <div>
              <dt>Status</dt>
              <dd className={`status-value status-value--${account.status}`}>
                {formatLabel(account.status)}
              </dd>
            </div>
            <div>
              <dt>Plan</dt>
              <dd>{formatLabel(account.subscriptionTier)}</dd>
            </div>
          </dl>
        </article>
        <article className="account-card">
          <p className="account-card__label">Activity</p>
          <dl className="account-details">
            <div>
              <dt>Member since</dt>
              <dd>{formatDate(account.memberSince)}</dd>
            </div>
            <div>
              <dt>Last sign-in</dt>
              <dd>{formatDate(account.lastSignInAt)}</dd>
            </div>
          </dl>
        </article>
      </section>

      <aside className="account-complete">
        <div>
          <p className="account-card__label">Account controls</p>
          <h2>Account controls are available</h2>
          <p>
            Update account details and preferences here. Session history and security events use the
            same verified cloud identity.
          </p>
        </div>
        <div className="account-complete__actions">
          <Link className="button button--primary" href="/account/profile">
            Edit profile
          </Link>
          <Link className="button" href="/admin">
            Admin panel
          </Link>
          <Link className="button" href="/account/preferences">
            Preferences
          </Link>
          <Link className="button" href="/account/sessions">
            Sessions
          </Link>
          <Link className="button" href="/account/activity">
            Activity
          </Link>
        </div>
      </aside>
    </main>
  );
}

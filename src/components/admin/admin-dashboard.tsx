import Link from "next/link";

import { formatAdminLabel, formatAdminNumber } from "@/components/admin/admin-format";
import type { AdminDashboardAccess } from "@/lib/admin/access";

type AdminDashboardProps = {
  access: AdminDashboardAccess;
};

type AuthorizedAdminDashboardAccess = Extract<AdminDashboardAccess, { status: "authorized" }>;

function roleReportStatus(access: AdminDashboardAccess): string {
  if (access.status !== "authorized") return "Not available";
  if (!access.roleReport) return "Not permitted";
  if (!access.roleReport.legacy_source_available) return "Legacy store unreadable";
  if (access.roleReport.legacy_unparsable_entry_count > 0) return "Legacy entries need review";
  if (access.roleReport.legacy_retirement_ready) return "Ready for reviewed cutover";
  return "Differences need review";
}

function AdminMetricsSummary({ metrics }: { metrics: AuthorizedAdminDashboardAccess["metrics"] }) {
  const flaggedEvents =
    (metrics.auth_events_24h.by_outcome.failure ?? 0) +
    (metrics.auth_events_24h.by_outcome.blocked ?? 0);
  const metricsTruncated =
    metrics.limits.accounts_truncated ||
    metrics.limits.sessions_truncated ||
    metrics.limits.events_truncated;

  return (
    <section className="admin-section" aria-labelledby="admin-metrics-heading">
      <div className="admin-section__heading">
        <div>
          <p className="account-card__label">Metrics</p>
          <h2 id="admin-metrics-heading">Account health</h2>
        </div>
        <time dateTime={metrics.generated_at}>{metrics.generated_at}</time>
      </div>
      <div className="admin-report-grid">
        <div>
          <span>Total accounts</span>
          <strong>{formatAdminNumber(metrics.accounts.total)}</strong>
        </div>
        <div>
          <span>Active accounts</span>
          <strong>{formatAdminNumber(metrics.accounts.active)}</strong>
        </div>
        <div>
          <span>New in 24h</span>
          <strong>{formatAdminNumber(metrics.accounts.created_24h)}</strong>
        </div>
        <div>
          <span>Logged in 24h</span>
          <strong>{formatAdminNumber(metrics.accounts.logged_in_24h)}</strong>
        </div>
        <div>
          <span>Active sessions</span>
          <strong>{formatAdminNumber(metrics.sessions.active)}</strong>
        </div>
        <div>
          <span>Expired sessions</span>
          <strong>{formatAdminNumber(metrics.sessions.expired)}</strong>
        </div>
        <div>
          <span>Revoked sessions</span>
          <strong>{formatAdminNumber(metrics.sessions.revoked)}</strong>
        </div>
        <div>
          <span>Auth events 24h</span>
          <strong>{formatAdminNumber(metrics.auth_events_24h.total)}</strong>
        </div>
        <div>
          <span>Flagged events</span>
          <strong>{formatAdminNumber(flaggedEvents)}</strong>
        </div>
        <div>
          <span>Portal sessions</span>
          <strong>{formatAdminNumber(metrics.sessions.by_source.portal ?? 0)}</strong>
        </div>
        <div>
          <span>Desktop sessions</span>
          <strong>{formatAdminNumber(metrics.sessions.by_source.desktop ?? 0)}</strong>
        </div>
        <div>
          <span>Bounded rows</span>
          <strong>
            {metricsTruncated ? "Partial" : formatAdminNumber(metrics.limits.row_limit)}
          </strong>
        </div>
      </div>
    </section>
  );
}

export function AdminDashboard({ access }: AdminDashboardProps) {
  const { me } = access;
  const roleReport = access.status === "authorized" ? access.roleReport : null;

  return (
    <main className="account-main admin-main" id="main-content">
      <section className="account-hero admin-hero" aria-labelledby="admin-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 id="admin-heading">Control center</h1>
          <p>
            Administrative access is decided by the Account API using the Supabase Auth UUID, active
            account state, canonical role, and returned capabilities.
          </p>
        </div>
        <div className={`admin-role-badge admin-role-badge--${me.role.effective}`}>
          {formatAdminLabel(me.role.effective)}
        </div>
      </section>

      {access.status === "forbidden" && (
        <section className="admin-state-panel" aria-labelledby="admin-forbidden-heading">
          <p className="account-card__label">Access denied</p>
          <h2 id="admin-forbidden-heading">This account is not authorized for administration</h2>
          <p>
            The Account API returned an active account without the required administration
            capability.
          </p>
          <Link className="button" href="/account">
            Return to account
          </Link>
        </section>
      )}

      {access.status === "mfa-required" && (
        <section className="admin-state-panel" aria-labelledby="admin-mfa-heading">
          <p className="account-card__label">Additional verification</p>
          <h2 id="admin-mfa-heading">A verified second factor is required</h2>
          <p>
            Owner, Admin, and Support access requires an AAL2 session before privileged views are
            shown.
          </p>
          <Link className="button button--primary" href="/account/security">
            Open security settings
          </Link>
        </section>
      )}

      {access.status === "authorized" && (
        <>
          <section className="admin-summary-grid" aria-label="Administration summary">
            <article className="admin-card">
              <p className="account-card__label">Operator</p>
              <h2>{me.user.email}</h2>
              <dl className="account-details">
                <div>
                  <dt>Account ID</dt>
                  <dd className="account-id">{me.user.user_id}</dd>
                </div>
                <div>
                  <dt>Environment</dt>
                  <dd>{formatAdminLabel(me.environment)}</dd>
                </div>
              </dl>
            </article>
            <article className="admin-card">
              <p className="account-card__label">Role authority</p>
              <dl className="account-metrics">
                <div>
                  <dt>Effective role</dt>
                  <dd>{formatAdminLabel(me.role.effective)}</dd>
                </div>
                <div>
                  <dt>Role mismatch</dt>
                  <dd>{formatAdminLabel(me.role.mismatch)}</dd>
                </div>
                <div>
                  <dt>Break-glass</dt>
                  <dd>{me.role.break_glass ? "In use" : "No"}</dd>
                </div>
              </dl>
            </article>
            <article className="admin-card">
              <p className="account-card__label">Role report</p>
              <dl className="account-metrics">
                <div>
                  <dt>Status</dt>
                  <dd>{roleReportStatus(access)}</dd>
                </div>
                <div>
                  <dt>Total users</dt>
                  <dd>{formatAdminNumber(roleReport?.total_users)}</dd>
                </div>
                <div>
                  <dt>Blocking entries</dt>
                  <dd>{formatAdminNumber(roleReport?.entries.length)}</dd>
                </div>
              </dl>
              {roleReport && (
                <div className="admin-card__actions">
                  <Link className="button" href="/admin/roles">
                    Open role report
                  </Link>
                </div>
              )}
            </article>
          </section>

          <AdminMetricsSummary metrics={access.metrics} />

          <section className="admin-section" aria-labelledby="admin-capabilities-heading">
            <div className="admin-section__heading">
              <p className="account-card__label">Capabilities</p>
              <h2 id="admin-capabilities-heading">Backend-granted controls</h2>
            </div>
            <ul className="admin-token-list">
              {me.capabilities.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
          </section>

          {roleReport && (
            <section className="admin-section" aria-labelledby="admin-role-report-heading">
              <div className="admin-section__heading">
                <p className="account-card__label">Reconciliation</p>
                <h2 id="admin-role-report-heading">Role-store differences</h2>
              </div>
              <div className="admin-report-grid">
                <div>
                  <span>Blob entries</span>
                  <strong>{formatAdminNumber(roleReport.legacy_blob_entry_count)}</strong>
                </div>
                <div>
                  <span>Unparsable</span>
                  <strong>{formatAdminNumber(roleReport.legacy_unparsable_entry_count)}</strong>
                </div>
                <div>
                  <span>Bootstrap admins</span>
                  <strong>{formatAdminNumber(roleReport.legacy_bootstrap_count)}</strong>
                </div>
                <div>
                  <span>Legacy entries</span>
                  <strong>{formatAdminNumber(roleReport.legacy_entry_count)}</strong>
                </div>
              </div>

              {roleReport.entries.length > 0 ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Effective</th>
                        <th>Database</th>
                        <th>Legacy</th>
                        <th>Mismatch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roleReport.entries.map((entry) => (
                        <tr key={entry.user_id}>
                          <td className="account-id">{entry.user_id}</td>
                          <td>{formatAdminLabel(entry.effective_role)}</td>
                          <td>
                            {entry.database_role ? formatAdminLabel(entry.database_role) : "None"}
                          </td>
                          <td>
                            {entry.legacy_role ? formatAdminLabel(entry.legacy_role) : "None"}
                          </td>
                          <td>{formatAdminLabel(entry.mismatch)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="admin-empty-state">
                  No blocking role-store differences were returned by the Account API.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

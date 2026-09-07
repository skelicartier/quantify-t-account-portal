import Link from "next/link";

import { formatAdminLabel, formatAdminNumber } from "@/components/admin/admin-format";
import type { AdminRoleReportAccess } from "@/lib/admin/access";

type AdminRoleReportProps = {
  access: AdminRoleReportAccess;
};

function reportStatus(access: Extract<AdminRoleReportAccess, { status: "authorized" }>): string {
  const { roleReport } = access;
  if (!roleReport.legacy_source_available) return "Legacy store unreadable";
  if (roleReport.legacy_unparsable_entry_count > 0) return "Legacy entries need review";
  if (roleReport.legacy_retirement_ready) return "Ready for reviewed cutover";
  return "Differences need review";
}

function orderedRecordEntries(record: Record<string, number>): Array<[string, number]> {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
}

export function AdminRoleReport({ access }: AdminRoleReportProps) {
  const { me } = access;

  return (
    <main className="account-main admin-main" id="main-content">
      <section className="account-hero admin-hero" aria-labelledby="admin-roles-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 id="admin-roles-heading">Role reconciliation</h1>
          <p>Canonical roles, legacy projections, and retirement blockers from the Account API.</p>
        </div>
        <div className={`admin-role-badge admin-role-badge--${me.role.effective}`}>
          {formatAdminLabel(me.role.effective)}
        </div>
      </section>

      {access.status === "forbidden" && (
        <section className="admin-state-panel" aria-labelledby="admin-roles-forbidden-heading">
          <p className="account-card__label">Access denied</p>
          <h2 id="admin-roles-forbidden-heading">
            This account is not authorized for administration
          </h2>
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
        <section className="admin-state-panel" aria-labelledby="admin-roles-mfa-heading">
          <p className="account-card__label">Additional verification</p>
          <h2 id="admin-roles-mfa-heading">A verified second factor is required</h2>
          <p>
            Owner, Admin, and Support access requires an AAL2 session before role data is shown.
          </p>
          <Link className="button button--primary" href="/account/security">
            Open security settings
          </Link>
        </section>
      )}

      {access.status === "capability-required" && (
        <section className="admin-state-panel" aria-labelledby="admin-roles-capability-heading">
          <p className="account-card__label">Capability required</p>
          <h2 id="admin-roles-capability-heading">Role reconciliation is not available</h2>
          <p>The Account API did not grant {access.capability} to this administrative session.</p>
          <Link className="button" href="/admin">
            Return to dashboard
          </Link>
        </section>
      )}

      {access.status === "authorized" && (
        <>
          <section className="admin-summary-grid" aria-label="Role reconciliation summary">
            <article className="admin-card">
              <p className="account-card__label">Report state</p>
              <h2>{reportStatus(access)}</h2>
              <dl className="account-details">
                <div>
                  <dt>Total users</dt>
                  <dd>{formatAdminNumber(access.roleReport.total_users)}</dd>
                </div>
                <div>
                  <dt>Correlation ID</dt>
                  <dd className="account-id">{access.roleReport.correlation_id}</dd>
                </div>
              </dl>
            </article>
            <article className="admin-card">
              <p className="account-card__label">Legacy registry</p>
              <dl className="account-metrics">
                <div>
                  <dt>Blob entries</dt>
                  <dd>{formatAdminNumber(access.roleReport.legacy_blob_entry_count)}</dd>
                </div>
                <div>
                  <dt>Legacy entries</dt>
                  <dd>{formatAdminNumber(access.roleReport.legacy_entry_count)}</dd>
                </div>
                <div>
                  <dt>Unparsable</dt>
                  <dd>{formatAdminNumber(access.roleReport.legacy_unparsable_entry_count)}</dd>
                </div>
              </dl>
            </article>
            <article className="admin-card">
              <p className="account-card__label">Review scope</p>
              <h2>{access.includeMatches ? "All returned entries" : "Differences only"}</h2>
              <div className="admin-view-toggle" aria-label="Role report scope">
                <Link
                  href="/admin/roles"
                  aria-current={!access.includeMatches ? "page" : undefined}
                >
                  Differences
                </Link>
                <Link
                  href="/admin/roles?include=matches"
                  aria-current={access.includeMatches ? "page" : undefined}
                >
                  All entries
                </Link>
              </div>
            </article>
          </section>

          <section className="admin-section" aria-labelledby="admin-roles-counts-heading">
            <div className="admin-section__heading">
              <p className="account-card__label">Role distribution</p>
              <h2 id="admin-roles-counts-heading">Effective roles</h2>
            </div>
            <ul className="admin-stat-list">
              {orderedRecordEntries(access.roleReport.counts_by_role).map(([role, count]) => (
                <li key={role}>
                  <span>{formatAdminLabel(role)}</span>
                  <strong>{formatAdminNumber(count)}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section className="admin-section" aria-labelledby="admin-roles-mismatch-heading">
            <div className="admin-section__heading">
              <p className="account-card__label">Projection health</p>
              <h2 id="admin-roles-mismatch-heading">Mismatch classes</h2>
            </div>
            <ul className="admin-stat-list">
              {orderedRecordEntries(access.roleReport.counts_by_mismatch).map(
                ([mismatch, count]) => (
                  <li key={mismatch}>
                    <span>{formatAdminLabel(mismatch)}</span>
                    <strong>{formatAdminNumber(count)}</strong>
                  </li>
                ),
              )}
            </ul>
          </section>

          <section className="admin-section" aria-labelledby="admin-roles-entries-heading">
            <div className="admin-section__heading">
              <p className="account-card__label">
                {access.includeMatches ? "Reviewed entries" : "Blocking entries"}
              </p>
              <h2 id="admin-roles-entries-heading">Role records</h2>
            </div>
            <div className="admin-report-note">
              <span>
                Break-glass identities{" "}
                {access.roleReport.break_glass_disclosed ? "included" : "withheld"}
              </span>
              <span>
                Bootstrap admins {formatAdminNumber(access.roleReport.legacy_bootstrap_count)}
              </span>
            </div>

            {access.roleReport.entries.length > 0 ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Effective</th>
                      <th>Database</th>
                      <th>Legacy</th>
                      <th>Mismatch</th>
                      <th>Break-glass</th>
                    </tr>
                  </thead>
                  <tbody>
                    {access.roleReport.entries.map((entry) => (
                      <tr key={entry.user_id}>
                        <td className="account-id">{entry.user_id}</td>
                        <td>{formatAdminLabel(entry.effective_role)}</td>
                        <td>
                          {entry.database_role ? formatAdminLabel(entry.database_role) : "None"}
                        </td>
                        <td>{entry.legacy_role ? formatAdminLabel(entry.legacy_role) : "None"}</td>
                        <td>{formatAdminLabel(entry.mismatch)}</td>
                        <td>{entry.break_glass ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="admin-empty-state">
                No role records were returned for the selected report scope.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

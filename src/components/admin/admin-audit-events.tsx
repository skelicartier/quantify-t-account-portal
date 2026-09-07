import Link from "next/link";

import { formatAdminLabel, formatAdminNumber } from "@/components/admin/admin-format";
import type { AdminAuditEventsAccess } from "@/lib/admin/access";
import type { AccountApiAdminAuditFilters } from "@/lib/admin/account-api";

type AdminAuditEventsProps = {
  access: AdminAuditEventsAccess;
};

type AuthorizedAdminAuditEventsAccess = Extract<AdminAuditEventsAccess, { status: "authorized" }>;

const FILTER_FIELDS = [
  { name: "event_type", label: "Event" },
  { name: "outcome", label: "Outcome" },
  { name: "source", label: "Source" },
  { name: "subject_user_id", label: "Subject" },
  { name: "actor_user_id", label: "Actor" },
  { name: "session_id", label: "Session" },
  { name: "request_id", label: "Request" },
] as const satisfies readonly { name: keyof AccountApiAdminAuditFilters; label: string }[];

function pageHref(offset: number, limit: number, filters: AccountApiAdminAuditFilters): string {
  const params = new URLSearchParams({ offset: String(Math.max(0, offset)), limit: String(limit) });
  for (const [name, value] of Object.entries(filters)) {
    if (value) params.set(name, value);
  }
  return `/admin/audit?${params.toString()}`;
}

function filterValue(
  filters: AccountApiAdminAuditFilters,
  name: keyof AccountApiAdminAuditFilters,
): string {
  return filters[name] ?? "";
}

function AuditTable({ access }: { access: AuthorizedAdminAuditEventsAccess }) {
  const { auditEvents } = access;
  if (auditEvents.events.length === 0) {
    return <p className="admin-empty-state">No audit events were returned.</p>;
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Outcome</th>
            <th>Actor</th>
            <th>Subject</th>
            <th>Session</th>
            <th>Request</th>
            <th>Occurred</th>
          </tr>
        </thead>
        <tbody>
          {auditEvents.events.map((event) => (
            <tr key={event.id}>
              <td>{formatAdminLabel(event.event_type)}</td>
              <td>{formatAdminLabel(event.outcome)}</td>
              <td className="account-id">{event.actor_user_id || event.summary.actor_role}</td>
              <td className="account-id">{event.subject_user_id || "None"}</td>
              <td className="account-id">{event.session_id || "None"}</td>
              <td className="account-id">{event.request_id || "None"}</td>
              <td>{event.occurred_at || "Unknown"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminAuditEvents({ access }: AdminAuditEventsProps) {
  const { me } = access;

  return (
    <main className="account-main admin-main" id="main-content">
      <section className="account-hero admin-hero" aria-labelledby="admin-audit-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 id="admin-audit-heading">Audit</h1>
          <p>Security events sourced from the Account API.</p>
        </div>
        <div className={`admin-role-badge admin-role-badge--${me.role.effective}`}>
          {formatAdminLabel(me.role.effective)}
        </div>
      </section>

      {access.status === "forbidden" && (
        <section className="admin-state-panel" aria-labelledby="admin-audit-forbidden-heading">
          <p className="account-card__label">Access denied</p>
          <h2 id="admin-audit-forbidden-heading">
            This account is not authorized for administration
          </h2>
          <Link className="button" href="/account">
            Return to account
          </Link>
        </section>
      )}

      {access.status === "mfa-required" && (
        <section className="admin-state-panel" aria-labelledby="admin-audit-mfa-heading">
          <p className="account-card__label">Additional verification</p>
          <h2 id="admin-audit-mfa-heading">A verified second factor is required</h2>
          <Link className="button button--primary" href="/account/security">
            Open security settings
          </Link>
        </section>
      )}

      {access.status === "capability-required" && (
        <section className="admin-state-panel" aria-labelledby="admin-audit-capability-heading">
          <p className="account-card__label">Capability required</p>
          <h2 id="admin-audit-capability-heading">Audit access is not granted</h2>
          <p>{access.capability}</p>
        </section>
      )}

      {access.status === "authorized" && (
        <>
          <section className="admin-summary-grid" aria-label="Audit summary">
            <article className="admin-card">
              <p className="account-card__label">Events</p>
              <h2>{formatAdminNumber(access.auditEvents.events.length)} returned</h2>
              <dl className="account-details">
                <div>
                  <dt>Generated</dt>
                  <dd>{access.auditEvents.generated_at}</dd>
                </div>
                <div>
                  <dt>Correlation ID</dt>
                  <dd className="account-id">{access.auditEvents.correlation_id}</dd>
                </div>
              </dl>
            </article>
            <article className="admin-card">
              <p className="account-card__label">Pagination</p>
              <dl className="account-metrics">
                <div>
                  <dt>Limit</dt>
                  <dd>{formatAdminNumber(access.auditEvents.pagination.limit)}</dd>
                </div>
                <div>
                  <dt>Offset</dt>
                  <dd>{formatAdminNumber(access.auditEvents.pagination.offset)}</dd>
                </div>
                <div>
                  <dt>Next page</dt>
                  <dd>{access.auditEvents.pagination.has_more ? "Available" : "No"}</dd>
                </div>
              </dl>
            </article>
            <article className="admin-card">
              <p className="account-card__label">Role</p>
              <h2>{formatAdminLabel(me.role.effective)}</h2>
              <dl className="account-details">
                <div>
                  <dt>Capability</dt>
                  <dd>audit:read</dd>
                </div>
              </dl>
            </article>
          </section>

          <section className="admin-section" aria-labelledby="admin-audit-filters-heading">
            <div className="admin-section__heading">
              <div>
                <p className="account-card__label">Filters</p>
                <h2 id="admin-audit-filters-heading">Event filters</h2>
              </div>
            </div>
            <form className="admin-filter-form" action="/admin/audit">
              <input type="hidden" name="limit" value={access.limit} />
              {FILTER_FIELDS.map((field) => (
                <label key={field.name}>
                  <span>{field.label}</span>
                  <input
                    name={field.name}
                    defaultValue={filterValue(access.filters, field.name)}
                    autoComplete="off"
                  />
                </label>
              ))}
              <button className="button button--primary" type="submit">
                Apply
              </button>
              <Link className="button" href="/admin/audit">
                Clear
              </Link>
            </form>
          </section>

          <section className="admin-section" aria-labelledby="admin-audit-table-heading">
            <div className="admin-section__heading">
              <div>
                <p className="account-card__label">Audit</p>
                <h2 id="admin-audit-table-heading">Event records</h2>
              </div>
              <div className="admin-pagination">
                {access.auditEvents.pagination.offset > 0 && (
                  <Link
                    className="button"
                    href={pageHref(
                      Math.max(
                        0,
                        access.auditEvents.pagination.offset - access.auditEvents.pagination.limit,
                      ),
                      access.auditEvents.pagination.limit,
                      access.filters,
                    )}
                  >
                    Previous
                  </Link>
                )}
                {access.auditEvents.pagination.has_more &&
                  access.auditEvents.pagination.next_offset !== null && (
                    <Link
                      className="button"
                      href={pageHref(
                        access.auditEvents.pagination.next_offset,
                        access.auditEvents.pagination.limit,
                        access.filters,
                      )}
                    >
                      Next
                    </Link>
                  )}
              </div>
            </div>
            <AuditTable access={access} />
          </section>
        </>
      )}
    </main>
  );
}

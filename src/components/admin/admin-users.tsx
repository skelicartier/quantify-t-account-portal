import Link from "next/link";

import { formatAdminLabel, formatAdminNumber } from "@/components/admin/admin-format";
import type { AdminUsersAccess } from "@/lib/admin/access";

type AdminUsersProps = {
  access: AdminUsersAccess;
};

type AuthorizedAdminUsersAccess = Extract<AdminUsersAccess, { status: "authorized" }>;

function accountName(user: AuthorizedAdminUsersAccess["users"]["users"][number]["user"]): string {
  return user.display_name || user.email || "Unnamed account";
}

function pageHref(offset: number, limit: number): string {
  const params = new URLSearchParams({ offset: String(Math.max(0, offset)), limit: String(limit) });
  return `/admin/users?${params.toString()}`;
}

export function AdminUsers({ access }: AdminUsersProps) {
  const { me } = access;

  return (
    <main className="account-main admin-main" id="main-content">
      <section className="account-hero admin-hero" aria-labelledby="admin-users-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 id="admin-users-heading">Users</h1>
          <p>Account directory sourced from the Account API.</p>
        </div>
        <div className={`admin-role-badge admin-role-badge--${me.role.effective}`}>
          {formatAdminLabel(me.role.effective)}
        </div>
      </section>

      {access.status === "forbidden" && (
        <section className="admin-state-panel" aria-labelledby="admin-users-forbidden-heading">
          <p className="account-card__label">Access denied</p>
          <h2 id="admin-users-forbidden-heading">
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
        <section className="admin-state-panel" aria-labelledby="admin-users-mfa-heading">
          <p className="account-card__label">Additional verification</p>
          <h2 id="admin-users-mfa-heading">A verified second factor is required</h2>
          <p>
            Owner, Admin, and Support access requires an AAL2 session before user data is shown.
          </p>
          <Link className="button button--primary" href="/account/security">
            Open security settings
          </Link>
        </section>
      )}

      {access.status === "authorized" && (
        <>
          <section className="admin-summary-grid" aria-label="User directory summary">
            <article className="admin-card">
              <p className="account-card__label">Directory</p>
              <h2>{formatAdminNumber(access.users.users.length)} returned</h2>
              <dl className="account-details">
                <div>
                  <dt>Generated</dt>
                  <dd>{access.users.generated_at}</dd>
                </div>
                <div>
                  <dt>Correlation ID</dt>
                  <dd className="account-id">{access.users.correlation_id}</dd>
                </div>
              </dl>
            </article>
            <article className="admin-card">
              <p className="account-card__label">Pagination</p>
              <dl className="account-metrics">
                <div>
                  <dt>Limit</dt>
                  <dd>{formatAdminNumber(access.users.pagination.limit)}</dd>
                </div>
                <div>
                  <dt>Offset</dt>
                  <dd>{formatAdminNumber(access.users.pagination.offset)}</dd>
                </div>
                <div>
                  <dt>Next page</dt>
                  <dd>{access.users.pagination.has_more ? "Available" : "No"}</dd>
                </div>
              </dl>
            </article>
            <article className="admin-card">
              <p className="account-card__label">Role</p>
              <h2>{formatAdminLabel(me.role.effective)}</h2>
              <dl className="account-details">
                <div>
                  <dt>Capability</dt>
                  <dd>account:read-any</dd>
                </div>
              </dl>
            </article>
          </section>

          <section className="admin-section" aria-labelledby="admin-users-table-heading">
            <div className="admin-section__heading">
              <div>
                <p className="account-card__label">Directory</p>
                <h2 id="admin-users-table-heading">Account records</h2>
              </div>
              <div className="admin-pagination">
                {access.users.pagination.offset > 0 && (
                  <Link
                    className="button"
                    href={pageHref(
                      Math.max(0, access.users.pagination.offset - access.users.pagination.limit),
                      access.users.pagination.limit,
                    )}
                  >
                    Previous
                  </Link>
                )}
                {access.users.pagination.has_more &&
                  access.users.pagination.next_offset !== null && (
                    <Link
                      className="button"
                      href={pageHref(
                        access.users.pagination.next_offset,
                        access.users.pagination.limit,
                      )}
                    >
                      Next
                    </Link>
                  )}
              </div>
            </div>

            {access.users.users.length > 0 ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Role</th>
                      <th>Plan</th>
                      <th>Last login</th>
                      <th>Created</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {access.users.users.map(({ user, role }) => (
                      <tr key={user.user_id}>
                        <td>{user.email || "No email"}</td>
                        <td>{accountName(user)}</td>
                        <td>{user.is_active ? "Active" : "Inactive"}</td>
                        <td>{formatAdminLabel(role.effective)}</td>
                        <td>{formatAdminLabel(user.subscription_tier || "unknown")}</td>
                        <td>{user.last_login_at || "Never"}</td>
                        <td>{user.created_at || "Unknown"}</td>
                        <td>
                          <Link className="admin-row-link" href={`/admin/users/${user.user_id}`}>
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="admin-empty-state">No account records were returned.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

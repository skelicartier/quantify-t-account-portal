import Link from "next/link";

import { AdminUserActivationForm } from "@/components/admin/admin-user-activation-form";
import { AdminUserSessionRevokeForm } from "@/components/admin/admin-user-session-revoke-form";
import { formatAdminLabel, formatAdminNumber } from "@/components/admin/admin-format";
import {
  USER_ACTIVATION_CAPABILITY,
  USER_SESSION_REVOKE_CAPABILITY,
} from "@/lib/admin/account-api";
import type { AdminUserDetailAccess } from "@/lib/admin/access";
import type { AdminUserActivationState } from "@/lib/admin/user-activation";
import type { AdminUserSessionRevocationState } from "@/lib/admin/user-session-revocation";

type AdminUserDetailProps = {
  access: AdminUserDetailAccess;
  activationAction?: (
    state: AdminUserActivationState,
    formData: FormData,
  ) => Promise<AdminUserActivationState>;
  sessionRevokeAction?: (
    state: AdminUserSessionRevocationState,
    formData: FormData,
  ) => Promise<AdminUserSessionRevocationState>;
};

type AuthorizedAdminUserDetailAccess = Extract<AdminUserDetailAccess, { status: "authorized" }>;

function accountName(user: AuthorizedAdminUserDetailAccess["detail"]["user"]): string {
  return user.display_name || user.email || "Unnamed account";
}

function sessionState(
  session: AuthorizedAdminUserDetailAccess["detail"]["sessions"][number],
): string {
  if (session.revoked_at) return "Revoked";
  if (session.expires_at && Date.parse(session.expires_at) <= Date.now()) return "Expired";
  return "Active";
}

export function AdminUserDetail({
  access,
  activationAction,
  sessionRevokeAction,
}: AdminUserDetailProps) {
  const { me } = access;
  const detail = access.status === "authorized" ? access.detail : null;
  const canChangeActivation =
    Boolean(detail) &&
    me.user.user_id !== detail?.user.user_id &&
    me.capabilities.includes(USER_ACTIVATION_CAPABILITY);
  const canRevokeSessions =
    Boolean(detail) &&
    me.user.user_id !== detail?.user.user_id &&
    me.capabilities.includes(USER_SESSION_REVOKE_CAPABILITY);

  return (
    <main className="account-main admin-main" id="main-content">
      <section className="account-hero admin-hero" aria-labelledby="admin-user-detail-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 id="admin-user-detail-heading">
            {detail ? accountName(detail.user) : "User detail"}
          </h1>
          <p>Read-only account state from the Account API.</p>
        </div>
        <div className={`admin-role-badge admin-role-badge--${me.role.effective}`}>
          {formatAdminLabel(me.role.effective)}
        </div>
      </section>

      {access.status === "forbidden" && (
        <section className="admin-state-panel" aria-labelledby="admin-user-forbidden-heading">
          <p className="account-card__label">Access denied</p>
          <h2 id="admin-user-forbidden-heading">
            This account is not authorized for administration
          </h2>
          <Link className="button" href="/account">
            Return to account
          </Link>
        </section>
      )}

      {access.status === "mfa-required" && (
        <section className="admin-state-panel" aria-labelledby="admin-user-mfa-heading">
          <p className="account-card__label">Additional verification</p>
          <h2 id="admin-user-mfa-heading">A verified second factor is required</h2>
          <Link className="button button--primary" href="/account/security">
            Open security settings
          </Link>
        </section>
      )}

      {access.status === "not-found" && (
        <section className="admin-state-panel" aria-labelledby="admin-user-not-found-heading">
          <p className="account-card__label">Not found</p>
          <h2 id="admin-user-not-found-heading">No account record was returned</h2>
          <Link className="button" href="/admin/users">
            Return to users
          </Link>
        </section>
      )}

      {detail && (
        <>
          <section className="admin-summary-grid" aria-label="User detail summary">
            <article className="admin-card">
              <p className="account-card__label">Account</p>
              <h2>{detail.user.email || "No email"}</h2>
              <dl className="account-details">
                <div>
                  <dt>User ID</dt>
                  <dd className="account-id">{detail.user.user_id}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{detail.user.is_active ? "Active" : "Inactive"}</dd>
                </div>
              </dl>
            </article>
            <article className="admin-card">
              <p className="account-card__label">Role</p>
              <h2>{formatAdminLabel(detail.role.effective)}</h2>
              <dl className="account-metrics">
                <div>
                  <dt>Database</dt>
                  <dd>{detail.role.database ? formatAdminLabel(detail.role.database) : "None"}</dd>
                </div>
                <div>
                  <dt>Legacy</dt>
                  <dd>{detail.role.legacy ? formatAdminLabel(detail.role.legacy) : "None"}</dd>
                </div>
                <div>
                  <dt>Mismatch</dt>
                  <dd>{formatAdminLabel(detail.role.mismatch)}</dd>
                </div>
              </dl>
            </article>
            <article className="admin-card">
              <p className="account-card__label">Activity</p>
              <dl className="account-metrics">
                <div>
                  <dt>Sessions</dt>
                  <dd>{formatAdminNumber(detail.sessions.length)}</dd>
                </div>
                <div>
                  <dt>Events</dt>
                  <dd>{formatAdminNumber(detail.activity.length)}</dd>
                </div>
                <div>
                  <dt>Last login</dt>
                  <dd>{detail.user.last_login_at || "Never"}</dd>
                </div>
              </dl>
              {canChangeActivation && activationAction && (
                <AdminUserActivationForm
                  userId={detail.user.user_id}
                  isActive={detail.user.is_active}
                  action={activationAction}
                />
              )}
            </article>
          </section>

          <section className="admin-section" aria-labelledby="admin-user-sessions-heading">
            <div className="admin-section__heading">
              <div>
                <p className="account-card__label">Sessions</p>
                <h2 id="admin-user-sessions-heading">Recent cloud sessions</h2>
              </div>
              <Link className="button" href="/admin/users">
                Users
              </Link>
            </div>
            {detail.sessions.length > 0 ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Device</th>
                      <th>Status</th>
                      <th>Last seen</th>
                      <th>Expires</th>
                      {canRevokeSessions && sessionRevokeAction && <th>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.sessions.map((session) => (
                      <tr key={session.id}>
                        <td>{formatAdminLabel(session.source)}</td>
                        <td>{session.device_name || "Unknown"}</td>
                        <td>{sessionState(session)}</td>
                        <td>{session.last_seen_at || "Unknown"}</td>
                        <td>{session.expires_at || "Unknown"}</td>
                        {canRevokeSessions && sessionRevokeAction && (
                          <td>
                            {session.revoked_at ? (
                              <span>Revoked</span>
                            ) : (
                              <AdminUserSessionRevokeForm
                                action={sessionRevokeAction}
                                userId={detail.user.user_id}
                                sessionId={session.id}
                              />
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="admin-empty-state">No recent sessions were returned.</p>
            )}
          </section>

          <section className="admin-section" aria-labelledby="admin-user-activity-heading">
            <div className="admin-section__heading">
              <div>
                <p className="account-card__label">Audit</p>
                <h2 id="admin-user-activity-heading">Recent security events</h2>
              </div>
            </div>
            {detail.activity.length > 0 ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Outcome</th>
                      <th>Source</th>
                      <th>Occurred</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.activity.map((event) => (
                      <tr key={event.id}>
                        <td>{formatAdminLabel(event.event_type)}</td>
                        <td>{formatAdminLabel(event.outcome)}</td>
                        <td>{formatAdminLabel(event.source)}</td>
                        <td>{event.occurred_at || "Unknown"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="admin-empty-state">No recent security events were returned.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

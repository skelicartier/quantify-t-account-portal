import { Download } from "lucide-react";
import Link from "next/link";

import { AdminGate } from "@/components/admin/admin-gate";
import {
  AdminUserQuickApproveForm,
  type AdminUserAccessAction,
} from "@/components/admin/admin-user-access-form";
import { UsersDirectory } from "@/components/admin/users-directory";
import { PageHeader } from "@/components/shell/page-header";
import { RoleBadge } from "@/components/ui/badge";
import { BarChart } from "@/components/ui/bar-chart";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AdminUsersAccess } from "@/lib/admin/access";
import {
  accessStatusOf,
  USER_ACTIVATION_CAPABILITY,
  type AccountApiAdminMetrics,
  type AccountApiAdminUserFilters,
} from "@/lib/admin/account-api";
import { accessLabel, accessTone, applicationsLabel } from "@/lib/admin/user-access";
import { formatLabel, formatNumber } from "@/lib/format";
import { buildPageHref } from "@/lib/search-params";

type AdminUsersProps = {
  access: AdminUsersAccess;
  /** Approves an application from its row; absent, rows only link to the account. */
  accessAction?: AdminUserAccessAction | undefined;
  now?: number | undefined;
};

const COLUMNS = [
  { key: "name", label: "Account" },
  { key: "application", label: "Application" },
  { key: "status", label: "Status" },
  { key: "role", label: "Role" },
  { key: "plan", label: "Plan" },
  { key: "last-login", label: "Last sign-in" },
  { key: "joined", label: "Joined" },
  { key: "open", label: <span className="sr-only">Open</span> },
] as const;

function accountName(user: { display_name: string; email: string }): string {
  return user.display_name || user.email || "Unnamed account";
}

function exportHref(filters: AccountApiAdminUserFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.access) params.set("access", filters.access);
  const query = params.toString();
  return query ? `/admin/users/export?${query}` : "/admin/users/export";
}

function UsersAnalytics({ metrics }: { metrics: AccountApiAdminMetrics }) {
  const series = metrics.series;
  const hasSeries = series !== undefined && series.signups.length > 0;
  return (
    <>
      <StatGrid columns={6} label="Account totals">
        <Stat label="Total accounts" value={formatNumber(metrics.accounts.total)} />
        <Stat label="Active" value={formatNumber(metrics.accounts.active)} />
        <Stat label="New in 24h" value={formatNumber(metrics.accounts.created_24h)} />
        <Stat label="New this week" value={formatNumber(metrics.accounts.created_7d ?? 0)} />
        <Stat label="New in 30 days" value={formatNumber(metrics.accounts.created_30d ?? 0)} />
        <Stat label="Signed in 24h" value={formatNumber(metrics.accounts.logged_in_24h)} />
      </StatGrid>
      {hasSeries && (
        <section className="section" aria-labelledby="admin-users-analytics-heading">
          <div className="section__header">
            <div>
              <h2 id="admin-users-analytics-heading">Last {series.days} days</h2>
              <p className="section__desc">
                Daily counts in UTC; the whole window is aggregated in the database.
              </p>
            </div>
          </div>
          <div className="chart-grid chart-grid--3">
            <BarChart
              title="New accounts"
              description="per day"
              segments={[{ key: "count", label: "Accounts" }]}
              points={series.signups.map((point) => ({
                label: point.date,
                values: { count: point.count },
              }))}
            />
            <BarChart
              title="Accounts signing in"
              description="per day, by last sign-in"
              segments={[{ key: "count", label: "Accounts", tone: "success" }]}
              points={series.sign_ins.map((point) => ({
                label: point.date,
                values: { count: point.count },
              }))}
            />
            <BarChart
              title="Authentication events"
              description="per day, by outcome"
              segments={[
                { key: "success", label: "Success", tone: "success" },
                { key: "failure", label: "Failed", tone: "danger" },
                { key: "blocked", label: "Blocked", tone: "attention" },
              ]}
              points={series.auth_events.map((point) => ({
                label: point.date,
                values: { success: point.success, failure: point.failure, blocked: point.blocked },
              }))}
            />
          </div>
        </section>
      )}
    </>
  );
}

export function AdminUsers({ access, accessAction, now }: AdminUsersProps) {
  const authorized = access.status === "authorized" ? access : null;
  const users = authorized?.users ?? null;
  const metrics = authorized?.metrics ?? null;
  const filters = authorized?.filters ?? {};
  const filtered = Boolean(filters.q || filters.status || filters.access);
  const pending = authorized?.pendingApplications ?? null;
  const canDecide =
    Boolean(accessAction) && access.me.capabilities.includes(USER_ACTIVATION_CAPABILITY);
  const total = users?.pagination.total;
  const limit = authorized?.limit ?? 50;

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users"
        titleId="admin-users-heading"
        description="Everyone with a Quantify Terminal account."
        meta={
          users ? <Timestamp value={users.generated_at} now={now} prefix="Updated" /> : undefined
        }
        actions={
          authorized ? (
            <ButtonLink href={exportHref(filters)}>
              <Download size={14} aria-hidden="true" />
              Export CSV
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="page-content">
        <AdminGate access={access} section="Users">
          {pending !== null && pending > 0 && filters.access !== "pending" && (
            <Callout tone="attention" role="status" title={applicationsLabel(pending)}>
              Access is by application: these accounts can sign in to the console and nothing else
              until somebody approves them.
              <div className="page-state__actions">
                <ButtonLink href="/admin/users?access=pending" size="small" variant="primary">
                  Review applications
                </ButtonLink>
              </div>
            </Callout>
          )}

          {metrics && <UsersAnalytics metrics={metrics} />}

          {authorized && !users && (
            <Callout tone="danger" role="status" title="The directory couldn't be loaded">
              The account service didn&apos;t answer in time. Nothing was changed; refresh to try
              again.
              <div className="page-state__actions">
                <ButtonLink href="/admin/users" size="small">
                  Refresh
                </ButtonLink>
              </div>
            </Callout>
          )}

          {authorized && (
            <section className="section" aria-labelledby="admin-users-table-heading">
              <div className="section__header">
                <div>
                  <h2 id="admin-users-table-heading">Accounts</h2>
                  {typeof total === "number" && (
                    <p className="section__desc">
                      {formatNumber(total)} {total === 1 ? "account" : "accounts"}
                      {filtered ? " match" : ""}
                    </p>
                  )}
                </div>
                {users && (
                  <Pagination
                    offset={users.pagination.offset}
                    limit={users.pagination.limit}
                    returned={users.users.length}
                    hasMore={users.pagination.has_more}
                    nextOffset={users.pagination.next_offset}
                    buildHref={(offset, pageLimit) =>
                      buildPageHref("/admin/users", offset, pageLimit, {
                        q: filters.q,
                        status: filters.status,
                        access: filters.access,
                      })
                    }
                    noun="accounts"
                  />
                )}
              </div>

              <UsersDirectory filters={filters} limit={limit}>
                {users && (
                  <DataTable
                    columns={COLUMNS}
                    caption="Accounts"
                    isEmpty={users.users.length === 0}
                    empty={
                      <EmptyState
                        title={filtered ? "No accounts match." : "No accounts on this page."}
                        description={
                          filters.access === "pending" && !filters.q && !filters.status
                            ? "No applications are awaiting review."
                            : filtered
                              ? "Try a shorter search or clear the filters."
                              : "Try the previous page or reset the limit."
                        }
                      />
                    }
                  >
                    {users.users.map(({ user, role }) => {
                      const application = accessStatusOf(user);
                      const approvable =
                        canDecide &&
                        application === "pending" &&
                        user.user_id !== access.me.user.user_id;
                      return (
                        <tr key={user.user_id}>
                          <td>
                            <span className="data-table__primary">{accountName(user)}</span>
                            <span className="data-table__secondary">
                              {user.display_name ? user.email || "No email" : "No name on file"}
                            </span>
                          </td>
                          <td>
                            <StatusPill
                              value={application}
                              tone={accessTone(application)}
                              label={accessLabel(application)}
                            />
                          </td>
                          <td>
                            <StatusPill value={user.is_active ? "active" : "inactive"} />
                          </td>
                          <td>
                            <RoleBadge role={role.effective} />
                          </td>
                          <td>{formatLabel(user.subscription_tier || "free")}</td>
                          <td>
                            <Timestamp value={user.last_login_at} now={now} fallback="Never" />
                          </td>
                          <td>
                            <Timestamp value={user.created_at} mode="date" fallback="Unknown" />
                          </td>
                          <td className="data-table__actions">
                            {approvable && accessAction && (
                              <AdminUserQuickApproveForm
                                userId={user.user_id}
                                name={accountName(user)}
                                action={accessAction}
                              />
                            )}
                            <Link className="row-link" href={`/admin/users/${user.user_id}`}>
                              {application === "pending" ? "Review" : "Open"}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </DataTable>
                )}
              </UsersDirectory>
            </section>
          )}
        </AdminGate>
      </div>
    </>
  );
}

import Link from "next/link";

import { AdminGate } from "@/components/admin/admin-gate";
import { PageHeader } from "@/components/shell/page-header";
import { RoleBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AdminUsersAccess } from "@/lib/admin/access";
import { formatLabel } from "@/lib/format";
import { buildPageHref } from "@/lib/search-params";

type AdminUsersProps = {
  access: AdminUsersAccess;
  now?: number | undefined;
};

const COLUMNS = [
  { key: "name", label: "Account" },
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

export function AdminUsers({ access, now }: AdminUsersProps) {
  const users = access.status === "authorized" ? access.users : null;

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
      />

      <div className="page-content">
        <AdminGate access={access} section="Users">
          {access.status === "authorized" && !users && (
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

          {users && (
            <section className="section" aria-labelledby="admin-users-table-heading">
              <div className="section__header">
                <div>
                  <p className="eyebrow">Directory</p>
                  <h2 id="admin-users-table-heading">Accounts</h2>
                </div>
                <Pagination
                  offset={users.pagination.offset}
                  limit={users.pagination.limit}
                  returned={users.users.length}
                  hasMore={users.pagination.has_more}
                  nextOffset={users.pagination.next_offset}
                  buildHref={(offset, limit) => buildPageHref("/admin/users", offset, limit)}
                  noun="accounts"
                />
              </div>
              <DataTable
                columns={COLUMNS}
                caption="Accounts"
                isEmpty={users.users.length === 0}
                empty={
                  <EmptyState
                    title="No accounts on this page."
                    description="Try the previous page or reset the limit."
                  />
                }
              >
                {users.users.map(({ user, role }) => (
                  <tr key={user.user_id}>
                    <td>
                      <span className="data-table__primary">{accountName(user)}</span>
                      <span className="data-table__secondary">{user.email || "No email"}</span>
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
                      <Link className="row-link" href={`/admin/users/${user.user_id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </section>
          )}
        </AdminGate>
      </div>
    </>
  );
}

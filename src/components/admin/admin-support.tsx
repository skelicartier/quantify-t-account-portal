import Link from "next/link";

import { AdminGate } from "@/components/admin/admin-gate";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ShortId } from "@/components/ui/short-id";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AdminSupportAccess } from "@/lib/admin/access";
import type { AccountApiSupportSummary } from "@/lib/admin/account-api";
import {
  supportPriorityLabel,
  supportPriorityTone,
  supportStatusLabel,
  supportStatusTone,
} from "@/lib/admin/support-input";
import { formatNumber } from "@/lib/format";

type AdminSupportProps = {
  access: AdminSupportAccess;
  now?: number | undefined;
};

const COLUMNS = [
  { key: "subject", label: "Conversation" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assigned to" },
  { key: "account", label: "Customer" },
  { key: "activity", label: "Last message" },
  { key: "open", label: <span className="sr-only">Open</span> },
] as const;

/** Who spoke last, in the desk's words rather than the store's. */
function lastAuthorLabel(author: string): string {
  if (author === "customer") return "Customer";
  if (author === "staff") return "Desk";
  return "System";
}

function QueueRow({
  conversation,
  now,
}: {
  conversation: AccountApiSupportSummary;
  now?: number | undefined;
}) {
  const href = `/admin/support/${conversation.id}`;
  return (
    <tr>
      <td>
        <Link href={href} className="row-link data-table__primary">
          {conversation.subject}
        </Link>
        <span className="data-table__secondary">
          {conversation.unread ? "Unread" : "Read"} · {formatNumber(conversation.message_count)}{" "}
          messages
        </span>
      </td>
      <td>
        <StatusPill
          value={conversation.status}
          label={supportStatusLabel(conversation.status)}
          tone={supportStatusTone(conversation.status)}
        />
      </td>
      <td>
        <StatusPill
          value={conversation.priority}
          label={supportPriorityLabel(conversation.priority)}
          tone={supportPriorityTone(conversation.priority)}
        />
      </td>
      <td>
        {conversation.assignee_id ? (
          conversation.assignee_name || <ShortId value={conversation.assignee_id} />
        ) : (
          <span className="quiet">Unassigned</span>
        )}
      </td>
      <td>
        {conversation.account_email ? (
          <>
            <Link
              href={`/admin/users/${conversation.account_id}`}
              className="row-link data-table__primary"
            >
              {conversation.account_email}
            </Link>
            <span className="data-table__secondary">
              <ShortId value={conversation.account_id} />
            </span>
          </>
        ) : (
          <ShortId
            value={conversation.account_id}
            href={`/admin/users/${conversation.account_id}`}
          />
        )}
      </td>
      <td>
        <span className="data-table__primary">
          <Timestamp value={conversation.last_at} now={now} />
        </span>
        <span className="data-table__secondary">{lastAuthorLabel(conversation.last_author)}</span>
      </td>
      <td>
        <Link href={href} className="row-link">
          Open
        </Link>
      </td>
    </tr>
  );
}

export function AdminSupport({ access, now }: AdminSupportProps) {
  const authorized = access.status === "authorized" ? access : null;
  const conversations = authorized?.support.conversations ?? [];
  const waiting = conversations.filter((row) => row.status === "open").length;
  const unassigned = conversations.filter(
    (row) => !row.assignee_id && row.status !== "resolved",
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Support"
        titleId="admin-support-heading"
        description={
          authorized?.support.sees_all
            ? "Every conversation on the desk, in the order a desk works: urgent first, longest wait first."
            : "Your conversations and the unassigned pile, in the order a desk works."
        }
        meta={authorized ? <LiveRefresh label="Queue" intervalSeconds={30} /> : undefined}
      />
      <div className="page-content">
        {access.status === "unavailable" ? (
          <Callout tone="danger" role="alert">
            The support desk could not be read. This is not an empty queue — reload in a moment, and
            check the account service if it persists.
          </Callout>
        ) : (
          <AdminGate access={access} section="Support">
            {authorized && (
              <>
                <StatGrid columns={4} label="Queue summary">
                  <Stat label="Conversations" value={formatNumber(conversations.length)} />
                  <Stat label="Need an answer" value={formatNumber(waiting)} />
                  <Stat label="Unread" value={formatNumber(authorized.support.unread)} />
                  <Stat label="Unassigned" value={formatNumber(unassigned)} />
                </StatGrid>
                <DataTable
                  caption="Support conversations"
                  columns={COLUMNS}
                  minWidth={1080}
                  isEmpty={conversations.length === 0}
                  empty={
                    <EmptyState
                      title="Nothing waiting"
                      description={
                        authorized.support.sees_all
                          ? "No conversation is open on the desk."
                          : "Nothing is assigned to you and the unassigned pile is empty."
                      }
                    />
                  }
                >
                  {conversations.map((conversation) => (
                    <QueueRow key={conversation.id} conversation={conversation} now={now} />
                  ))}
                </DataTable>
              </>
            )}
          </AdminGate>
        )}
      </div>
    </>
  );
}

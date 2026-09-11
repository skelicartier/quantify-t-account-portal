import { PageHeader } from "@/components/shell/page-header";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AccountSessionDto, AccountSessionStatus } from "@/lib/dto/session";
import { formatLabel } from "@/lib/format";

type AccountSessionsProps = {
  sessions: AccountSessionDto[];
  now?: number | undefined;
};

const COLUMNS = [
  { key: "device", label: "Device" },
  { key: "status", label: "Status" },
  { key: "last-seen", label: "Last seen" },
  { key: "signed-in", label: "Signed in" },
  { key: "expires", label: "Expires" },
] as const;

function countByStatus(sessions: AccountSessionDto[], status: AccountSessionStatus): number {
  return sessions.filter((session) => session.status === status).length;
}

export function AccountSessions({ sessions, now }: AccountSessionsProps) {
  const activeCount = countByStatus(sessions, "active");
  const endedCount = countByStatus(sessions, "revoked") + countByStatus(sessions, "expired");
  const mostRecent = sessions[0]?.lastSeenAt ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Sessions"
        titleId="account-sessions-heading"
        description="Devices and apps signed in to your account."
      />

      <div className="page-content">
        <StatGrid columns={3} label="Session summary">
          <Stat label="Active" value={activeCount} />
          <Stat label="Ended" value={endedCount} />
          <Stat
            label="Last seen"
            value={<Timestamp value={mostRecent} now={now} fallback="Never" />}
            text
          />
        </StatGrid>

        <Section id="account-session-list" title="Signed-in devices" eyebrow="Inventory">
          <DataTable
            columns={COLUMNS}
            caption="Signed-in devices"
            isEmpty={sessions.length === 0}
            empty={
              <EmptyState
                title="No cloud sessions were found for this account."
                description="Sessions appear here once you sign in from the console or the desktop terminal."
              />
            }
          >
            {sessions.map((session) => (
              <tr key={session.id}>
                <td>
                  <span className="data-table__primary">
                    {session.deviceName ?? formatLabel(session.source)}
                  </span>
                  <span className="data-table__secondary">{formatLabel(session.source)}</span>
                </td>
                <td>
                  <StatusPill value={session.status} />
                </td>
                <td>
                  <Timestamp value={session.lastSeenAt} now={now} />
                </td>
                <td>
                  <Timestamp value={session.createdAt} now={now} />
                </td>
                <td>
                  <Timestamp value={session.expiresAt} now={now} fallback="No expiry" />
                </td>
              </tr>
            ))}
          </DataTable>
        </Section>
      </div>
    </>
  );
}

import { PageHeader } from "@/components/shell/page-header";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AccountActivityEventDto } from "@/lib/dto/session";
import { formatLabel } from "@/lib/format";

type AccountActivityProps = {
  events: AccountActivityEventDto[];
  now?: number | undefined;
};

const COLUMNS = [
  { key: "when", label: "When" },
  { key: "event", label: "Event" },
  { key: "outcome", label: "Outcome" },
  { key: "surface", label: "Surface" },
] as const;

export function AccountActivity({ events, now }: AccountActivityProps) {
  const lastEvent = events[0]?.occurredAt ?? null;
  const flagged = events.filter(
    (event) => event.outcome === "blocked" || event.outcome === "failure",
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Activity"
        titleId="account-activity-heading"
        description="Sign-in and security events recorded for your account."
      />

      <div className="page-content">
        <StatGrid columns={3} label="Activity summary">
          <Stat label="Events" value={events.length} />
          <Stat
            label="Latest"
            value={<Timestamp value={lastEvent} now={now} fallback="None yet" />}
            text
          />
          <Stat label="Needs attention" value={flagged} tone={flagged > 0 ? "danger" : "default"} />
        </StatGrid>

        <Section id="account-activity-list" title="Security timeline" eyebrow="History">
          <DataTable
            columns={COLUMNS}
            caption="Security timeline"
            isEmpty={events.length === 0}
            empty={
              <EmptyState
                title="No security events were recorded for this account."
                description="Sign-ins, password changes and session events will show up here."
              />
            }
          >
            {events.map((event) => (
              <tr key={event.id}>
                <td>
                  <Timestamp value={event.occurredAt} now={now} mode="both" />
                </td>
                <td>
                  <span className="data-table__primary">{formatLabel(event.eventType)}</span>
                </td>
                <td>
                  <StatusPill value={event.outcome} />
                </td>
                <td>{formatLabel(event.source)}</td>
              </tr>
            ))}
          </DataTable>
        </Section>
      </div>
    </>
  );
}

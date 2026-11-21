import { ArrowRight } from "lucide-react";
import Link from "@/components/ui/link";

import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { ShortId } from "@/components/ui/short-id";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { planLabel } from "@/lib/admin/plan-catalogue";
import { roleLabel } from "@/lib/admin/role-labels";
import type { AccountOverviewDto } from "@/lib/dto/account";
import type { AccountActivityEventDto, AccountSessionDto } from "@/lib/dto/session";
import { formatLabel } from "@/lib/format";

type AccountOverviewProps = {
  account: AccountOverviewDto;
  /** Signed-in sessions, newest first; null when they could not be read. */
  sessions?: AccountSessionDto[] | null | undefined;
  /** Security events, newest first; null when they could not be read. */
  events?: AccountActivityEventDto[] | null | undefined;
  /** The effective role, for staff; plain customers have none to show. */
  role?: string | null | undefined;
  now?: number | undefined;
};

type Need = { key: string; title: string; detail: string; href: string };

/** What this account is waiting on its owner for, most important first. */
function needsFor(account: AccountOverviewDto): Need[] {
  const needs: Need[] = [];
  if (!account.emailConfirmed) {
    needs.push({
      key: "email",
      title: "Confirm your sign-in email",
      detail: "Until it is confirmed, password resets and security alerts cannot reach you.",
      href: "/account/security",
    });
  }
  if (account.profileState === "missing") {
    needs.push({
      key: "profile",
      title: "Finish your profile",
      detail: "Your name, country and markets set what the desktop terminal opens on.",
      href: "/account/profile",
    });
  }
  return needs;
}

/**
 * The account's briefing, not a grid of links to the rail's own sections: who it is and
 * how it stands, anything that needs its owner, where it is signed in now, and what
 * happened lately. Every list is one click from its full page.
 */
export function AccountOverview({ account, sessions, events, role, now }: AccountOverviewProps) {
  const needs = needsFor(account);
  const ready = account.profileState === "ready";
  const live = sessions?.filter((session) => session.status === "active") ?? null;
  const recent = events?.slice(0, 6) ?? null;
  return (
    <>
      <RecordHeader
        title={account.displayName}
        status={<StatusPill value={account.status} />}
        readouts={[
          {
            label: "Plan",
            // A failed profile read is not "Free": say nothing rather than the wrong plan.
            value: ready ? planLabel(account.subscriptionTier) : "Unavailable",
          },
          {
            label: "Last sign-in",
            value: <Timestamp value={account.lastSignInAt} now={now} fallback="Never" />,
          },
          {
            label: "Signed in now",
            value: live === null ? "—" : String(live.length),
          },
        ]}
      />

      {account.profileState !== "ready" && (
        <Callout role="status" tone="attention" title="Profile details are unavailable right now">
          {account.profileState === "missing"
            ? "Your sign-in is verified, but your profile hasn't been set up yet. You can still manage security and sessions."
            : "Your sign-in is verified, but profile details couldn't be loaded. Refresh in a moment; nothing about your account has changed."}
        </Callout>
      )}

      <RecordGrid
        side={
          <Properties title="Account">
            <Property label="Sign-in email">{account.email ?? "Unavailable"}</Property>
            <Property label="Email">
              <StatusPill
                value={account.emailConfirmed ? "verified" : "unverified"}
                label={account.emailConfirmed ? "Confirmed" : "Not confirmed"}
              />
            </Property>
            <Property label="Plan">
              {ready ? planLabel(account.subscriptionTier) : "Unavailable"}
            </Property>
            {role && role !== "user" && <Property label="Role">{roleLabel(role)}</Property>}
            <Property label="Member since">
              <Timestamp value={account.memberSince} mode="date" />
            </Property>
            <Property label="Account ID" mono>
              <ShortId value={account.userId} full />
            </Property>
          </Properties>
        }
      >
        {needs.length > 0 && (
          <RecordSection id="needs" title="Needs you">
            <ul className="need-list">
              {needs.map((need) => (
                <li key={need.key}>
                  <Link className="need-list__row" href={need.href}>
                    <span>
                      <span className="need-list__title">{need.title}</span>
                      <span className="need-list__detail">{need.detail}</span>
                    </span>
                    <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </RecordSection>
        )}

        <RecordSection
          id="signed-in"
          title="Signed in now"
          actions={
            <Link className="text-link" href="/account/sessions">
              All sessions
            </Link>
          }
        >
          {live === null ? (
            <p className="muted">Sessions could not be read just now.</p>
          ) : (
            <DataTable
              caption="Signed in now"
              columns={[
                { key: "device", label: "Device" },
                { key: "last-seen", label: "Last seen" },
                { key: "signed-in", label: "Signed in" },
              ]}
              isEmpty={live.length === 0}
              empty={
                <EmptyState
                  title="Nowhere else right now."
                  description="The desktop terminal and this console appear here while they are signed in."
                />
              }
            >
              {live.slice(0, 5).map((session) => (
                <tr key={session.id}>
                  <td>
                    <span className="data-table__primary">
                      {session.deviceName ?? formatLabel(session.source)}
                    </span>
                    <span className="data-table__secondary">{formatLabel(session.source)}</span>
                  </td>
                  <td>
                    <Timestamp value={session.lastSeenAt} now={now} />
                  </td>
                  <td>
                    <Timestamp value={session.createdAt} now={now} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </RecordSection>

        <RecordSection
          id="recent"
          title="Recent activity"
          actions={
            <Link className="text-link" href="/account/activity">
              All activity
            </Link>
          }
        >
          {recent === null ? (
            <p className="muted">Activity could not be read just now.</p>
          ) : (
            <DataTable
              caption="Recent activity"
              columns={[
                { key: "when", label: "When" },
                { key: "event", label: "Event" },
                { key: "outcome", label: "Outcome" },
                { key: "surface", label: "From" },
              ]}
              isEmpty={recent.length === 0}
              empty={
                <EmptyState
                  title="Nothing recorded yet."
                  description="Sign-ins, password changes and session events appear here."
                />
              }
            >
              {recent.map((event) => (
                <tr key={event.id}>
                  <td>
                    <Timestamp value={event.occurredAt} now={now} />
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
          )}
        </RecordSection>
      </RecordGrid>
    </>
  );
}

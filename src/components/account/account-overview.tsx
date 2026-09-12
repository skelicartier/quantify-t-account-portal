import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card, LinkCard } from "@/components/ui/card";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { ShortId } from "@/components/ui/short-id";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AccountOverviewDto } from "@/lib/dto/account";
import { planLabel } from "@/lib/admin/plan-catalogue";

type AccountOverviewProps = {
  account: AccountOverviewDto;
  canEnterAdmin?: boolean;
  now?: number | undefined;
};

export function AccountOverview({ account, canEnterAdmin = false, now }: AccountOverviewProps) {
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Account overview"
        titleId="account-overview-heading"
        description="Your identity, plan, and recent access at a glance."
      />

      <div className="page-content">
        {account.profileState !== "ready" && (
          <Callout role="status" tone="attention" title="Profile details are unavailable right now">
            {account.profileState === "missing"
              ? "Your sign-in is verified, but your profile hasn't been set up yet. You can still manage security and sessions."
              : "Your sign-in is verified, but profile details couldn't be loaded. Refresh in a moment; nothing about your account has changed."}
          </Callout>
        )}

        <div className="overview">
          <Card important>
            <div className="overview__identity">
              <span className="avatar avatar--large" aria-hidden="true">
                {account.initials}
              </span>
              <div>
                <p className="eyebrow">Account holder</p>
                <h2 className="overview__name">{account.displayName}</h2>
                <p className="overview__email">{account.email ?? "Email unavailable"}</p>
              </div>
            </div>
            <KeyValue columns={2} className="card__body">
              <KeyValueRow label="Account ID">
                <ShortId value={account.userId} full />
              </KeyValueRow>
              <KeyValueRow label="Member since">
                <Timestamp value={account.memberSince} mode="date" />
              </KeyValueRow>
            </KeyValue>
          </Card>

          <StatGrid columns={2} label="Account standing">
            <Stat label="Status" value={<StatusPill value={account.status} />} text />
            <Stat label="Plan" value={planLabel(account.subscriptionTier)} text />
            <Stat
              label="Last sign-in"
              value={<Timestamp value={account.lastSignInAt} now={now} />}
              text
            />
            <Stat
              label="Sign-in email"
              value={
                <StatusPill
                  value={account.emailConfirmed ? "verified" : "unverified"}
                  label={account.emailConfirmed ? "Verified" : "Not verified"}
                />
              }
              text
            />
          </StatGrid>
        </div>

        <section className="section" aria-labelledby="account-manage-heading">
          <div className="section__header">
            <div>
              <p className="eyebrow">Manage</p>
              <h2 id="account-manage-heading">Everything about your account</h2>
            </div>
          </div>
          <div className="card-grid">
            <LinkCard
              href="/account/profile"
              title="Edit profile"
              description="Name, phone and country shared with your terminal."
            />
            <LinkCard
              href="/account/subscription"
              title="Subscription"
              description="Your plan, what it includes and what you have used."
            />
            <LinkCard
              href="/account/preferences"
              title="Preferences"
              description="Timezone, currency and notification choices."
            />
            <LinkCard
              href="/account/sessions"
              title="Sessions"
              description="Devices and apps currently signed in."
            />
            <LinkCard
              href="/account/activity"
              title="Activity"
              description="Sign-in and security events on this account."
            />
            {canEnterAdmin && (
              <LinkCard
                href="/admin"
                eyebrow="Administration"
                title="Admin console"
                description="People, roles, audit and platform status."
              />
            )}
          </div>
        </section>
      </div>
    </>
  );
}

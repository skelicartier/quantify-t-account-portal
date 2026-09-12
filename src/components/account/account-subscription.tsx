import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { LocalTime } from "@/components/ui/local-time";
import { Meter } from "@/components/ui/meter";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AccountApiEntitlementFeature } from "@/lib/admin/account-api";
import {
  allowanceStanding,
  canonicalPlan,
  chatModelLabel,
  featureLabel,
  featureNote,
  featureUnit,
  FEATURE_KEYS,
  formatAllowance,
  isBooleanFeature,
  isQuotaFeature,
  planDescription,
  planLabel,
  planDefault,
  QUOTA_FEATURES,
  type FeatureKey,
} from "@/lib/admin/plan-catalogue";
import { subscriptionEventLabel } from "@/lib/admin/subscription";
import type { AccountSubscriptionView } from "@/lib/dal/subscription";
import { formatNumber } from "@/lib/format";

type AccountSubscriptionProps = {
  view: AccountSubscriptionView;
  now?: number | undefined;
};

const INCLUDES_COLUMNS = [
  { key: "feature", label: "Feature" },
  { key: "plan", label: "Included with your plan" },
  { key: "yours", label: "Your allowance" },
  { key: "used", label: "Used this period" },
  { key: "resets", label: "Resets" },
];

const HISTORY_COLUMNS = [
  { key: "when", label: "When" },
  { key: "change", label: "Change" },
  { key: "outcome", label: "Outcome" },
];

function spentOf(entry: AccountApiEntitlementFeature | undefined): number {
  return (entry?.used ?? 0) + (entry?.reserved ?? 0);
}

function AllowanceText({
  feature,
  limit,
  enabled,
}: {
  feature: FeatureKey;
  limit: number | null | undefined;
  enabled: boolean | undefined;
}) {
  if (isBooleanFeature(feature)) {
    return (
      <StatusPill value={enabled ? "on" : "off"} label={enabled ? "Included" : "Not included"} />
    );
  }
  const unit = featureUnit(feature);
  return (
    <span className="num">
      {formatAllowance(limit ?? null)}
      {unit ? ` ${unit}` : ""}
    </span>
  );
}

/**
 * The signed-in account's own plan, as the server resolved it.
 *
 * Every number here came from `me/entitlements`, which is the only judge of what this
 * account may do. The plan column beside it is the published template, so someone who
 * has been given a raised allowance can see both what their plan includes and what they
 * personally hold.
 */
export function AccountSubscription({ view, now }: AccountSubscriptionProps) {
  const { entitlements, history, historyUnavailable } = view;
  // `plan` is the plan these allowances belong to, which during a trial is the trial's
  // plan and not the tier stored on the profile. Labelling the numbers with the stored
  // tier put "Included with Free" beside 1,000 AI chats.
  const plan = canonicalPlan(entitlements.plan);
  const revertsTo = entitlements.stored_plan ? canonicalPlan(entitlements.stored_plan) : null;
  const onTrial = Boolean(entitlements.trial_ends_at);
  const features = entitlements.features;

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Subscription"
        titleId="account-subscription-heading"
        description="Your plan, what it includes, and what you have used so far."
      />

      <div className="page-content">
        {entitlements.trial_ends_at && (
          <Callout role="status" tone="attention" title={`You are on a ${planLabel(plan)} trial`}>
            Your trial ends <LocalTime value={entitlements.trial_ends_at} />. After that this
            account returns to {revertsTo ? `the ${planLabel(revertsTo)} plan` : "its own plan"};
            nothing you have saved is removed.
          </Callout>
        )}

        <div className="overview">
          <Card
            important
            eyebrow={onTrial ? "Current plan · trial" : "Current plan"}
            title={onTrial ? `${planLabel(plan)} plan (trial)` : `${planLabel(plan)} plan`}
            titleId="account-subscription-plan"
            description={planDescription(plan)}
          >
            <KeyValue columns={2}>
              <KeyValueRow label="Plan">
                <Badge>{planLabel(plan)}</Badge>
                {revertsTo && (
                  <span className="data-table__secondary">
                    Reverts to {planLabel(revertsTo)} when the trial ends
                  </span>
                )}
              </KeyValueRow>
              <KeyValueRow label="Chat model">
                {chatModelLabel(entitlements.chat_model) || "Not published"}
              </KeyValueRow>
              <KeyValueRow label="Checked">
                <Timestamp value={entitlements.generated_at} now={now} />
              </KeyValueRow>
              <KeyValueRow label="Entitlement version" mono>
                {formatNumber(entitlements.entitlement_version)}
              </KeyValueRow>
            </KeyValue>
          </Card>

          <StatGrid columns={2} label="Metered allowances">
            {QUOTA_FEATURES.map((feature) => {
              const entry = features[feature];
              const limit = entry?.limit ?? null;
              const spent = spentOf(entry);
              const standing = allowanceStanding(spent, limit);
              return (
                <Stat
                  key={feature}
                  label={`${featureLabel(feature)} left`}
                  value={
                    limit === null
                      ? "Unlimited"
                      : formatNumber(entry?.remaining ?? Math.max(0, limit - spent))
                  }
                  hint={`${formatNumber(spent)} of ${formatAllowance(limit)} used this month`}
                  tone={standing === "over" ? "danger" : "default"}
                />
              );
            })}
            <Stat
              label="Pulse"
              value="Never metered"
              hint="Pulse is deterministic and costs nothing to run"
              text
            />
            <Stat
              label="Plan changes"
              value={formatNumber(history.length)}
              hint="Recorded against this account"
            />
          </StatGrid>
        </div>

        <Section
          id="account-subscription-includes"
          eyebrow="Allowances"
          title="What your plan includes"
          description="Your allowance beside the published plan default, so a raised limit is visible as one."
        >
          <DataTable columns={INCLUDES_COLUMNS} caption="What your plan includes" minWidth={860}>
            {FEATURE_KEYS.map((feature) => {
              const entry = features[feature];
              const included = planDefault(plan, feature);
              const spent = spentOf(entry);
              const limit = entry?.limit ?? null;
              const standing = allowanceStanding(spent, limit);
              const granted = entry !== undefined && entry.source !== "plan";
              return (
                <tr key={feature}>
                  <td>
                    <span className="data-table__primary">{featureLabel(feature)}</span>
                    <span className="data-table__secondary">{featureNote(feature)}</span>
                  </td>
                  <td>
                    <AllowanceText
                      feature={feature}
                      limit={included.kind === "limit" ? included.limit : null}
                      enabled={included.kind === "boolean" ? included.enabled : undefined}
                    />
                  </td>
                  <td>
                    {entry ? (
                      <>
                        <span className="data-table__primary">
                          <AllowanceText
                            feature={feature}
                            limit={entry.limit ?? null}
                            enabled={entry.enabled}
                          />
                        </span>
                        <span className="data-table__secondary">
                          {/* The API explains an allowance that is neither the plan
                              default nor an operator's grant — a trial's own cap — in
                              `reason`. Dropping it labelled a capped trial allowance as
                              the plan's, which is a different and larger number. */}
                          {granted
                            ? `Granted for your account${entry.reason ? ` · ${entry.reason}` : ""}`
                            : entry.reason === "trial"
                              ? `Trial allowance · ${planLabel(plan)} plan default is restored when you subscribe`
                              : `Included with ${planLabel(plan)}`}
                        </span>
                      </>
                    ) : (
                      <span className="quiet">Not published</span>
                    )}
                  </td>
                  <td>
                    {isQuotaFeature(feature) && entry ? (
                      <>
                        <span className="data-table__primary num">
                          {`${formatNumber(spent)} of ${formatAllowance(limit)}`}
                        </span>
                        <Meter
                          label={`${featureLabel(feature)}: ${formatNumber(spent)} of ${formatAllowance(limit)} used`}
                          value={spent}
                          limit={limit}
                          tone={
                            standing === "over"
                              ? "danger"
                              : standing === "near"
                                ? "attention"
                                : "success"
                          }
                        />
                      </>
                    ) : (
                      <span className="quiet">Not metered</span>
                    )}
                  </td>
                  <td>
                    {entry?.resets_at ? (
                      <LocalTime value={entry.resets_at} />
                    ) : (
                      <span className="quiet">Does not reset</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </Section>

        <Section
          id="account-subscription-history"
          eyebrow="History"
          title="Changes to your plan"
          description="Every plan move and allowance grant recorded against this account."
        >
          {historyUnavailable && (
            <Callout role="status" tone="attention" compact>
              Your history could not be loaded just now. Your plan and allowances above are current.
            </Callout>
          )}
          <DataTable
            columns={HISTORY_COLUMNS}
            caption="Changes to your plan"
            isEmpty={history.length === 0}
            empty={
              <EmptyState
                title="No plan changes have been recorded."
                description="Changes made by the Quantify Terminal team appear here."
                compact
              />
            }
          >
            {history.map((event) => (
              <tr key={event.id}>
                <td>
                  <Timestamp value={event.occurredAt} now={now} mode="both" fallback="Unknown" />
                </td>
                <td>
                  <span className="data-table__primary">
                    {subscriptionEventLabel(event.eventType)}
                  </span>
                </td>
                <td>
                  <StatusPill value={event.outcome} />
                </td>
              </tr>
            ))}
          </DataTable>
        </Section>

        <Card
          eyebrow="Changing plan"
          title="Plans are managed by the Quantify Terminal team"
          titleId="account-subscription-contact"
          description="Plans, allowances and trials are set in the cloud console. Ask your account manager, or write to us, and the change applies to every device the moment it is made."
          actions={
            <ButtonLink href="/account/notifications" variant="primary">
              See account notices
            </ButtonLink>
          }
        />
      </div>
    </>
  );
}

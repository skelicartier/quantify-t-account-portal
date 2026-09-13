import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
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

//: One allowance column, not two.
//:
//: There used to be "Included with your plan" beside "Your allowance", and for seven of the
//: nine features they printed the identical value — "2,000 symbols" next to "2,000 symbols",
//: with "Included with Desk" under each. Two columns that agree tell the reader nothing and
//: cost the ones that disagree their emphasis. The plan default now appears only where it
//: differs from what this account actually holds, which is the only case it explains.
const INCLUDES_COLUMNS = [
  { key: "feature", label: "Feature" },
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

type PlanDefault = ReturnType<typeof planDefault>;

/** Whether this account holds exactly what the published plan says, so the row can stay quiet. */
function matchesPlanDefault(entry: AccountApiEntitlementFeature, included: PlanDefault): boolean {
  if (included.kind === "boolean") return Boolean(entry.enabled) === included.enabled;
  return (entry.limit ?? null) === included.limit;
}

/** The plan's own figure, in words, for the one case where it differs from the account's. */
function describeIncluded(feature: FeatureKey, included: PlanDefault): string {
  if (included.kind === "boolean") return included.enabled ? "it" : "nothing here";
  const unit = featureUnit(feature);
  return `${formatAllowance(included.limit)}${unit ? ` ${unit}` : ""}`;
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
              {/* `entitlement_version` is a synchronisation counter. It answers a question
                  nobody holding a subscription asks, and it sat in the same list as the plan
                  and the chat model as though it were comparable. */}
              <KeyValueRow label="Checked">
                <Timestamp value={entitlements.generated_at} now={now} />
              </KeyValueRow>
            </KeyValue>
          </Card>

          {/* Only the two metered features appear here. "Pulse — never metered" and a count
              of plan changes were tiles that existed to fill a 2x2 grid: neither is a number
              that moves, and putting them beside a live allowance implied they were. */}
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
          </StatGrid>
        </div>

        <Section
          id="account-subscription-includes"
          eyebrow="Allowances"
          title="What your plan includes"
        >
          <DataTable
            columns={INCLUDES_COLUMNS}
            caption="What your plan includes"
            minWidth={720}
            scroll={false}
          >
            {FEATURE_KEYS.map((feature) => {
              const entry = features[feature];
              const included = planDefault(plan, feature);
              const spent = spentOf(entry);
              const limit = entry?.limit ?? null;
              const standing = allowanceStanding(spent, limit);
              const granted = entry !== undefined && entry.source !== "plan";
              const differs = entry !== undefined && !matchesPlanDefault(entry, included);
              return (
                <tr key={feature}>
                  <td>
                    <span className="data-table__primary">{featureLabel(feature)}</span>
                    <span className="data-table__secondary">{featureNote(feature)}</span>
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
                        {/* Said only when it adds something. An allowance that simply is the
                            plan's needs no sentence under it; one that is a grant, a trial cap
                            or anything else the server explains in `reason` does. Dropping
                            `reason` used to label a capped trial allowance as the plan's,
                            which is a different and larger number. */}
                        {granted ? (
                          <span className="data-table__secondary">
                            {`Granted for your account${entry.reason ? ` · ${entry.reason}` : ""}`}
                            {differs &&
                              ` · ${planLabel(plan)} includes ${describeIncluded(feature, included)}`}
                          </span>
                        ) : entry.reason === "trial" ? (
                          <span className="data-table__secondary">
                            {`Trial allowance · ${planLabel(plan)} includes ${describeIncluded(feature, included)} once you subscribe`}
                          </span>
                        ) : null}
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

        <Section id="account-subscription-history" eyebrow="History" title="Changes to your plan">
          {historyUnavailable && (
            <Callout role="status" tone="attention" compact>
              Your history could not be loaded just now. Your plan and allowances above are current.
            </Callout>
          )}
          <DataTable
            columns={HISTORY_COLUMNS}
            caption="Changes to your plan"
            scroll={false}
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

        {/* A sentence, not a card with a call to action. This was a full-width panel whose
            primary button went to the notifications page — the loudest control on a page
            about money, pointing somewhere that changes nothing. What it has to say is one
            line, and one line is what it gets. */}
        <p className="page-note">
          Plans, allowances and trials are set by the Quantify Terminal team. Ask your account
          manager and the change applies to every device the moment it is made.
        </p>
      </div>
    </>
  );
}

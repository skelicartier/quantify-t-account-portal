import {
  allowanceRatio,
  allowanceStanding,
  canonicalPlan,
  CANONICAL_PLANS,
  featureLabel,
  featureNote,
  formatAllowance,
  planDefault,
  planDefaults,
  planLabel,
} from "@/lib/admin/plan-catalogue";
import { subscriptionEventLabel } from "@/lib/admin/subscription";

/**
 * The console's copy of the catalogue is a label for a decision the Account API has
 * already made. These expectations are written out literally, in the same order the API
 * writes them, so a change on either side fails here rather than in someone's billing.
 */
const EXPECTED: Record<string, Array<number | null | boolean>> = {
  // ai_chat, deep_research, pulse_universe, tracked_symbols, watchlists,
  // portfolios, saved_screens, history_years, point_in_time, export, intelligence
  free: [20, 1, 25, 50, 2, 1, 2, 5, false, false, false],
  pro: [300, 10, 250, 500, 25, 10, 50, 15, true, true, true],
  desk: [1000, 40, 2000, 5000, null, 100, null, null, true, true, true],
  teams: [1000, 40, 2000, 5000, null, null, null, null, true, true, true],
};

describe("plan catalogue", () => {
  it.each(CANONICAL_PLANS)("publishes every %s allowance exactly as the API does", (plan) => {
    const values = planDefaults(plan).map(({ value }) =>
      value.kind === "boolean" ? value.enabled : value.limit,
    );

    expect(values).toEqual(EXPECTED[plan]);
  });

  it("gives the model-assisted reading to paying plans only", () => {
    // Free is deliberately false rather than absent. The command bar and the planner read
    // the common phrasings deterministically on every plan; what this switch buys is a
    // model being asked about the phrasings they do not cover.
    expect(planDefault("free", "intelligence")).toEqual({ kind: "boolean", enabled: false });
    for (const plan of ["pro", "desk", "teams"] as const) {
      expect(planDefault(plan, "intelligence")).toEqual({ kind: "boolean", enabled: true });
    }
    expect(featureLabel("intelligence")).toBe("Model-assisted intelligence");
    expect(featureNote("intelligence")).toContain("deterministically");
  });

  it("resolves an unknown or legacy tier without granting anything extra", () => {
    expect(canonicalPlan("professional")).toBe("desk");
    expect(canonicalPlan("starter")).toBe("pro");
    expect(canonicalPlan(" PRO ")).toBe("pro");
    expect(canonicalPlan("wildly-made-up")).toBe("free");
    expect(canonicalPlan(null)).toBe("free");
    expect(planLabel("professional")).toBe("Desk");
  });

  it("reads an absent limit as unlimited, never as zero", () => {
    expect(formatAllowance(null)).toBe("Unlimited");
    expect(formatAllowance(undefined)).toBe("Unlimited");
    expect(formatAllowance(0)).toBe("0");
    expect(allowanceStanding(9_000, null)).toBe("unlimited");
    expect(allowanceRatio(9_000, null)).toBeNull();
  });

  it("calls a spend near or over only against a real ceiling", () => {
    expect(allowanceStanding(100, 300)).toBe("healthy");
    expect(allowanceStanding(240, 300)).toBe("near");
    expect(allowanceStanding(300, 300)).toBe("over");
    expect(allowanceStanding(301, 300)).toBe("over");
    expect(allowanceRatio(600, 300)).toBe(1);
  });
});

describe("effective entitlements", () => {
  it("names the two change events in words an operator can scan", () => {
    expect(subscriptionEventLabel("account.subscription_changed")).toBe("Plan changed");
    expect(subscriptionEventLabel("account.entitlement_changed")).toBe("Override changed");
  });
});

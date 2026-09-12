import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminUserSubscription } from "@/components/admin/admin-user-subscription";
import type { AccountApiAdminUserUsage } from "@/lib/admin/account-api";
import {
  INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
  type AdminEntitlementOverrideState,
  type AdminSubscriptionPlanState,
} from "@/lib/admin/subscription";

const TARGET_ID = "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66";
const NOW = Date.parse("2026-09-12T12:00:00Z");

const usage: AccountApiAdminUserUsage = {
  ok: true,
  correlation_id: "qt-usage",
  user_id: TARGET_ID,
  plan: "pro",
  generated_at: "2026-09-12T11:59:00Z",
  counters: [
    {
      feature_key: "ai_chat",
      period_key: "2026-09",
      used: 250,
      reserved: 4,
      updated_at: "2026-09-12T11:00:00Z",
    },
    {
      feature_key: "deep_research",
      period_key: "2026-09",
      used: 3,
      reserved: 0,
      updated_at: "2026-09-12T10:00:00Z",
    },
  ],
};

const planNoop = async (state: AdminSubscriptionPlanState) => state;
const overrideNoop = async (state: AdminEntitlementOverrideState) => state;

function row(name: string) {
  return screen.getByRole("row", { name: new RegExp(name, "iu") });
}

/** Feature, plan default, override, effective, used — in that order. */
function cellsOf(element: HTMLElement) {
  return within(element).getAllByRole("cell");
}

describe("AdminUserSubscription", () => {
  it("shows every plan default with its effective value and the spend behind it", () => {
    render(
      <AdminUserSubscription
        userId={TARGET_ID}
        storedTier="professional"
        usage={usage}
        canManage
        isSelf={false}
        planAction={planNoop}
        overrideAction={overrideNoop}
        now={NOW}
      />,
    );

    // The account's stored tier is legacy text; the plan it resolves to is what governs.
    expect(screen.getByRole("heading", { name: "Pro plan" })).toBeVisible();
    expect(screen.getByText("professional")).toBeVisible();
    expect(screen.getByText("Claude Haiku")).toBeVisible();

    const chat = cellsOf(row("AI chat"));
    expect(chat[1]).toHaveTextContent(/^300$/u);
    expect(chat[2]).toHaveTextContent("None applied");
    expect(chat[3]).toHaveTextContent(/^300$/u);
    expect(chat[4]).toHaveTextContent("254 of 300");

    // Pulse has a ceiling but is never metered; that distinction must survive the table.
    expect(cellsOf(row("Pulse universe"))[4]).toHaveTextContent("Not metered");
    expect(cellsOf(row("Export"))[1]).toHaveTextContent("On");
  });

  it("renders an override beside the plan default it replaces once a change returns it", async () => {
    const user = userEvent.setup();
    const submissions: FormData[] = [];
    const overrideAction = vi.fn(async (_state: AdminEntitlementOverrideState, data: FormData) => {
      submissions.push(data);
      return {
        status: "success" as const,
        message: "Deep Research override recorded on the Pro plan.",
        overrides: [
          {
            feature_key: "deep_research",
            source: "override",
            source_ref: "",
            limit_value: 100,
            bool_value: null,
            effective_from: "2026-09-12T12:00:00Z",
            effective_to: "2026-12-11T12:00:00Z",
            granted_by: TARGET_ID,
            reason: "Northgate pilot, agreed 60 days",
          },
        ],
      };
    });

    render(
      <AdminUserSubscription
        userId={TARGET_ID}
        storedTier="pro"
        usage={usage}
        canManage
        isSelf={false}
        planAction={planNoop}
        overrideAction={overrideAction}
        now={NOW}
      />,
    );

    // Before the change, Deep Research is exactly what the plan grants.
    const before = cellsOf(row("Deep Research"));
    expect(before[1]).toHaveTextContent(/^10$/u);
    expect(before[2]).toHaveTextContent("None applied");
    expect(before[3]).toHaveTextContent(/^10$/u);

    await user.type(screen.getByRole("textbox", { name: "New allowance" }), "100");
    await user.type(
      screen.getByRole("textbox", { name: "Reason" }),
      "Northgate pilot, agreed 60 days",
    );
    await user.click(screen.getByRole("button", { name: "Record override" }));

    expect(overrideAction).toHaveBeenCalled();
    expect(submissions[0]?.get("featureKey")).toBe("deep_research");
    expect(submissions[0]?.get("allowance")).toBe("100");
    expect(submissions[0]?.get("expiresInDays")).toBe("90");
    expect(submissions[0]?.get("reason")).toBe("Northgate pilot, agreed 60 days");
    expect(submissions[0]?.get("intent")).toBe("grant");

    const after = cellsOf(await screen.findByRole("row", { name: /Deep Research/iu }));
    // The plan default stays visible beside the grant, so the size of the comp is legible.
    expect(after[1]).toHaveTextContent(/^10$/u);
    expect(after[2]).toHaveTextContent("100");
    expect(after[2]).toHaveTextContent("Northgate pilot, agreed 60 days");
    expect(after[2]).toHaveTextContent(/expires/iu);
    expect(after[3]).toHaveTextContent("100");
    expect(after[3]).toHaveTextContent("Raised by override");
  });

  it("submits a plan change only with the operator's confirmation", async () => {
    const user = userEvent.setup();
    const submissions: FormData[] = [];
    const planAction = vi.fn(async (_state: AdminSubscriptionPlanState, data: FormData) => {
      submissions.push(data);
      return { ...INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE, status: "success" as const, message: "" };
    });

    render(
      <AdminUserSubscription
        userId={TARGET_ID}
        storedTier="pro"
        usage={usage}
        canManage
        isSelf={false}
        planAction={planAction}
        overrideAction={overrideNoop}
        now={NOW}
      />,
    );

    expect(screen.getByRole("button", { name: "Apply plan" })).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Plan" }), "free");
    expect(screen.getByText(/Lowering a plan takes allowances away/u)).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: /I understand this changes/u }));
    await user.click(screen.getByRole("button", { name: "Apply plan" }));

    expect(submissions[0]?.get("plan")).toBe("free");
    expect(submissions[0]?.get("confirm")).toBe("on");
    expect(submissions[0]?.get("expectedProfileVersion")).toBe("1");
  });

  it("says why the controls are absent rather than hiding the plan", () => {
    render(
      <AdminUserSubscription
        userId={TARGET_ID}
        storedTier="free"
        usage={null}
        canManage={false}
        isSelf
        now={NOW}
      />,
    );

    expect(screen.getByRole("heading", { name: "Free plan" })).toBeVisible();
    expect(screen.getByText(/can't change your own plan/iu)).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Plan" })).not.toBeInTheDocument();
    expect(screen.getByText(/Usage counters are unavailable/iu)).toBeVisible();
    expect(within(row("AI chat")).getByText("Counters unavailable")).toBeVisible();
  });
});

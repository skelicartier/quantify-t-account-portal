import type { AccountApiMe } from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";
import { INITIAL_ADMIN_SUPPORT_STATE } from "@/lib/admin/support-input";

const STAFF_ID = "5c1e7a93-2b4d-4e6f-9a1b-3c5d7e9f0a22";
const OTHER_STAFF_ID = "5c1e7a93-2b4d-4e6f-9a1b-3c5d7e9f0a33";
const CONVERSATION_ID = "sup_0123456789abcdef0123";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  fetchAccountApiMe: vi.fn(),
  getCurrentAssurance: vi.fn(),
  revalidatePath: vi.fn(),
  requireSameOriginServerAction: vi.fn(),
  replyToAccountApiAdminSupport: vi.fn(),
  manageAccountApiAdminSupport: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/dal/assurance-guard", () => ({ getCurrentAssurance: mocks.getCurrentAssurance }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/security/action-origin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/security/action-origin")>(
    "@/lib/security/action-origin",
  );
  return { ...actual, requireSameOriginServerAction: mocks.requireSameOriginServerAction };
});
vi.mock("@/lib/admin/account-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api");
  return {
    ...actual,
    fetchAccountApiMe: mocks.fetchAccountApiMe,
    replyToAccountApiAdminSupport: mocks.replyToAccountApiAdminSupport,
    manageAccountApiAdminSupport: mocks.manageAccountApiAdminSupport,
  };
});

import { manageSupportConversation, replyToSupportConversation } from "@/app/admin/support/actions";
import { AccountApiRequestError } from "@/lib/admin/account-api";
import { SameOriginActionError } from "@/lib/security/action-origin";

const me: AccountApiMe = {
  ok: true,
  correlation_id: "qt-me",
  user: { user_id: STAFF_ID, email: "sam@example.test", is_active: true },
  role: {
    effective: "support_manager",
    database: "support_manager",
    legacy: null,
    mismatch: "missing-in-legacy",
    break_glass: false,
  },
  capabilities: [
    "account:read-self",
    "account:read-any",
    "support:read",
    "support:read-all",
    "support:reply",
    "support:manage",
  ],
  environment: "staging",
};

const assurance: AssuranceState = {
  verifiedTotpFactors: [],
  unverifiedTotpFactorIds: [],
  currentLevel: "aal2",
  requiredLevel: "aal2",
  mfaEnrolled: true,
  challengeRequired: false,
  levelReadable: true,
  factorsReadable: true,
};

function replyForm(body = "Try File then Export again.", id = CONVERSATION_ID): FormData {
  const data = new FormData();
  data.set("conversationId", id);
  data.set("body", body);
  return data;
}

function manageForm(fields: Record<string, string>): FormData {
  const data = new FormData();
  data.set("conversationId", CONVERSATION_ID);
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe("support desk actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServerAzureClient.mockResolvedValue({ getAccessToken: () => "token" });
    mocks.fetchAccountApiMe.mockResolvedValue(me);
    mocks.getCurrentAssurance.mockResolvedValue(assurance);
    mocks.requireSameOriginServerAction.mockResolvedValue(undefined);
    mocks.replyToAccountApiAdminSupport.mockResolvedValue({ ok: true });
    mocks.manageAccountApiAdminSupport.mockResolvedValue({ ok: true });
  });

  // ------------------------------------------------------------------------ replying
  it("sends the reply with its own idempotency key and refreshes both views", async () => {
    const result = await replyToSupportConversation(INITIAL_ADMIN_SUPPORT_STATE, replyForm());

    expect(result.status).toBe("success");
    expect(mocks.replyToAccountApiAdminSupport).toHaveBeenCalledWith(
      "token",
      CONVERSATION_ID,
      { body: "Try File then Export again." },
      { idempotencyKey: expect.stringMatching(/^portal-/u) },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/support");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/support/${CONVERSATION_ID}`);
  });

  it("checks the origin before it reads the caller", async () => {
    // A Server Action is a POST endpoint of its own: the page's gate is not its gate.
    mocks.requireSameOriginServerAction.mockRejectedValue(new SameOriginActionError());

    const result = await replyToSupportConversation(INITIAL_ADMIN_SUPPORT_STATE, replyForm());

    expect(result.status).toBe("error");
    expect(mocks.fetchAccountApiMe).not.toHaveBeenCalled();
    expect(mocks.replyToAccountApiAdminSupport).not.toHaveBeenCalled();
  });

  it("refuses an account that may read the desk but not answer it", async () => {
    mocks.fetchAccountApiMe.mockResolvedValue({
      ...me,
      role: { ...me.role, effective: "auditor", database: "auditor" },
      capabilities: ["account:read-self", "account:read-any", "support:read"],
    });

    const result = await replyToSupportConversation(INITIAL_ADMIN_SUPPORT_STATE, replyForm());

    expect(result).toEqual({
      status: "error",
      message: "This account cannot answer support conversations.",
    });
    expect(mocks.replyToAccountApiAdminSupport).not.toHaveBeenCalled();
  });

  it("refuses a member of staff who has not cleared their second factor", async () => {
    mocks.getCurrentAssurance.mockResolvedValue({ ...assurance, currentLevel: "aal1" });

    const result = await replyToSupportConversation(INITIAL_ADMIN_SUPPORT_STATE, replyForm());

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/passkey/i);
    expect(mocks.replyToAccountApiAdminSupport).not.toHaveBeenCalled();
  });

  it("refuses an empty reply without asking who the caller is", async () => {
    const result = await replyToSupportConversation(INITIAL_ADMIN_SUPPORT_STATE, replyForm("   "));

    expect(result.status).toBe("error");
    expect(mocks.fetchAccountApiMe).not.toHaveBeenCalled();
  });

  it("refuses a conversation id that is not one the service could have minted", async () => {
    const result = await replyToSupportConversation(
      INITIAL_ADMIN_SUPPORT_STATE,
      replyForm("hello", "../admin/secrets"),
    );

    expect(result.status).toBe("error");
    expect(mocks.replyToAccountApiAdminSupport).not.toHaveBeenCalled();
  });

  it("refuses a repeated field rather than picking one of them", async () => {
    const data = new FormData();
    data.set("conversationId", CONVERSATION_ID);
    data.append("body", "first");
    data.append("body", "second");

    const result = await replyToSupportConversation(INITIAL_ADMIN_SUPPORT_STATE, data);

    expect(result.status).toBe("error");
    expect(mocks.replyToAccountApiAdminSupport).not.toHaveBeenCalled();
  });

  it("refuses a reply longer than the service will store", async () => {
    const result = await replyToSupportConversation(
      INITIAL_ADMIN_SUPPORT_STATE,
      replyForm("x".repeat(9_000)),
    );

    expect(result.status).toBe("error");
    expect(mocks.replyToAccountApiAdminSupport).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------- what is shown
  it.each([
    [404, /no longer available/i],
    [409, /answered this first/i],
    [403, /cannot do that/i],
  ])("turns a %s into something the desk can act on", async (status, expected) => {
    mocks.replyToAccountApiAdminSupport.mockRejectedValue(
      new AccountApiRequestError({
        status,
        code: "not_found",
        message: "No conversation sup_0123456789abcdef0123 at admin/support/... (qt-9f2c)",
        correlationId: "qt-9f2c",
      }),
    );

    const result = await replyToSupportConversation(INITIAL_ADMIN_SUPPORT_STATE, replyForm());

    expect(result.status).toBe("error");
    expect(result.message).toMatch(expected);
  });

  it("never repeats the service's own words back to the desk", async () => {
    // An upstream body names routes and correlation ids, and a 404 here is deliberately
    // ambiguous between "no such thread" and "not yours to read".
    mocks.replyToAccountApiAdminSupport.mockRejectedValue(
      new AccountApiRequestError({
        status: 404,
        code: "not_found",
        message: "admin/support/sup_0123456789abcdef0123 (qt-9f2c) assigned to 5c1e7a93",
        correlationId: "qt-9f2c",
      }),
    );

    const result = await replyToSupportConversation(INITIAL_ADMIN_SUPPORT_STATE, replyForm());

    expect(result.message).not.toMatch(/admin\/support/u);
    expect(result.message).not.toMatch(/qt-/u);
    expect(result.message).not.toMatch(/5c1e7a93/u);
  });

  it("says nothing was sent when the desk is unreachable", async () => {
    mocks.replyToAccountApiAdminSupport.mockRejectedValue(new Error("socket hang up"));

    const result = await replyToSupportConversation(INITIAL_ADMIN_SUPPORT_STATE, replyForm());

    expect(result.message).toMatch(/nothing was sent/i);
  });

  // ---------------------------------------------------------------- running the queue
  it("sends only what changed", async () => {
    // A save meant to reassign must not also re-close a thread somebody reopened a
    // second ago.
    await manageSupportConversation(
      INITIAL_ADMIN_SUPPORT_STATE,
      manageForm({ assigneeId: OTHER_STAFF_ID }),
    );

    expect(mocks.manageAccountApiAdminSupport).toHaveBeenCalledWith(
      "token",
      CONVERSATION_ID,
      { assignee_id: OTHER_STAFF_ID },
      { idempotencyKey: expect.stringMatching(/^portal-/u) },
    );
  });

  it("treats an empty assignee as a hand-back rather than as nothing", async () => {
    await manageSupportConversation(INITIAL_ADMIN_SUPPORT_STATE, manageForm({ assigneeId: "" }));

    expect(mocks.manageAccountApiAdminSupport).toHaveBeenCalledWith(
      "token",
      CONVERSATION_ID,
      { assignee_id: "" },
      expect.anything(),
    );
  });

  it("sends a status and priority change together", async () => {
    await manageSupportConversation(
      INITIAL_ADMIN_SUPPORT_STATE,
      manageForm({ status: "resolved", priority: "high" }),
    );

    expect(mocks.manageAccountApiAdminSupport).toHaveBeenCalledWith(
      "token",
      CONVERSATION_ID,
      { status: "resolved", priority: "high" },
      expect.anything(),
    );
  });

  it.each([
    ["status", { status: "closed" }],
    ["priority", { priority: "whenever" }],
  ])("refuses a %s the desk does not use", async (_name, fields) => {
    const result = await manageSupportConversation(INITIAL_ADMIN_SUPPORT_STATE, manageForm(fields));

    expect(result.status).toBe("error");
    expect(mocks.manageAccountApiAdminSupport).not.toHaveBeenCalled();
  });

  it("refuses a change that changes nothing", async () => {
    const result = await manageSupportConversation(INITIAL_ADMIN_SUPPORT_STATE, manageForm({}));

    expect(result).toEqual({ status: "error", message: "Nothing was changed." });
    expect(mocks.manageAccountApiAdminSupport).not.toHaveBeenCalled();
  });

  it("refuses an agent who may answer but not run the queue", async () => {
    // Answering and assigning are different jobs upstream, so they are different
    // permissions here too.
    mocks.fetchAccountApiMe.mockResolvedValue({
      ...me,
      role: { ...me.role, effective: "support", database: "support" },
      capabilities: ["account:read-self", "account:read-any", "support:read", "support:reply"],
    });

    const result = await manageSupportConversation(
      INITIAL_ADMIN_SUPPORT_STATE,
      manageForm({ status: "resolved" }),
    );

    expect(result.status).toBe("error");
    expect(mocks.manageAccountApiAdminSupport).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller before it reaches the service", async () => {
    mocks.createServerAzureClient.mockResolvedValue({ getAccessToken: () => null });

    const result = await replyToSupportConversation(INITIAL_ADMIN_SUPPORT_STATE, replyForm());

    expect(result.status).toBe("error");
    expect(mocks.fetchAccountApiMe).not.toHaveBeenCalled();
  });
});

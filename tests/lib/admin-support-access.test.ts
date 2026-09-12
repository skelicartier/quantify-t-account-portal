import type {
  AccountApiAdminSupport,
  AccountApiAdminSupportConversation,
  AccountApiMe,
} from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";

const STAFF_ID = "5c1e7a93-2b4d-4e6f-9a1b-3c5d7e9f0a22";
const ACCOUNT_ID = "9d3f5b71-4c6e-4a8b-9c0d-1e3f5a7b9c33";
const CONVERSATION_ID = "sup_0123456789abcdef0123";

const me: AccountApiMe = {
  ok: true,
  correlation_id: "qt-me",
  user: { user_id: STAFF_ID, email: "sam@example.test", is_active: true },
  role: {
    effective: "support",
    database: "support",
    legacy: null,
    mismatch: "missing-in-legacy",
    break_glass: false,
  },
  capabilities: ["account:read-self", "account:read-any", "support:read", "support:reply"],
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

const support: AccountApiAdminSupport = {
  ok: true,
  correlation_id: "qt-support",
  conversations: [
    {
      id: CONVERSATION_ID,
      subject: "Exports have stopped working",
      status: "open",
      priority: "urgent",
      created_at: "2026-09-13T08:00:00Z",
      updated_at: "2026-09-13T09:40:00Z",
      message_count: 3,
      last_author: "customer",
      last_at: "2026-09-13T09:40:00Z",
      account_id: ACCOUNT_ID,
      account_email: "priya@example.test",
      assignee_id: "",
      assignee_name: "",
      unread: true,
    },
  ],
  unread: 1,
  sees_all: false,
  can_reply: true,
  can_manage: false,
  statuses: ["open", "pending", "resolved"],
  priorities: ["low", "normal", "high", "urgent"],
};

const conversation: AccountApiAdminSupportConversation = {
  ok: true,
  correlation_id: "qt-support-one",
  conversation: {
    id: CONVERSATION_ID,
    subject: "Exports have stopped working",
    status: "open",
    priority: "urgent",
    created_at: "2026-09-13T08:00:00Z",
    updated_at: "2026-09-13T09:40:00Z",
    messages: [],
    account_id: ACCOUNT_ID,
    account_email: "priya@example.test",
    assignee_id: "",
    assignee_name: "",
    app_version: "3.1.0",
    platform: "macOS",
    unread: true,
  },
  replayed: false,
};

type HarnessOptions = {
  mePayload?: AccountApiMe;
  assurancePayload?: AssuranceState;
  /** The status the service refuses the queue with, as an AccountApiRequestError. */
  queueStatus?: number;
  conversationStatus?: number;
};

async function loadHarness(options: HarnessOptions = {}) {
  vi.resetModules();

  const fetchAccountApiMe = vi.fn(async () => options.mePayload ?? me);
  // Built from the module `access` itself imports, so `instanceof` holds. An error made
  // from a separately-loaded copy of the module is a different class, and the loader's
  // "is this a service refusal?" branch would silently never match.
  let refuse: ((status: number) => Error) | null = null;
  const fetchAccountApiAdminSupport = vi.fn(async () => {
    if (options.queueStatus && refuse) throw refuse(options.queueStatus);
    return support;
  });
  const fetchAccountApiAdminSupportConversation = vi.fn(async () => {
    if (options.conversationStatus && refuse) throw refuse(options.conversationStatus);
    return conversation;
  });
  const getCurrentAssurance = vi.fn(async () => options.assurancePayload ?? assurance);
  const redirect = vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  });
  const createServerAzureClient = vi.fn(async () => ({ getAccessToken: () => "bearer-token" }));

  vi.doMock("@/lib/supabase/server", () => ({ createServerAzureClient }));
  vi.doMock("@/lib/dal/assurance-guard", () => ({ getCurrentAssurance }));
  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/lib/admin/account-api", async () => {
    const actual =
      await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api");
    refuse = (status: number) =>
      new actual.AccountApiRequestError({
        status,
        code: status === 404 ? "not_found" : "upstream_unavailable",
        message: "refused",
        correlationId: "qt-1",
      });
    return {
      ...actual,
      fetchAccountApiMe,
      fetchAccountApiAdminSupport,
      fetchAccountApiAdminSupportConversation,
    };
  });

  const access = await import("@/lib/admin/access");
  return { access, fetchAccountApiAdminSupport, fetchAccountApiAdminSupportConversation };
}

describe("admin support access", () => {
  it("reads the queue the service already narrowed", async () => {
    const harness = await loadHarness();

    const result = await harness.access.getAdminSupportAccess();

    expect(result.status).toBe("authorized");
    if (result.status !== "authorized") return;
    // Straight through. Which conversations this caller may see was decided upstream, and
    // a second opinion here could only ever be a wrong one.
    expect(result.support).toStrictEqual(support);
    expect(harness.fetchAccountApiAdminSupport).toHaveBeenCalledWith("bearer-token");
  });

  it("refuses an account with no support capability", async () => {
    const harness = await loadHarness({
      mePayload: {
        ...me,
        role: { ...me.role, effective: "billing_manager", database: "billing_manager" },
        capabilities: ["account:read-self", "account:read-any", "subscription:write"],
      },
    });

    const result = await harness.access.getAdminSupportAccess();

    expect(result.status).toBe("capability-required");
    if (result.status !== "capability-required") return;
    expect(result.capability).toBe("support:read");
    expect(harness.fetchAccountApiAdminSupport).not.toHaveBeenCalled();
  });

  it("refuses an account that cannot enter the console at all", async () => {
    const harness = await loadHarness({
      mePayload: {
        ...me,
        role: { ...me.role, effective: "user", database: "user" },
        capabilities: ["account:read-self"],
      },
    });

    expect((await harness.access.getAdminSupportAccess()).status).toBe("forbidden");
  });

  it("requires a second factor from every member of staff", async () => {
    // Every role except `user` reads somebody else's account, and a conversation carries
    // whatever that person chose to paste into it.
    const harness = await loadHarness({
      assurancePayload: { ...assurance, currentLevel: "aal1" },
    });

    const result = await harness.access.getAdminSupportAccess();

    expect(result.status).toBe("mfa-required");
    expect(harness.fetchAccountApiAdminSupport).not.toHaveBeenCalled();
  });

  it("says unavailable rather than showing an empty desk", async () => {
    // An empty queue reads as "nobody needs help", which is the one wrong answer to give
    // somebody who opened the page to find out.
    const harness = await loadHarness({ queueStatus: 503 });

    expect((await harness.access.getAdminSupportAccess()).status).toBe("unavailable");
  });

  it("lets a dead session through rather than swallowing it", async () => {
    // A session that ended is the caller's problem to solve, not a service outage: the
    // shell has to be allowed to send them back to sign in.
    const harness = await loadHarness({ queueStatus: 401 });

    await expect(harness.access.getAdminSupportAccess()).rejects.toThrow();
  });

  // ------------------------------------------------------------------ one conversation
  it("reads one conversation and says what this caller may do with it", async () => {
    const harness = await loadHarness();

    const result = await harness.access.getAdminSupportConversationAccess(CONVERSATION_ID);

    expect(result.status).toBe("authorized");
    if (result.status !== "authorized") return;
    expect(result.conversation.id).toBe(CONVERSATION_ID);
    expect(result.canReply).toBe(true);
    // An agent can answer their own queue but not run it.
    expect(result.canManage).toBe(false);
  });

  it("repeats the service's not-found rather than translating it", async () => {
    // A conversation assigned to another agent answers 404 deliberately. Turning that into
    // "forbidden" here would tell the caller it exists, which is what the 404 avoids.
    const harness = await loadHarness({ conversationStatus: 404 });

    expect((await harness.access.getAdminSupportConversationAccess(CONVERSATION_ID)).status).toBe(
      "not-found",
    );
  });

  it("separates a missing conversation from an unreachable desk", async () => {
    const harness = await loadHarness({ conversationStatus: 503 });

    expect((await harness.access.getAdminSupportConversationAccess(CONVERSATION_ID)).status).toBe(
      "unavailable",
    );
  });

  it("does not fetch a conversation for somebody who may not read the desk", async () => {
    const harness = await loadHarness({
      mePayload: { ...me, capabilities: ["account:read-self", "account:read-any"] },
    });

    const result = await harness.access.getAdminSupportConversationAccess(CONVERSATION_ID);

    expect(result.status).toBe("capability-required");
    expect(harness.fetchAccountApiAdminSupportConversation).not.toHaveBeenCalled();
  });
});

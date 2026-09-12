import {
  AccountApiUnavailableError,
  accountApiAdminSupportSchema,
  accountApiAdminSupportConversationSchema,
  fetchAccountApiAdminSupport,
  fetchAccountApiAdminSupportConversation,
  manageAccountApiAdminSupport,
  replyToAccountApiAdminSupport,
  SUPPORT_MANAGE_CAPABILITY,
  SUPPORT_READ_ALL_CAPABILITY,
  SUPPORT_READ_CAPABILITY,
  SUPPORT_REPLY_CAPABILITY,
  type AccountApiAdminSupport,
  type AccountApiAdminSupportConversation,
} from "@/lib/admin/account-api";

const ACCOUNT_API_URL = "https://account-api.example.test/api/v1";
const ACCOUNT_ID = "9d3f5b71-4c6e-4a8b-9c0d-1e3f5a7b9c33";
const CONVERSATION_ID = "sup_0123456789abcdef0123";

type TestFetcher = (input: URL, init: RequestInit) => Promise<Response>;

const queue: AccountApiAdminSupport = {
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
    messages: [
      {
        id: "msg_1",
        author: "customer",
        author_name: "priya@example.test",
        body: "The button spins and nothing downloads.",
        at: "2026-09-13T08:00:00Z",
      },
    ],
    account_id: ACCOUNT_ID,
    assignee_id: "",
    assignee_name: "",
    app_version: "3.1.0",
    platform: "macOS",
    unread: true,
  },
  replayed: false,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function call(fetcher: ReturnType<typeof vi.fn<TestFetcher>>): [URL, RequestInit] {
  const first = fetcher.mock.calls[0];
  if (!first) throw new Error("Expected fetch to be called");
  return first;
}

describe("support desk schema", () => {
  it("accepts the documented queue shape", () => {
    expect(accountApiAdminSupportSchema.parse(queue)).toStrictEqual(queue);
  });

  it("accepts the documented conversation shape", () => {
    expect(accountApiAdminSupportConversationSchema.parse(conversation)).toStrictEqual(
      conversation,
    );
  });

  it.each([
    ["customer_email", { customer_email: "priya@example.test" }],
    ["internal_note", { internal_note: "do not ship this" }],
    ["staff_last_read_at", { staff_last_read_at: "2026-09-13T09:00:00Z" }],
  ])("refuses a conversation that carries %s", (_name, extra) => {
    // `.strict()` is the enforcement, not a comment. The customer view and the staff view
    // are two projections upstream; a schema that accepted extras would let a change on
    // the service side start rendering fields this page was never meant to carry.
    const payload = {
      ...conversation,
      conversation: { ...conversation.conversation, ...extra },
    };

    expect(accountApiAdminSupportConversationSchema.safeParse(payload).success).toBe(false);
  });

  it("refuses a queue row that carries a message body", () => {
    // A queue that ships every message to draw a list hands its reader the contents of
    // threads they only meant to count.
    const payload = {
      ...queue,
      conversations: [{ ...queue.conversations[0]!, messages: [] }],
    };

    expect(accountApiAdminSupportSchema.safeParse(payload).success).toBe(false);
  });

  it("refuses a status the desk does not use", () => {
    const payload = {
      ...queue,
      conversations: [{ ...queue.conversations[0]!, status: "closed" }],
    };

    expect(accountApiAdminSupportSchema.safeParse(payload).success).toBe(false);
  });

  it("requires the queue to say what this caller may do", () => {
    // Without these the console has to guess from the role, which is how a page offers a
    // button the API will refuse.
    const withoutReply: Record<string, unknown> = { ...queue };
    delete withoutReply["can_reply"];

    expect(accountApiAdminSupportSchema.safeParse(withoutReply).success).toBe(false);
  });

  it("names the four desk capabilities separately", () => {
    const capabilities = [
      SUPPORT_READ_CAPABILITY,
      SUPPORT_READ_ALL_CAPABILITY,
      SUPPORT_REPLY_CAPABILITY,
      SUPPORT_MANAGE_CAPABILITY,
    ];

    expect(capabilities).toStrictEqual([
      "support:read",
      "support:read-all",
      "support:reply",
      "support:manage",
    ]);
    expect(new Set(capabilities).size).toBe(4);
  });
});

describe("support desk client", () => {
  it("reads the queue from one route with no query of its own", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(queue));

    await fetchAccountApiAdminSupport("bearer-token", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });

    const [url, init] = call(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/admin/support`);
    expect(init.method).toBe("GET");
  });

  it("reads one conversation by its own id", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(conversation));

    await fetchAccountApiAdminSupportConversation("bearer-token", CONVERSATION_ID, {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });

    expect(call(fetcher)[0].toString()).toBe(`${ACCOUNT_API_URL}/admin/support/${CONVERSATION_ID}`);
  });

  it("sends a reply with an idempotency key", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(conversation));

    await replyToAccountApiAdminSupport(
      "bearer-token",
      CONVERSATION_ID,
      { body: "Looking now." },
      {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
        idempotencyKey: "portal-abc",
      },
    );

    const [url, init] = call(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/admin/support/${CONVERSATION_ID}/reply`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("portal-abc");
    expect(init.body).toBe(JSON.stringify({ body: "Looking now." }));
  });

  it("sends a queue change to the manage route", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(conversation));

    await manageAccountApiAdminSupport(
      "bearer-token",
      CONVERSATION_ID,
      { status: "resolved" },
      {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
        idempotencyKey: "portal-def",
      },
    );

    expect(call(fetcher)[0].toString()).toBe(
      `${ACCOUNT_API_URL}/admin/support/${CONVERSATION_ID}/manage`,
    );
  });

  it.each([
    ["a path segment", "../admin/secrets"],
    ["a slash", "sup_1/reply"],
    ["an empty id", ""],
    ["something oversized", "s".repeat(65)],
  ])("refuses %s rather than building a route from it", async (_name, id) => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(conversation));

    await expect(
      fetchAccountApiAdminSupportConversation("bearer-token", id, {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
      }),
    ).rejects.toBeInstanceOf(AccountApiUnavailableError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses to send a reply without an idempotency key", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(conversation));

    await expect(
      replyToAccountApiAdminSupport(
        "bearer-token",
        CONVERSATION_ID,
        { body: "hello" },
        // @ts-expect-error the key is required by the type; this proves it is also
        // required at run time, so a caller compiled against an older shape cannot send
        // a reply that a retry would duplicate.
        { environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL }, fetcher },
      ),
    ).rejects.toBeInstanceOf(AccountApiUnavailableError);
  });
});

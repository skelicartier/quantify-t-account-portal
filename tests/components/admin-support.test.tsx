import { render, screen, within } from "@testing-library/react";

import { AdminSupport } from "@/components/admin/admin-support";
import { AdminSupportConversation } from "@/components/admin/admin-support-conversation";
import type { AdminSupportAccess, AdminSupportConversationAccess } from "@/lib/admin/access";
import type {
  AccountApiAdminSupport,
  AccountApiMe,
  AccountApiSupportConversation,
  AccountApiSupportSummary,
} from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";

vi.mock("@/app/admin/support/actions", () => ({
  replyToSupportConversation: vi.fn(),
  manageSupportConversation: vi.fn(),
}));

const NOW = Date.parse("2026-09-13T12:00:00Z");
const STAFF_ID = "5c1e7a93-2b4d-4e6f-9a1b-3c5d7e9f0a22";
const ACCOUNT_ID = "9d3f5b71-4c6e-4a8b-9c0d-1e3f5a7b9c33";
const CONVERSATION_ID = "sup_0123456789abcdef0123";

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

function summary(overrides: Partial<AccountApiSupportSummary> = {}): AccountApiSupportSummary {
  return {
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
    ...overrides,
  };
}

function queue(overrides: Partial<AccountApiAdminSupport> = {}): AccountApiAdminSupport {
  return {
    ok: true,
    correlation_id: "qt-support",
    conversations: [summary()],
    unread: 1,
    sees_all: true,
    can_reply: true,
    can_manage: true,
    statuses: ["open", "pending", "resolved"],
    priorities: ["low", "normal", "high", "urgent"],
    ...overrides,
  };
}

function authorizedQueue(overrides: Partial<AccountApiAdminSupport> = {}): AdminSupportAccess {
  return { status: "authorized", me, assurance, support: queue(overrides) };
}

function thread(
  overrides: Partial<AccountApiSupportConversation> = {},
): AccountApiSupportConversation {
  return {
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
      {
        id: "msg_2",
        author: "staff",
        author_name: "sam@example.test",
        body: "Which format?",
        at: "2026-09-13T09:00:00Z",
      },
    ],
    account_id: ACCOUNT_ID,
    assignee_id: "",
    assignee_name: "",
    app_version: "3.1.0",
    platform: "macOS",
    unread: true,
    ...overrides,
  };
}

function authorizedThread(
  overrides: Partial<AccountApiSupportConversation> = {},
  permissions: { canReply?: boolean; canManage?: boolean } = {},
): AdminSupportConversationAccess {
  return {
    status: "authorized",
    me,
    assurance,
    conversation: thread(overrides),
    canReply: permissions.canReply ?? true,
    canManage: permissions.canManage ?? true,
  };
}

describe("AdminSupport queue", () => {
  it("lists a conversation with everything needed to choose what to open", () => {
    render(<AdminSupport access={authorizedQueue()} now={NOW} />);

    const table = screen.getByRole("region", { name: "Support conversations" });
    expect(
      within(table).getByRole("link", { name: /Exports have stopped working/ }),
    ).toHaveAttribute("href", `/admin/support/${CONVERSATION_ID}`);
    expect(within(table).getByText("Unread · 3 messages")).toBeInTheDocument();
    expect(within(table).getByText("Unassigned")).toBeInTheDocument();
  });

  it("never puts a message body in the queue", () => {
    // A page that ships every message to draw a list hands its reader the contents of
    // threads they only meant to count.
    render(<AdminSupport access={authorizedQueue()} now={NOW} />);

    expect(screen.queryByText(/button spins/i)).not.toBeInTheDocument();
  });

  it("says answered rather than pending", () => {
    // "Pending" is the service's word for answered-and-waiting-on-the-customer. Left as
    // it is, a desk reads an answered queue as an unanswered one.
    render(
      <AdminSupport
        access={authorizedQueue({ conversations: [summary({ status: "pending" })] })}
        now={NOW}
      />,
    );

    expect(screen.getByText("Waiting on customer")).toBeInTheDocument();
    expect(screen.queryByText("Needs an answer")).not.toBeInTheDocument();
  });

  it("counts what the desk actually has to do", () => {
    render(
      <AdminSupport
        access={authorizedQueue({
          conversations: [
            summary(),
            summary({ id: "sup_b", status: "resolved", unread: false }),
            summary({ id: "sup_c", status: "pending", assignee_id: STAFF_ID, unread: false }),
          ],
          unread: 1,
        })}
        now={NOW}
      />,
    );

    const totals = screen.getByRole("list", { name: "Queue summary" });
    const stat = (label: string) =>
      within(totals)
        .getAllByRole("listitem")
        .find((item) => item.textContent?.startsWith(label));
    expect(stat("Conversations")).toHaveTextContent("Conversations3");
    expect(stat("Need an answer")).toHaveTextContent("Need an answer1");
    // The resolved one does not count as unassigned work.
    expect(stat("Unassigned")).toHaveTextContent("Unassigned1");
  });

  it("tells an agent the queue is theirs and the unassigned pile, not everybody's", () => {
    render(<AdminSupport access={authorizedQueue({ sees_all: false })} now={NOW} />);

    expect(screen.getByRole("heading", { name: "Support" })).toBeInTheDocument();
    expect(screen.getByText(/Your conversations and the unassigned pile/i)).toBeInTheDocument();
  });

  it("says the desk could not be read rather than showing an empty one", () => {
    // An empty queue reads as "nobody needs help", which is the one wrong answer.
    render(<AdminSupport access={{ status: "unavailable", me, assurance }} now={NOW} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/not an empty queue/i);
    expect(screen.queryByRole("region", { name: "Support conversations" })).not.toBeInTheDocument();
  });

  it("names the capability somebody is missing rather than just refusing", () => {
    render(
      <AdminSupport
        access={{ status: "capability-required", me, assurance, capability: "support:read" }}
        now={NOW}
      />,
    );

    expect(screen.getByText(/read support conversations/i)).toBeInTheDocument();
  });

  it("shows an empty desk as empty, not as an error", () => {
    render(<AdminSupport access={authorizedQueue({ conversations: [], unread: 0 })} now={NOW} />);

    expect(screen.getByText("Nothing waiting")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AdminSupportConversation", () => {
  it("shows both sides of the conversation in order", () => {
    render(<AdminSupportConversation access={authorizedThread()} now={NOW} />);

    expect(screen.getByText("The button spins and nothing downloads.")).toBeInTheDocument();
    expect(screen.getByText("Which format?")).toBeInTheDocument();
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText("sam@example.test")).toBeInTheDocument();
  });

  it("renders a message as text, never as markup", () => {
    // A conversation is the one place in the console that renders words somebody outside
    // it wrote.
    render(
      <AdminSupportConversation
        access={authorizedThread({
          messages: [
            {
              id: "msg_1",
              author: "customer",
              author_name: "",
              body: "<img src=x onerror=alert(1)> and <b>bold</b>",
              at: "2026-09-13T08:00:00Z",
            },
          ],
        })}
        now={NOW}
      />,
    );

    expect(screen.getByText("<img src=x onerror=alert(1)> and <b>bold</b>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("sets a system note apart from something a person said", () => {
    render(
      <AdminSupportConversation
        access={authorizedThread({
          messages: [
            {
              id: "msg_1",
              author: "system",
              author_name: "sam@example.test",
              body: "Marked resolved",
              at: "2026-09-13T08:00:00Z",
            },
          ],
        })}
        now={NOW}
      />,
    );

    expect(screen.getByText("Marked resolved").closest("li")).toHaveClass("thread__note");
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("carries the version and platform the desk would otherwise have to ask for", () => {
    render(<AdminSupportConversation access={authorizedThread()} now={NOW} />);

    expect(screen.getByText("3.1.0")).toBeInTheDocument();
    expect(screen.getByText("macOS")).toBeInTheDocument();
  });

  it("links the conversation to the account it belongs to", () => {
    render(<AdminSupportConversation access={authorizedThread()} now={NOW} />);

    expect(screen.getByRole("link", { name: ACCOUNT_ID })).toHaveAttribute(
      "href",
      `/admin/users/${ACCOUNT_ID}`,
    );
  });

  it("offers the reply box only to somebody who may answer", () => {
    render(
      <AdminSupportConversation access={authorizedThread({}, { canReply: false })} now={NOW} />,
    );

    expect(
      screen.queryByRole("textbox", { name: /Reply to the customer/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/read the desk but not answer it/i)).toBeInTheDocument();
  });

  it("offers the queue controls only to somebody who may run it", () => {
    // Answering and assigning are different jobs, so a page that showed both to everyone
    // would offer an action the API refuses.
    render(
      <AdminSupportConversation access={authorizedThread({}, { canManage: false })} now={NOW} />,
    );

    expect(screen.queryByRole("heading", { name: "Run the queue" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Reply to the customer/i })).toBeInTheDocument();
  });

  it("says not found without hinting that the conversation exists", () => {
    render(<AdminSupportConversation access={{ status: "not-found", me, assurance }} now={NOW} />);

    expect(screen.queryByText(/button spins/i)).not.toBeInTheDocument();
    expect(screen.queryByText(ACCOUNT_ID)).not.toBeInTheDocument();
  });
});

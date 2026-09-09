import {
  ACCOUNT_ACTIVITY_COLUMNS,
  ACCOUNT_ACTIVITY_LIMIT,
  ACCOUNT_ACTIVITY_UNAVAILABLE_MESSAGE,
  ACCOUNT_SESSION_COLUMNS,
  ACCOUNT_SESSION_LIMIT,
  ACCOUNT_SESSIONS_UNAVAILABLE_MESSAGE,
  loadAccountActivityEvents,
  loadAccountSessions,
  type AccountSessionDataClient,
} from "@/lib/dal/session-query";
import { mapAccountActivityEvents, mapAccountSessions } from "@/lib/dto/session";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const OTHER_USER_ID = "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66";
const SESSION_ID = "4a9d2d8b-f3b4-430f-9554-5e6cfb9d9a80";
const EVENT_ID = "22101fb2-9fe0-4833-8122-41d41f98f08d";

const sessionRow = {
  id: SESSION_ID,
  user_id: USER_ID,
  source: "web",
  provider: "azure",
  client_instance_id: "browser-instance",
  device_name: "Safari on macOS",
  created_at: "2026-09-01T08:00:00.000Z",
  last_seen_at: "2026-09-03T08:00:00.000Z",
  expires_at: "2026-09-04T08:00:00.000Z",
  revoked_at: null,
  revoke_reason: null,
};

const eventRow = {
  id: EVENT_ID,
  user_id: USER_ID,
  session_id: SESSION_ID,
  event_type: "login.success",
  outcome: "success",
  source: "web",
  occurred_at: "2026-09-03T08:01:00.000Z",
  created_at: "2026-09-03T08:01:01.000Z",
};

const mocks = vi.hoisted(() => ({
  azureFrom: vi.fn(),
}));

vi.mock("@/lib/dal/azure-sql-client", () => ({
  azureFrom: mocks.azureFrom,
}));

function createClient(options?: {
  authenticated?: boolean;
  sessionRows?: unknown;
  activityRows?: unknown;
  queryError?: boolean;
  authThrows?: boolean;
  malformedIdentity?: boolean;
}) {
  const authenticated = options?.authenticated ?? true;
  const sessionExecute = vi.fn().mockResolvedValue({
    data: options?.sessionRows ?? [sessionRow],
    error: options?.queryError ? { message: "provider detail" } : null,
  });
  const activityExecute = vi.fn().mockResolvedValue({
    data: options?.activityRows ?? [eventRow],
    error: options?.queryError ? { message: "provider detail" } : null,
  });
  const sessionLimit = vi.fn(() => ({ execute: sessionExecute }));
  const activityLimit = vi.fn(() => ({ execute: activityExecute }));
  const sessionOrder = vi.fn(() => ({ limit: sessionLimit }));
  const activityOrder = vi.fn(() => ({ limit: activityLimit }));
  const sessionEq = vi.fn(() => ({ order: sessionOrder }));
  const activityEq = vi.fn(() => ({ order: activityOrder }));
  const sessionSelect = vi.fn(() => ({ eq: sessionEq }));
  const activitySelect = vi.fn(() => ({ eq: activityEq }));
  mocks.azureFrom.mockImplementation((table: "account_sessions" | "auth_events") => {
    if (table === "account_sessions") return { select: sessionSelect };
    return { select: activitySelect };
  });
  const getUser = vi.fn().mockImplementation(async () => {
    if (options?.authThrows) throw new Error("auth transport");
    return authenticated
      ? {
          id: options?.malformedIdentity ? "not-a-uuid" : USER_ID,
          email: "user@example.test",
        }
      : null;
  });

  return {
    client: { getUser } as unknown as AccountSessionDataClient,
    from: mocks.azureFrom,
    sessionSelect,
    sessionEq,
    sessionOrder,
    sessionLimit,
    sessionExecute,
    activitySelect,
    activityEq,
    activityOrder,
    activityLimit,
    activityExecute,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("session DTO mapping", () => {
  it("maps active, expired, and revoked sessions without accepting cross-owner rows", () => {
    const sessions = mapAccountSessions(
      USER_ID,
      [
        sessionRow,
        {
          ...sessionRow,
          id: "f9f3ae4d-6616-4c9c-bd9e-233176fe9d33",
          expires_at: "2026-09-01T08:00:00.000Z",
        },
        {
          ...sessionRow,
          id: "89cda1d8-f0e2-4480-80d9-b057b1d9809f",
          revoked_at: "2026-09-02T08:00:00.000Z",
          revoke_reason: "signed out",
        },
      ],
      { now: new Date("2026-09-03T09:00:00.000Z") },
    );

    expect(sessions.map((session) => session.status)).toEqual(["active", "expired", "revoked"]);
    expect(JSON.stringify(sessions)).not.toContain("provider_session");
  });

  it("rejects cross-owner session and activity rows", () => {
    expect(() => mapAccountSessions(USER_ID, [{ ...sessionRow, user_id: OTHER_USER_ID }])).toThrow(
      /owner mismatch/i,
    );
    expect(() =>
      mapAccountActivityEvents(USER_ID, [{ ...eventRow, user_id: OTHER_USER_ID }]),
    ).toThrow(/owner mismatch/i);
  });
});

describe("account session query", () => {
  it("loads account sessions through an explicit owner-scoped column query", async () => {
    const { client, from, sessionSelect, sessionEq, sessionOrder, sessionLimit } = createClient();

    const sessions = await loadAccountSessions(client, {
      now: new Date("2026-09-03T09:00:00.000Z"),
    });

    expect(sessions?.[0]?.id).toBe(SESSION_ID);
    expect(from).toHaveBeenCalledWith("account_sessions");
    expect(sessionSelect).toHaveBeenCalledWith(ACCOUNT_SESSION_COLUMNS);
    expect(ACCOUNT_SESSION_COLUMNS).not.toContain("*");
    expect(ACCOUNT_SESSION_COLUMNS).not.toContain("metadata");
    expect(ACCOUNT_SESSION_COLUMNS).not.toContain("provider_session_id");
    expect(ACCOUNT_SESSION_COLUMNS).not.toContain("user_agent");
    expect(ACCOUNT_SESSION_COLUMNS).not.toContain("ip_address");
    expect(ACCOUNT_SESSION_COLUMNS).not.toContain("passcode");
    expect(sessionEq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(sessionOrder).toHaveBeenCalledWith("last_seen_at", { ascending: false });
    expect(sessionLimit).toHaveBeenCalledWith(ACCOUNT_SESSION_LIMIT);
  });

  it("does not query sessions without a verified user", async () => {
    const { client, from } = createClient({ authenticated: false });

    await expect(loadAccountSessions(client)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    ["a thrown Auth transport", { authThrows: true }],
    ["an unusable identity", { malformedIdentity: true }],
    ["a provider query error", { queryError: true }],
    ["malformed session rows", { sessionRows: [{ ...sessionRow, created_at: "not-a-date" }] }],
  ])("raises a generic session unavailable error for %s", async (_label, options) => {
    const { client } = createClient(options);

    await expect(loadAccountSessions(client)).rejects.toThrowError(
      ACCOUNT_SESSIONS_UNAVAILABLE_MESSAGE,
    );
  });
});

describe("account activity query", () => {
  it("loads auth events through an explicit owner-scoped column query", async () => {
    const { client, from, activitySelect, activityEq, activityOrder, activityLimit } =
      createClient();

    const events = await loadAccountActivityEvents(client);

    expect(events?.[0]?.id).toBe(EVENT_ID);
    expect(from).toHaveBeenCalledWith("auth_events");
    expect(activitySelect).toHaveBeenCalledWith(ACCOUNT_ACTIVITY_COLUMNS);
    expect(ACCOUNT_ACTIVITY_COLUMNS).not.toContain("*");
    expect(ACCOUNT_ACTIVITY_COLUMNS).not.toContain("metadata");
    expect(ACCOUNT_ACTIVITY_COLUMNS).not.toContain("request_id");
    expect(ACCOUNT_ACTIVITY_COLUMNS).not.toContain("user_agent");
    expect(ACCOUNT_ACTIVITY_COLUMNS).not.toContain("ip_address");
    expect(ACCOUNT_ACTIVITY_COLUMNS).not.toContain("passcode");
    expect(activityEq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(activityOrder).toHaveBeenCalledWith("occurred_at", { ascending: false });
    expect(activityLimit).toHaveBeenCalledWith(ACCOUNT_ACTIVITY_LIMIT);
  });

  it("does not query activity without a verified user", async () => {
    const { client, from } = createClient({ authenticated: false });

    await expect(loadAccountActivityEvents(client)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    ["a thrown Auth transport", { authThrows: true }],
    ["an unusable identity", { malformedIdentity: true }],
    ["a provider query error", { queryError: true }],
    ["malformed activity rows", { activityRows: [{ ...eventRow, outcome: "maybe" }] }],
  ])("raises a generic activity unavailable error for %s", async (_label, options) => {
    const { client } = createClient(options);

    await expect(loadAccountActivityEvents(client)).rejects.toThrowError(
      ACCOUNT_ACTIVITY_UNAVAILABLE_MESSAGE,
    );
  });
});

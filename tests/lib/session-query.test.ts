import {
  ACCOUNT_ACTIVITY_ENDPOINT,
  ACCOUNT_ACTIVITY_LIMIT,
  ACCOUNT_ACTIVITY_UNAVAILABLE_MESSAGE,
  ACCOUNT_SESSIONS_ENDPOINT,
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
  fetchAccountApiActivity: vi.fn(),
  fetchAccountApiSessions: vi.fn(),
}));

vi.mock("@/lib/admin/account-api", () => ({
  fetchAccountApiActivity: mocks.fetchAccountApiActivity,
  fetchAccountApiSessions: mocks.fetchAccountApiSessions,
}));

function createClient(options?: {
  authenticated?: boolean;
  sessionRows?: unknown;
  activityRows?: unknown;
  queryError?: boolean;
  authThrows?: boolean;
  malformedIdentity?: boolean;
  accessToken?: string | null;
}) {
  const authenticated = options?.authenticated ?? true;
  mocks.fetchAccountApiSessions.mockImplementation(async () => {
    if (options?.queryError) throw new Error("provider detail");
    return { sessions: options?.sessionRows ?? [sessionRow] };
  });
  mocks.fetchAccountApiActivity.mockImplementation(async () => {
    if (options?.queryError) throw new Error("provider detail");
    return { events: options?.activityRows ?? [eventRow] };
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
  const getAccessToken = vi.fn(() =>
    options && "accessToken" in options ? options.accessToken : "bearer-token",
  );

  return {
    client: { getUser, getAccessToken } as unknown as AccountSessionDataClient,
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
  it("loads account sessions through the Account API after verifying the user", async () => {
    const { client } = createClient();

    const sessions = await loadAccountSessions(client, {
      now: new Date("2026-09-03T09:00:00.000Z"),
    });

    expect(sessions?.[0]?.id).toBe(SESSION_ID);
    expect(mocks.fetchAccountApiSessions).toHaveBeenCalledWith("bearer-token");
    expect(ACCOUNT_SESSIONS_ENDPOINT).toBe("sessions");
    expect(ACCOUNT_SESSION_LIMIT).toBe(50);
    expect(JSON.stringify(sessions)).not.toContain("metadata");
    expect(JSON.stringify(sessions)).not.toContain("provider_session_id");
    expect(JSON.stringify(sessions)).not.toContain("user_agent");
    expect(JSON.stringify(sessions)).not.toContain("ip_address");
    expect(JSON.stringify(sessions)).not.toContain("passcode");
  });

  it("does not query sessions without a verified user", async () => {
    const { client } = createClient({ authenticated: false });

    await expect(loadAccountSessions(client)).resolves.toBeNull();
    expect(mocks.fetchAccountApiSessions).not.toHaveBeenCalled();
  });

  it.each([
    ["a thrown Auth transport", { authThrows: true }],
    ["an unusable identity", { malformedIdentity: true }],
    ["a provider query error", { queryError: true }],
    ["a missing bearer token", { accessToken: null }],
    ["malformed session rows", { sessionRows: [{ ...sessionRow, created_at: "not-a-date" }] }],
  ])("raises a generic session unavailable error for %s", async (_label, options) => {
    const { client } = createClient(options);

    await expect(loadAccountSessions(client)).rejects.toThrowError(
      ACCOUNT_SESSIONS_UNAVAILABLE_MESSAGE,
    );
  });
});

describe("account activity query", () => {
  it("loads auth events through the Account API after verifying the user", async () => {
    const { client } = createClient();

    const events = await loadAccountActivityEvents(client);

    expect(events?.[0]?.id).toBe(EVENT_ID);
    expect(mocks.fetchAccountApiActivity).toHaveBeenCalledWith("bearer-token");
    expect(ACCOUNT_ACTIVITY_ENDPOINT).toBe("activity");
    expect(ACCOUNT_ACTIVITY_LIMIT).toBe(100);
    expect(JSON.stringify(events)).not.toContain("metadata");
    expect(JSON.stringify(events)).not.toContain("request_id");
    expect(JSON.stringify(events)).not.toContain("user_agent");
    expect(JSON.stringify(events)).not.toContain("ip_address");
    expect(JSON.stringify(events)).not.toContain("passcode");
  });

  it("does not query activity without a verified user", async () => {
    const { client } = createClient({ authenticated: false });

    await expect(loadAccountActivityEvents(client)).resolves.toBeNull();
    expect(mocks.fetchAccountApiActivity).not.toHaveBeenCalled();
  });

  it.each([
    ["a thrown Auth transport", { authThrows: true }],
    ["an unusable identity", { malformedIdentity: true }],
    ["a provider query error", { queryError: true }],
    ["a missing bearer token", { accessToken: null }],
    ["malformed activity rows", { activityRows: [{ ...eventRow, outcome: "maybe" }] }],
  ])("raises a generic activity unavailable error for %s", async (_label, options) => {
    const { client } = createClient(options);

    await expect(loadAccountActivityEvents(client)).rejects.toThrowError(
      ACCOUNT_ACTIVITY_UNAVAILABLE_MESSAGE,
    );
  });
});

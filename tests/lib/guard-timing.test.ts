/**
 * What a page waits for before it renders, and what it no longer waits for.
 *
 * Each account page asked who this is, then what the session owes, then told the service
 * the session was alive, one after the other, before showing anything. The second question
 * now travels with the first, and the third is sent once the page has gone out.
 */
const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  createServerAzureClient: vi.fn(),
  fetchAccountApiProfile: vi.fn(),
  fetchAccountApiPasskeys: vi.fn(),
  heartbeatCurrentAccountApiSession: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/admin/account-api", () => ({
  AccountApiRequestError: class extends Error {},
  fetchAccountApiProfile: mocks.fetchAccountApiProfile,
  fetchAccountApiPasskeys: mocks.fetchAccountApiPasskeys,
}));
vi.mock("@/lib/account/session-lifecycle", () => ({
  heartbeatCurrentAccountApiSession: mocks.heartbeatCurrentAccountApiSession,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

import { afterResponse } from "@/lib/after-response";
import { requireCurrentAccount } from "@/lib/dal/account";

function profileRow() {
  return {
    user_id: USER_ID,
    first_name: "Avery",
    last_name: "Stone",
    phone: "",
    country: "United States",
    email: "user@example.com",
    is_admin: false,
    is_active: true,
    subscription_tier: "free",
    two_factor_enabled: false,
    timezone: "UTC",
    default_currency: "USD",
    notify_price_alerts: true,
    notify_portfolio_moves: true,
    notify_news_digest: false,
    profile_version: 3,
    created_at: "2024-01-03T03:04:05.000Z",
    last_login_at: "",
    data_refresh_rate: "15m",
    theme_preference: "system",
    updated_at: "2026-09-02T08:00:00.000Z",
  };
}

function passkeys(enrolled = false) {
  return {
    ok: true as const,
    correlation_id: "corr-1",
    passkeys: [],
    assurance: {
      mode: "when-enrolled",
      staff: false,
      enrolled,
      passkeys: enrolled ? 1 : 0,
      required: false,
      verified: false,
      fresh: false,
      verified_at: null,
      verified_until: null,
      fresh_until: null,
      session_bound: true,
    },
    limits: { max_passkeys: 10, session_minutes: 720, fresh_minutes: 15 },
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const flush = () => new Promise((done) => setTimeout(done, 0));

beforeEach(() => {
  vi.clearAllMocks();
  // No request to wait for in a test: the real `after` refuses, and the work starts now.
  mocks.after.mockImplementation(() => {
    throw new Error("`after` was called outside a request scope");
  });
  mocks.createServerAzureClient.mockResolvedValue({
    getUser: async () => ({
      id: USER_ID,
      email: "user@example.com",
      first_name: "Avery",
      last_name: "Stone",
      is_active: true,
      email_confirmed: true,
      role: "user",
      profile: null,
    }),
    getAccessToken: () => "access-token",
  });
  mocks.fetchAccountApiProfile.mockResolvedValue({ profile: profileRow() });
  mocks.fetchAccountApiPasskeys.mockResolvedValue(passkeys());
  mocks.heartbeatCurrentAccountApiSession.mockResolvedValue(true);
});

describe("what an account page waits for", () => {
  it("asks what the session owes while the account is still being read, not after", async () => {
    const profile = deferred<{ profile: ReturnType<typeof profileRow> }>();
    mocks.fetchAccountApiProfile.mockReturnValue(profile.promise);

    const page = requireCurrentAccount();
    await flush();

    // The account read has not answered, and the second question is already on its way.
    expect(mocks.fetchAccountApiPasskeys).toHaveBeenCalledTimes(1);

    profile.resolve({ profile: profileRow() });
    await expect(page).resolves.toMatchObject({ userId: USER_ID });
  });

  it("still does not render for a session that owes its passkey", async () => {
    mocks.fetchAccountApiPasskeys.mockResolvedValue(passkeys(true));

    await expect(requireCurrentAccount()).rejects.toThrowError("NEXT_REDIRECT:/passkey");
    expect(mocks.heartbeatCurrentAccountApiSession).not.toHaveBeenCalled();
  });

  it("does not wait for the heartbeat, and still sends it", async () => {
    mocks.heartbeatCurrentAccountApiSession.mockReturnValue(new Promise(() => {}));

    await expect(requireCurrentAccount()).resolves.toMatchObject({ userId: USER_ID });

    expect(mocks.heartbeatCurrentAccountApiSession).toHaveBeenCalledTimes(1);
    const reader = mocks.heartbeatCurrentAccountApiSession.mock.calls[0]![0] as {
      getAccessToken: () => string;
    };
    expect(reader.getAccessToken()).toBe("access-token");
  });

  it("hands the heartbeat to the response's own after-work when there is a response", async () => {
    const scheduled: Array<() => Promise<void>> = [];
    mocks.after.mockImplementation((work: () => Promise<void>) => {
      scheduled.push(work);
    });

    await expect(requireCurrentAccount()).resolves.toMatchObject({ userId: USER_ID });

    // Nothing sent yet: the page goes out first.
    expect(mocks.heartbeatCurrentAccountApiSession).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await scheduled[0]!();
    expect(mocks.heartbeatCurrentAccountApiSession).toHaveBeenCalledTimes(1);
  });

  it("renders even when the heartbeat fails", async () => {
    mocks.heartbeatCurrentAccountApiSession.mockRejectedValue(new Error("service down"));

    await expect(requireCurrentAccount()).resolves.toMatchObject({ userId: USER_ID });
  });
});

describe("work left for after the response", () => {
  it("keeps a failure to itself", async () => {
    const scheduled: Array<() => Promise<void>> = [];
    mocks.after.mockImplementation((work: () => Promise<void>) => {
      scheduled.push(work);
    });

    afterResponse(async () => {
      throw new Error("bookkeeping failed");
    });

    await expect(scheduled[0]!()).resolves.toBeUndefined();
  });

  it("starts at once, unawaited, where there is no response to wait for", async () => {
    const ran = vi.fn(async () => {});

    afterResponse(ran);
    await flush();

    expect(ran).toHaveBeenCalledTimes(1);
  });
});

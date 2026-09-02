import {
  INITIAL_PREFERENCES_ACTION_STATE,
  INITIAL_PROFILE_ACTION_STATE,
} from "@/lib/account/profile-input";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { updatePreferences } from "@/app/account/preferences/actions";
import { updateProfile } from "@/app/account/profile/actions";

function profileForm(): FormData {
  const form = new FormData();
  form.set("firstName", "Avery");
  form.set("lastName", "Stone");
  form.set("phone", "+1 415 555 0100");
  form.set("country", "United States");
  form.set("profileVersion", "4");
  return form;
}

function preferencesForm(): FormData {
  const form = new FormData();
  form.set("timezone", "America/New_York");
  form.set("defaultCurrency", "USD");
  form.set("notifyPriceAlerts", "on");
  form.set("notifyNewsDigest", "on");
  form.set("profileVersion", "5");
  return form;
}

function installClient(options?: {
  authenticated?: boolean;
  rpcError?: unknown;
  rpcData?: unknown;
  rpcResponse?: unknown;
  rpcThrows?: boolean;
  rpcVersion?: number;
  ownerId?: string;
  committedVersion?: number;
}) {
  const events: string[] = [];
  const authenticated = options?.authenticated ?? true;
  const getUser = vi.fn().mockImplementation(async () => {
    events.push("getUser");
    return {
      data: { user: authenticated ? { id: USER_ID } : null },
      error: authenticated ? null : { code: "bad_jwt" },
    };
  });
  const rpc = vi.fn().mockImplementation(async (_name, parameters) => {
    events.push("rpc");
    if (options?.rpcThrows) throw new Error("provider transport failed");
    if (options && "rpcResponse" in options) return options.rpcResponse;
    if (options && "rpcError" in options) return { data: null, error: options.rpcError };
    if (options && "rpcData" in options) return { data: options.rpcData, error: null };
    return {
      data: {
        user_id: options?.ownerId ?? USER_ID,
        profile_version: options?.rpcVersion ?? parameters.p_expected_profile_version + 1,
        updated_at: "2026-09-02T08:00:00.000Z",
      },
      error: null,
    };
  });
  const maybeSingle = vi.fn().mockImplementation(async () => {
    events.push("read-committed-version");
    return { data: { profile_version: options?.committedVersion ?? 9 }, error: null };
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  mocks.createServerSupabaseClient.mockResolvedValue({ auth: { getUser }, rpc, from });
  return { events, getUser, rpc, from };
}

function mutationReceipt(profileVersion = 6, overrides: Record<string, unknown> = {}) {
  return {
    user_id: USER_ID,
    profile_version: profileVersion,
    updated_at: "2026-09-02T08:00:00.000Z",
    ...overrides,
  };
}

describe("profile Server Actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("verifies Auth then calls only the owner-bound versioned RPC", async () => {
    const { events, rpc } = installClient();

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(events).toEqual(["getUser", "rpc"]);
    expect(rpc).toHaveBeenCalledWith("update_my_app_profile_v2", {
      p_expected_profile_version: 4,
      p_first_name: "Avery",
      p_last_name: "Stone",
      p_phone: "+1 415 555 0100",
      p_country: "United States",
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("p_user_id");
    expect(result).toMatchObject({
      status: "success",
      message: "Profile saved.",
      profileVersion: 5,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/profile");
  });

  it("writes bounded preferences through the versioned owner RPC only", async () => {
    const { rpc } = installClient();

    const result = await updatePreferences(INITIAL_PREFERENCES_ACTION_STATE, preferencesForm());

    expect(rpc).toHaveBeenCalledWith("update_my_app_profile_v2", {
      p_expected_profile_version: 5,
      p_timezone: "America/New_York",
      p_default_currency: "USD",
      p_notify_price_alerts: true,
      p_notify_portfolio_moves: false,
      p_notify_news_digest: true,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("photo");
    expect(result).toMatchObject({ status: "success", profileVersion: 6 });
  });

  it("accepts an exact singleton-array three-field receipt", async () => {
    installClient({ rpcData: [mutationReceipt(5)] });

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(result).toMatchObject({ status: "success", profileVersion: 5 });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/profile");
  });

  it("maps a database serialization conflict to a generic stale state", async () => {
    installClient({
      rpcError: { code: "40001", message: "provider details must not cross" },
    });

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(result.status).toBe("stale");
    expect(result.message).toContain("Reload");
    expect(JSON.stringify(result)).not.toContain("provider details");
    // A stale result refreshes every cached account read.
    expect(mocks.revalidatePath.mock.calls.flat()).toEqual([
      "/account",
      "/account/profile",
      "/account/preferences",
    ]);
  });

  it("returns the committed version after a stale conflict so a retry can succeed", async () => {
    const { events } = installClient({
      rpcError: { code: "40001" },
      committedVersion: 11,
    });

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(result).toMatchObject({ status: "stale", profileVersion: 11 });
    expect(events).toEqual(["getUser", "rpc", "read-committed-version"]);
  });

  it("keeps the stale state without a version when the committed read fails", async () => {
    installClient({ rpcError: { code: "40001" }, committedVersion: 0 });

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(result).toMatchObject({ status: "stale", profileVersion: null });
  });

  it("does not call the mutation RPC without a verified user", async () => {
    const { rpc } = installClient({ authenticated: false });

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(result.status).toBe("error");
    expect(result.message).toContain("session");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a non-monotonic profile mutation receipt", async () => {
    installClient({ rpcVersion: 6 });

    const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

    expect(result.status).toBe("error");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a receipt that still carries the retired photo pointer field", async () => {
    installClient({ rpcData: mutationReceipt(6, { profile_photo_path: null }) });

    const result = await updatePreferences(INITIAL_PREFERENCES_ACTION_STATE, preferencesForm());

    expect(result.status).toBe("error");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["empty-array", []],
    ["multi-row", [mutationReceipt(), mutationReceipt()]],
    ["malformed UUID", mutationReceipt(6, { user_id: "not-a-uuid" })],
    ["non-positive version", mutationReceipt(6, { profile_version: 0 })],
    ["fractional version", mutationReceipt(6, { profile_version: 6.5 })],
    ["datetime without offset", mutationReceipt(6, { updated_at: "2026-09-02T08:00:00" })],
    ["extra field", mutationReceipt(6, { unexpected: true })],
  ])("rejects a %s preferences mutation receipt", async (_label, rpcData) => {
    installClient({ rpcData });

    const result = await updatePreferences(INITIAL_PREFERENCES_ACTION_STATE, preferencesForm());

    expect(result.status).toBe("error");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a mutation result for a different UUID", async () => {
    installClient({ ownerId: "22222222-2222-4222-8222-222222222222" });
    const result = await updatePreferences(INITIAL_PREFERENCES_ACTION_STATE, preferencesForm());
    expect(result.status).toBe("error");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  describe("exact RPC envelope classification", () => {
    /**
     * `committedVersion` is the exact version the action requires for success, so
     * only envelope shape decides the outcome. Success is permitted for exactly
     * one shape; every other shape must be a stale or retained service failure.
     */
    function envelopeCases(
      committedVersion: number,
    ): [string, unknown, "success" | "stale" | "error"][] {
      const receipt = mutationReceipt(committedVersion);
      return [
        ["exact success", { data: receipt, error: null }, "success"],
        ["exact definitive stale", { data: null, error: { code: "40001" } }, "stale"],
        [
          "mixed valid receipt with a stale code",
          { data: receipt, error: { code: "40001" } },
          "error",
        ],
        [
          "stale code with a non-null data payload",
          { data: [], error: { code: "40001" } },
          "error",
        ],
        ["missing error key", { data: receipt }, "error"],
        ["undefined error", { data: receipt, error: undefined }, "error"],
        ["undefined data with a stale code", { error: { code: "40001" } }, "error"],
        ["numeric stale code", { data: null, error: { code: 40001 } }, "error"],
        ["stale code without an error object", { data: null, error: "40001" }, "error"],
        ["non-stale provider error", { data: null, error: { code: "57014" } }, "error"],
        ["null envelope", null, "error"],
        ["malformed data with a null error", { data: { user_id: USER_ID }, error: null }, "error"],
      ];
    }

    it.each(envelopeCases(5))(
      "classifies a %s profile envelope",
      async (_label, rpcResponse, status) => {
        installClient({ rpcResponse });

        const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

        expect(result.status).toBe(status);
        if (status === "success") {
          expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/profile");
        } else if (status === "stale") {
          expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/profile");
        } else {
          expect(mocks.revalidatePath).not.toHaveBeenCalled();
        }
      },
    );

    it.each(envelopeCases(6))(
      "classifies a %s preferences envelope",
      async (_label, rpcResponse, status) => {
        installClient({ rpcResponse });

        const result = await updatePreferences(INITIAL_PREFERENCES_ACTION_STATE, preferencesForm());

        expect(result.status).toBe(status);
        if (status === "success") {
          expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/preferences");
        } else if (status === "stale") {
          expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/preferences");
        } else {
          expect(mocks.revalidatePath).not.toHaveBeenCalled();
        }
      },
    );

    it("treats a thrown RPC as a retained service failure", async () => {
      installClient({ rpcThrows: true });

      const result = await updateProfile(INITIAL_PROFILE_ACTION_STATE, profileForm());

      expect(result.status).toBe("error");
      expect(result.message).toContain("temporarily unavailable");
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });
  });
});

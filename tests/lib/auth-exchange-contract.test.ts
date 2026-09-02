/**
 * Contract test against the pinned @supabase/auth-js, not against hand-fed values.
 *
 * The portal decides where a confirmation link may land from the `redirectType` the
 * exchange returns. That value is produced by the client library, so a unit test that
 * feeds it by hand can agree with itself while disagreeing with the dependency. These
 * tests drive the real client with an in-memory storage adapter and a stubbed fetch —
 * no network, no project — and assert what the pinned version actually emits for the
 * two link kinds the portal issues.
 */
import { createClient } from "@supabase/supabase-js";

import { resolveTrustedAuthDestination } from "@/lib/auth/callback";

const PROJECT_URL = "https://project.supabase.invalid";
const USER_ID = "0a3d3f5e-6c1d-4a4a-9a34-2f0c9a4d9b7e";
const CURRENT_EMAIL = "owner@example.com";

function accessToken(): string {
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({
      sub: USER_ID,
      aal: "aal1",
      amr: [{ method: "password" }],
      exp: Math.floor(Date.now() / 1000) + 3_600,
    }),
    "signature",
  ].join(".");
}

function sessionBody(email = CURRENT_EMAIL) {
  return {
    access_token: accessToken(),
    refresh_token: "refresh-token-value",
    token_type: "bearer",
    expires_in: 3_600,
    user: {
      id: USER_ID,
      aud: "authenticated",
      email,
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00.000Z",
    },
  };
}

type RecordedRequest = { url: string; method: string; body: Record<string, unknown> };

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    entries,
    adapter: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
      removeItem: (key: string) => {
        entries.delete(key);
      },
    },
  };
}

function isolatedClient() {
  const requests: RecordedRequest[] = [];
  const storage = memoryStorage();
  const fetchStub = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const body =
      typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    requests.push({ url, method, body });

    const payload = url.includes("/recover") ? {} : sessionBody();
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const client = createClient(PROJECT_URL, "sb_publishable_contract_test", {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "sb-contract-auth-token",
      storage: storage.adapter,
    },
    global: { fetch: fetchStub as typeof fetch },
  });

  return { client, requests, storage };
}

function storedVerifier(entries: Map<string, string>): string | null {
  return entries.get("sb-contract-auth-token-code-verifier") ?? null;
}

/**
 * Read `redirectType` the same way the confirm route does. The published types do not
 * declare it on the exchange result, which is precisely why the route narrows with an
 * `in` check instead of trusting a declaration — and why this test reads the runtime
 * value rather than a typed field.
 */
function emittedRedirectType(data: unknown): unknown {
  return data && typeof data === "object" && "redirectType" in data
    ? (data as { redirectType: unknown }).redirectType
    : undefined;
}

describe("pinned Supabase exchange contract", () => {
  it("returns no redirect type for an email-change confirmation", async () => {
    const { client, requests, storage } = isolatedClient();

    const signIn = await client.auth.signInWithPassword({
      email: CURRENT_EMAIL,
      password: "current-password-value",
    });
    expect(signIn.error).toBeNull();

    const update = await client.auth.updateUser(
      { email: "new.address@example.com" },
      { emailRedirectTo: "https://account.example.invalid/auth/confirm?flow=email-change" },
    );
    expect(update.error).toBeNull();

    // The verifier stored for an email change carries no type suffix, which is the
    // reason the exchange below reports null rather than "email_change".
    expect(storedVerifier(storage.entries)).not.toContain("/");

    const exchanged = await client.auth.exchangeCodeForSession("one-time-auth-code");
    expect(exchanged.error).toBeNull();
    const redirectType = emittedRedirectType(exchanged.data);
    expect(redirectType).toBeNull();

    // The portal's destination policy has to accept exactly that value.
    expect(resolveTrustedAuthDestination("email-change", redirectType)).toBe(
      "/account/security?notice=email-change-confirmed",
    );

    const updateRequest = requests.find(({ method }) => method === "PUT");
    expect(updateRequest?.body.code_challenge).toEqual(expect.any(String));
  });

  it("returns the recovery redirect type only for a password-reset link", async () => {
    const { client, storage } = isolatedClient();

    const requested = await client.auth.resetPasswordForEmail(CURRENT_EMAIL, {
      redirectTo: "https://account.example.invalid/auth/confirm?flow=recovery",
    });
    expect(requested.error).toBeNull();
    expect(storedVerifier(storage.entries)).toContain("/recovery");

    const exchanged = await client.auth.exchangeCodeForSession("one-time-auth-code");
    expect(exchanged.error).toBeNull();
    const redirectType = emittedRedirectType(exchanged.data);
    expect(redirectType).toBe("recovery");

    expect(resolveTrustedAuthDestination("recovery", redirectType)).toBe("/reset-password");
    // And the same value is refused everywhere else, so a recovery link cannot be
    // spent on the security surface.
    expect(resolveTrustedAuthDestination("email-change", redirectType)).toBeNull();
    expect(resolveTrustedAuthDestination("signup", redirectType)).toBeNull();
  });

  it("returns no redirect type for a signup confirmation", async () => {
    const { client } = isolatedClient();

    const signUp = await client.auth.signUp({
      email: "newcomer@example.com",
      password: "correct-horse-battery-staple",
      options: { emailRedirectTo: "https://account.example.invalid/auth/confirm?flow=signup" },
    });
    expect(signUp.error).toBeNull();

    const exchanged = await client.auth.exchangeCodeForSession("one-time-auth-code");
    const redirectType = emittedRedirectType(exchanged.data);
    expect(redirectType).toBeNull();
    expect(resolveTrustedAuthDestination("signup", redirectType)).toBe("/account");
  });
});

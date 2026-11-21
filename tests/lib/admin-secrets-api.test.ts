import {
  AccountApiUnavailableError,
  accountApiAdminSecretsSchema,
  fetchAccountApiAdminSecrets,
  restoreAccountApiAdminSecret,
  revokeAccountApiAdminSecret,
  setAccountApiAdminSecret,
  SECRETS_READ_CAPABILITY,
  SECRETS_WRITE_CAPABILITY,
  type AccountApiAdminSecrets,
} from "@/lib/admin/account-api";

const ACCOUNT_API_URL = "https://account-api.example.test/api/v1";
const OWNER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

type TestFetcher = (input: URL, init: RequestInit) => Promise<Response>;

const inventory: AccountApiAdminSecrets = {
  ok: true,
  correlation_id: "qt-secrets",
  generated_at: "2026-09-12T09:00:00Z",
  store: { state: "ready", dependency: null },
  slots: [
    {
      slot: "OPENROUTER_API_KEY",
      namespace: "api",
      label: "OpenRouter",
      kind: "multi",
      group: null,
      hint: "Holds several keys; the app rotates across them.",
      blast_radius: "AI chat and Deep Research.",
      is_secret: true,
      configured: true,
      distribution: "every-device",
      distribution_certain: false,
      entries: [
        {
          fingerprint: "a1b2c3d4e5f60718",
          prefix: "sk-or-v1-",
          length: 73,
          position: 0,
          set_by: OWNER_ID,
          set_at: "2026-03-02T11:04:00Z",
          verification: { state: "valid", checked_at: "2026-09-12T08:00:00Z" },
        },
      ],
    },
  ],
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

describe("managed credential schema", () => {
  it("accepts the documented inventory shape", () => {
    expect(accountApiAdminSecretsSchema.parse(inventory)).toStrictEqual(inventory);
  });

  it("accepts a key as the service describes it the moment it is saved, and one it never wrote", () => {
    // Recorded from the service: a saved key carries where it came from and an empty check
    // time until it is first checked; a key put in the store some other way has no author
    // and no date. Refusing either took the whole Provider keys page down with it.
    const [first] = inventory.slots;
    const saved = {
      fingerprint: "cdffe1197187114b",
      prefix: "",
      length: 31,
      position: 0,
      set_by: "4eacf6af-ba2b-40db-a5ae-f96f7744835f",
      set_at: "2026-11-21T09:59:51.992042Z",
      origin: "console",
      verification: { state: "unverified", checked_at: "" },
    };
    const outside = {
      ...saved,
      fingerprint: "0f1e2d3c4b5a6978",
      position: 1,
      set_by: "",
      set_at: "",
      origin: "outside",
      verification: { state: "unverified", checked_at: null },
    };
    const payload = { ...inventory, slots: [{ ...first, entries: [saved, outside] }] };

    const parsed = accountApiAdminSecretsSchema.parse(payload);

    expect(parsed.slots[0]?.entries.map((entry) => entry.origin)).toEqual(["console", "outside"]);
  });

  it.each([
    ["value", { value: "sk-or-v1-the-actual-key" }],
    ["masked_secret", { masked_secret: "••••••••3f2a" }],
    ["credential_key_id", { credential_key_id: "e".repeat(64) }],
    ["last_error", { last_error: "Invalid api key: sk-or-v1-the-actual-key" }],
  ])("refuses an entry that carries %s", (_name, extra) => {
    const slot = inventory.slots[0]!;
    const entry = slot.entries[0]!;
    const payload = {
      ...inventory,
      slots: [{ ...slot, entries: [{ ...entry, ...extra }] }],
    };

    // `.strict()` is the enforcement, not a comment: a service that started sending any of
    // these would fail the parse rather than quietly hand them to the renderer.
    expect(accountApiAdminSecretsSchema.safeParse(payload).success).toBe(false);
  });

  it("refuses a slot-level value field", () => {
    const payload = { ...inventory, slots: [{ ...inventory.slots[0]!, value: "leaked" }] };

    expect(accountApiAdminSecretsSchema.safeParse(payload).success).toBe(false);
  });

  it("requires a stated distribution, so the exposure cell can never be blank", () => {
    const payload = { ...inventory, slots: [{ ...inventory.slots[0]!, distribution: "" }] };

    expect(accountApiAdminSecretsSchema.safeParse(payload).success).toBe(false);
  });

  it("names the two capabilities separately", () => {
    expect(SECRETS_READ_CAPABILITY).toBe("secrets:read");
    expect(SECRETS_WRITE_CAPABILITY).toBe("secrets:write");
    expect(SECRETS_READ_CAPABILITY).not.toBe(SECRETS_WRITE_CAPABILITY);
  });
});

describe("managed credential client", () => {
  it("reads the inventory from one route with no query of its own", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(inventory));

    await expect(
      fetchAccountApiAdminSecrets("bearer-token", {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
      }),
    ).resolves.toStrictEqual(inventory);

    const [url, init] = call(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/admin/secrets`);
    expect(init.method).toBe("GET");
  });

  it("sends the value, the mode and an idempotency key on a write", async () => {
    const fetcher = vi.fn<TestFetcher>(async () =>
      jsonResponse({
        ok: true,
        correlation_id: "qt-secret-write",
        slot: inventory.slots[0],
        action: "append",
        metadata_lagging: false,
        event: { id: "evt-1", event_type: "admin.secret_changed" },
        replayed: false,
      }),
    );

    await setAccountApiAdminSecret(
      "bearer-token",
      "OPENROUTER_API_KEY",
      { value: "sk-or-v1-new", mode: "append", expected_fingerprint: "a1b2c3d4e5f60718" },
      {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
        idempotencyKey: "portal-abcdef123456",
      },
    );

    const [url, init] = call(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/admin/secrets/OPENROUTER_API_KEY`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Idempotency-Key": "portal-abcdef123456" });
    expect(JSON.parse(String(init.body))).toStrictEqual({
      value: "sk-or-v1-new",
      mode: "append",
      expected_fingerprint: "a1b2c3d4e5f60718",
    });
  });

  it("targets the revoke and restore suffixes, and restore answers with a fingerprint only", async () => {
    const revokeFetcher = vi.fn<TestFetcher>(async () =>
      jsonResponse({
        ok: true,
        correlation_id: "qt-secret-revoke",
        slot: { ...inventory.slots[0]!, configured: false, entries: [] },
        action: "revoke",
        metadata_lagging: false,
        event: { id: "evt-2", event_type: "admin.secret_changed" },
        replayed: false,
      }),
    );
    await revokeAccountApiAdminSecret(
      "bearer-token",
      "FINNHUB_API_KEY",
      {},
      {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher: revokeFetcher,
        idempotencyKey: "portal-revoke-1",
      },
    );
    expect(call(revokeFetcher)[0].toString()).toBe(
      `${ACCOUNT_API_URL}/admin/secrets/FINNHUB_API_KEY/revoke`,
    );

    const restoreFetcher = vi.fn<TestFetcher>(async () =>
      jsonResponse({
        ok: true,
        correlation_id: "qt-secret-restore",
        slot: {
          ...inventory.slots[0]!,
          entries: [{ ...inventory.slots[0]!.entries[0]!, fingerprint: "99aa88bb77cc6655" }],
        },
        action: "restore",
        metadata_lagging: false,
        event: { id: "evt-3", event_type: "admin.secret_changed" },
        replayed: false,
      }),
    );
    await expect(
      restoreAccountApiAdminSecret("bearer-token", "FINNHUB_API_KEY", {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher: restoreFetcher,
        idempotencyKey: "portal-restore-1",
      }),
      // The restore names the credential it put back by fingerprint, never by value.
    ).resolves.toMatchObject({ action: "restore" });
    expect(call(restoreFetcher)[0].toString()).toBe(
      `${ACCOUNT_API_URL}/admin/secrets/FINNHUB_API_KEY/restore`,
    );
  });

  it("refuses a restore response that carries a value", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.fn<TestFetcher>(async () =>
      jsonResponse({
        ok: true,
        correlation_id: "qt-secret-restore",
        slot: inventory.slots[0],
        action: "restore",
        metadata_lagging: false,
        event: null,
        replayed: false,
        value: "the-restored-key",
      }),
    );

    await expect(
      restoreAccountApiAdminSecret("bearer-token", "FINNHUB_API_KEY", {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
        idempotencyKey: "portal-restore-2",
      }),
    ).rejects.toBeInstanceOf(AccountApiUnavailableError);
    expect(String(consoleError.mock.calls[0]?.[0])).not.toContain("the-restored-key");
    consoleError.mockRestore();
  });

  it.each(["../../etc/passwd", "FINNHUB_API_KEY/revoke", "slot with space", ""])(
    "refuses %s as a slot rather than putting it in a path",
    async (slot) => {
      const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(inventory));

      await expect(
        setAccountApiAdminSecret(
          "bearer-token",
          slot,
          { value: "anything" },
          {
            environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
            fetcher,
            idempotencyKey: "portal-abcdef123456",
          },
        ),
      ).rejects.toBeInstanceOf(AccountApiUnavailableError);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});

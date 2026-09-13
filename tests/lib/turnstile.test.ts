import { turnstileSiteKey, turnstileState, verifyChallenge } from "@/lib/auth/turnstile";

/**
 * The bot challenge has two halves and needs both.
 *
 * Only one was ever configured. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set in production and
 * preflight lists it as a required variable that is present — while all three auth pages
 * hardcoded an empty key, so no widget rendered, and nothing anywhere called siteverify. An
 * operator reading the preflight had every reason to think sign-in was protected.
 */
const BOTH = { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" };
const SITE_ONLY = { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site" };
const SECRET_ONLY = { TURNSTILE_SECRET_KEY: "secret" };

function verifier(body: unknown, status = 200) {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as never) as typeof fetch;
}

describe("turnstileState", () => {
  it("is off when neither half is configured", () => {
    expect(turnstileState({})).toBe("off");
  });

  it("is enforced only when both halves are configured", () => {
    expect(turnstileState(BOTH)).toBe("enforced");
  });

  it.each([
    ["the site key alone", SITE_ONLY],
    ["the secret alone", SECRET_ONLY],
  ])("reports %s as a misconfiguration rather than as protection", (_label, environment) => {
    expect(turnstileState(environment)).toBe("misconfigured");
  });

  it("does not count whitespace as configuration", () => {
    expect(turnstileState({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: "   " })).toBe("off");
  });
});

describe("turnstileSiteKey", () => {
  it("gives a page the key once the challenge is fully configured", () => {
    expect(turnstileSiteKey(BOTH)).toBe("site");
  });

  it("gives a page nothing when only the site key is set", () => {
    // Rendering it here is what would make the widget theatre: a check in front of the
    // customer that no server verifies.
    expect(turnstileSiteKey(SITE_ONLY)).toBe("");
  });

  it("gives a page nothing when the challenge is off", () => {
    expect(turnstileSiteKey({})).toBe("");
  });
});

describe("verifyChallenge", () => {
  it("lets everything through when the challenge is not configured", async () => {
    await expect(verifyChallenge("", { environment: {} })).resolves.toEqual({ ok: true });
  });

  it("lets everything through when only half of it is configured", async () => {
    // Enforcing a check this server cannot verify would lock every customer out.
    await expect(verifyChallenge("", { environment: SITE_ONLY })).resolves.toEqual({ ok: true });
  });

  it("accepts a token Cloudflare confirms", async () => {
    const result = await verifyChallenge("token", {
      environment: BOTH,
      fetchImpl: verifier({ success: true }),
    });

    expect(result.ok).toBe(true);
  });

  it("refuses a token Cloudflare rejects", async () => {
    const result = await verifyChallenge("token", {
      environment: BOTH,
      fetchImpl: verifier({ success: false }),
    });

    expect(result.ok).toBe(false);
  });

  it.each([
    ["missing", ""],
    ["not a string", 42],
    ["absent", null],
  ])("refuses a %s token without asking Cloudflare", async (_label, value) => {
    let called = false;
    const result = await verifyChallenge(value, {
      environment: BOTH,
      fetchImpl: (async () => {
        called = true;
        return { ok: true, status: 200, json: async () => ({ success: true }) } as never;
      }) as typeof fetch,
    });

    expect(result.ok).toBe(false);
    expect(called, "a token that cannot be valid should not cost a round trip").toBe(false);
  });

  it("lets a customer in when the verifier itself is unreachable", async () => {
    // The asymmetry is deliberate: a rejected token is the case this exists to stop, while
    // Cloudflare being down must not take sign-in down for everyone.
    const result = await verifyChallenge("token", {
      environment: BOTH,
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as typeof fetch,
    });

    expect(result.ok).toBe(true);
  });

  it("lets a customer in when the verifier answers with an error status", async () => {
    const result = await verifyChallenge("token", {
      environment: BOTH,
      fetchImpl: verifier({}, 503),
    });

    expect(result.ok).toBe(true);
  });

  it("sends the secret and the token, and never the secret back to the caller", async () => {
    let sent = "";
    const result = await verifyChallenge("the-token", {
      environment: BOTH,
      fetchImpl: (async (_url: unknown, init: { body?: unknown }) => {
        sent = String(init?.body ?? "");
        return { ok: true, status: 200, json: async () => ({ success: true }) } as never;
      }) as unknown as typeof fetch,
    });

    expect(sent).toContain("secret=secret");
    expect(sent).toContain("response=the-token");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

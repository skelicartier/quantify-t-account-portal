import {
  assuranceForMutation,
  EMPTY_ASSURANCE_STATE,
  resolveAssuranceState,
} from "@/lib/auth/assurance";

type FactorFixture = Record<string, unknown>;

function client(options: {
  factors?: FactorFixture[];
  currentLevel?: string | null;
  nextLevel?: string | null;
  factorsError?: unknown;
  levelError?: unknown;
  levelData?: unknown;
  throws?: boolean;
}) {
  const listFactors = vi.fn(async () => {
    if (options.throws) throw new Error("transport failed");
    return { data: { all: options.factors ?? [] }, error: options.factorsError ?? null };
  });
  const getAuthenticatorAssuranceLevel = vi.fn(async () => ({
    data:
      "levelData" in options
        ? options.levelData
        : {
            currentLevel: options.currentLevel ?? null,
            nextLevel: options.nextLevel ?? null,
          },
    error: options.levelError ?? null,
  }));

  return {
    client: { auth: { mfa: { listFactors, getAuthenticatorAssuranceLevel } } },
    listFactors,
    getAuthenticatorAssuranceLevel,
  };
}

const verifiedFactor: FactorFixture = {
  id: "factor-verified",
  factor_type: "totp",
  status: "verified",
  friendly_name: "Phone",
  created_at: "2026-09-01T10:00:00.000Z",
};

describe("assurance state", () => {
  it("counts only verified TOTP factors as enrollment", async () => {
    const { client: supabase } = client({
      factors: [
        verifiedFactor,
        { id: "factor-pending", factor_type: "totp", status: "unverified" },
      ],
      currentLevel: "aal2",
      nextLevel: "aal2",
    });

    const state = await resolveAssuranceState(supabase);

    expect(state.mfaEnrolled).toBe(true);
    expect(state.verifiedTotpFactors).toStrictEqual([
      { id: "factor-verified", friendlyName: "Phone", createdAt: "2026-09-01T10:00:00.000Z" },
    ]);
    expect(state.unverifiedTotpFactorIds).toStrictEqual(["factor-pending"]);
    expect(state.challengeRequired).toBe(false);
  });

  it("treats an unverified factor alone as no enrollment", async () => {
    const { client: supabase } = client({
      factors: [{ id: "factor-pending", factor_type: "totp", status: "unverified" }],
      currentLevel: "aal1",
      nextLevel: "aal1",
    });

    const state = await resolveAssuranceState(supabase);

    expect(state.mfaEnrolled).toBe(false);
    expect(state.challengeRequired).toBe(false);
  });

  it("requires a challenge when the provider expects a higher level than reached", async () => {
    const { client: supabase } = client({
      factors: [verifiedFactor],
      currentLevel: "aal1",
      nextLevel: "aal2",
    });

    const state = await resolveAssuranceState(supabase);

    expect(state.mfaEnrolled).toBe(true);
    expect(state.challengeRequired).toBe(true);
  });

  it("ignores non-TOTP factor types", async () => {
    const { client: supabase } = client({
      factors: [{ id: "phone-1", factor_type: "phone", status: "verified" }],
      currentLevel: "aal1",
      nextLevel: "aal1",
    });

    const state = await resolveAssuranceState(supabase);

    expect(state.mfaEnrolled).toBe(false);
    expect(state.verifiedTotpFactors).toStrictEqual([]);
  });

  it("derives the required level from the attested factor list, not from the session", async () => {
    // The provider helper's own nextLevel comes from the cookie-borne session on the
    // server, so a caller can delete their factor list from it. Only the network-
    // authenticated inventory may decide whether a second factor is owed.
    const { client: supabase } = client({
      factors: [verifiedFactor],
      currentLevel: "aal1",
      // What a tampered cookie would report: no factors, so no challenge owed.
      nextLevel: "aal1",
    });

    const state = await resolveAssuranceState(supabase);

    expect(state.requiredLevel).toBe("aal2");
    expect(state.challengeRequired).toBe(true);
    expect(assuranceForMutation(state)).toBe("challenge-required");
  });

  it("does not invent a challenge when the attested list reports no factor", async () => {
    // The mirror case: a cookie claiming aal2 is owed cannot manufacture a challenge
    // for an account that has no verified factor.
    const { client: supabase } = client({ factors: [], currentLevel: "aal1", nextLevel: "aal2" });

    const state = await resolveAssuranceState(supabase);

    expect(state.requiredLevel).toBe("aal1");
    expect(state.challengeRequired).toBe(false);
    expect(assuranceForMutation(state)).toBe("satisfied");
  });

  it.each([
    ["a factor listing error", { factorsError: { message: "denied" } }],
    ["a thrown factor listing", { throws: true }],
  ])("refuses every mutation on %s", async (_label, options) => {
    const { client: supabase } = client({
      factors: [verifiedFactor],
      currentLevel: "aal1",
      nextLevel: "aal2",
      ...options,
    });

    const state = await resolveAssuranceState(supabase);

    // Without the attested list there is no honest answer to "is a factor owed", so a
    // mutation refuses. Rendering stays permissive: challengeRequired is not asserted.
    expect(state.factorsReadable).toBe(false);
    expect(state.requiredLevel).toBeNull();
    expect(state.verifiedTotpFactors).toStrictEqual([]);
    expect(state.challengeRequired).toBe(false);
    expect(assuranceForMutation(state)).toBe("unavailable");
  });

  it.each([
    ["an assurance level error", { levelError: { message: "denied" } }],
    ["an unreadable level payload", { levelData: null }],
    ["a non-object level payload", { levelData: "aal2" }],
    ["a missing aal claim", { levelData: { currentLevel: null, nextLevel: "aal2" } }],
  ])("refuses every mutation when the level is unreadable: %s", async (_label, options) => {
    const { client: supabase } = client({ factors: [verifiedFactor], ...options });

    const state = await resolveAssuranceState(supabase);

    expect(state.levelReadable).toBe(false);
    expect(state.challengeRequired).toBe(false);
    expect(state.currentLevel).toBeNull();
    expect(assuranceForMutation(state)).toBe("unavailable");
  });

  it("fails closed to the empty state when the client exposes no MFA surface", async () => {
    await expect(
      resolveAssuranceState({ auth: {} } as unknown as Parameters<typeof resolveAssuranceState>[0]),
    ).resolves.toStrictEqual(EMPTY_ASSURANCE_STATE);
    expect(assuranceForMutation(EMPTY_ASSURANCE_STATE)).toBe("unavailable");
  });

  it("never reports a challenge requirement from an unreadable factor payload", async () => {
    const listFactors = vi.fn(async () => ({ data: "not-an-object", error: null }));
    const getAuthenticatorAssuranceLevel = vi.fn(async () => ({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    }));

    const state = await resolveAssuranceState({
      auth: { mfa: { listFactors, getAuthenticatorAssuranceLevel } },
    });

    expect(state.mfaEnrolled).toBe(false);
    expect(state.challengeRequired).toBe(false);
    expect(state.factorsReadable).toBe(false);
  });
});

describe("mutation assurance decision", () => {
  const satisfied = {
    ...EMPTY_ASSURANCE_STATE,
    currentLevel: "aal2" as const,
    requiredLevel: "aal2" as const,
    levelReadable: true,
    factorsReadable: true,
  };

  it("permits a mutation only when both halves are known and nothing is owed", () => {
    expect(assuranceForMutation(satisfied)).toBe("satisfied");
  });

  it("refuses a session that still owes a factor", () => {
    const owed = { ...satisfied, currentLevel: "aal1" as const, challengeRequired: true };

    expect(assuranceForMutation(owed)).toBe("challenge-required");
  });

  it.each([
    ["the factor inventory", { factorsReadable: false }],
    ["the session level", { levelReadable: false }],
  ])("refuses every mutation when %s is unreadable", (_label, overrides) => {
    expect(assuranceForMutation({ ...satisfied, ...overrides })).toBe("unavailable");
  });
});

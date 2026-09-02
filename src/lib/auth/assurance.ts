/**
 * Multi-factor state derived only from verified Supabase Auth factors.
 *
 * `app_profiles.two_factor_enabled` is a desktop-owned legacy column and is never
 * consulted here: a boolean in application data cannot prove that a second factor
 * exists, and trusting it would create a second source of truth that can disagree
 * with the provider. Enrollment is real only when the provider reports a verified
 * factor, and enforcement is real only when the session's assurance level is
 * compared against the level those factors require.
 */
export type VerifiedTotpFactor = {
  id: string;
  friendlyName: string | null;
  createdAt: string | null;
};

export type AssuranceState = {
  /** Verified TOTP factors only; unverified enrollment leftovers are excluded. */
  verifiedTotpFactors: VerifiedTotpFactor[];
  /** Unverified factor ids, so abandoned enrollments can be cleaned up. */
  unverifiedTotpFactorIds: string[];
  /**
   * The level this session has reached, taken from the `aal` claim of the signed
   * access token. Unforgeable: the claim lives inside the JWT, and every mutation
   * re-presents that token to the provider, so a tampered level fails at the
   * operation rather than at this gate.
   */
  currentLevel: "aal1" | "aal2" | null;
  /**
   * The level this account's factors require, computed here from the verified factor
   * list rather than read back from the provider helper.
   *
   * This is deliberate. `getAuthenticatorAssuranceLevel()` derives its `nextLevel`
   * from `session.user.factors`, and on the server that session comes from the
   * request cookie, which carries no signature — the pinned client wraps that exact
   * object in an "may not be authentic" warning proxy. Deleting one key from that
   * cookie payload would report "no factors" and switch the whole second-factor
   * requirement off. `listFactors` goes through `getUser()`, a network call the
   * provider answers, so the factor list below is attested and this value is too.
   * Null when the factor inventory could not be read at all.
   */
  requiredLevel: "aal1" | "aal2" | null;
  /** True when verified factors exist, regardless of the current session level. */
  mfaEnrolled: boolean;
  /** True when this account's factors require more than this session has reached. */
  challengeRequired: boolean;
  /**
   * Whether the session's own level was readable. Reading it costs no factor lookup,
   * but it is not free of the network either: the pinned client refreshes the session
   * when it is inside its expiry margin, so this can fail on a transport error.
   */
  levelReadable: boolean;
  /**
   * Whether the *factor inventory* was readable. A failed inventory read must never
   * be allowed to look like "no factors are enrolled" to anything that makes a
   * security decision, which is why every mutation refuses while it is false.
   */
  factorsReadable: boolean;
};

export const EMPTY_ASSURANCE_STATE: AssuranceState = {
  verifiedTotpFactors: [],
  unverifiedTotpFactorIds: [],
  currentLevel: null,
  requiredLevel: null,
  mfaEnrolled: false,
  challengeRequired: false,
  levelReadable: false,
  factorsReadable: false,
};

type FactorLike = {
  id?: unknown;
  status?: unknown;
  factor_type?: unknown;
  friendly_name?: unknown;
  created_at?: unknown;
};

type AssuranceClient = {
  auth: {
    mfa: {
      listFactors: () => Promise<{ data: unknown; error: unknown }>;
      getAuthenticatorAssuranceLevel: () => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

function assuranceLevel(value: unknown): "aal1" | "aal2" | null {
  return value === "aal1" || value === "aal2" ? value : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function collectFactors(data: unknown): FactorLike[] | null {
  if (!data || typeof data !== "object") return null;
  const all = (data as { all?: unknown }).all;
  const totp = (data as { totp?: unknown }).totp;
  if (Array.isArray(all)) return all as FactorLike[];
  if (Array.isArray(totp)) return totp as FactorLike[];
  return null;
}

async function settled(
  call: () => Promise<{ data: unknown; error: unknown }>,
): Promise<{ data: unknown; error: unknown }> {
  try {
    return await call();
  } catch (error) {
    return { data: null, error: error ?? new Error("assurance lookup failed") };
  }
}

/**
 * Resolve the caller's factor and assurance state.
 *
 * Both halves of the challenge decision come from something the caller cannot forge:
 * the required level from the provider-attested factor list, the reached level from a
 * signed token claim. The two reads are reported independently so callers can take
 * different risks: rendering must not lock an owner out over a transport blip, while
 * a mutation must refuse anything it could not read.
 */
export async function resolveAssuranceState(client: AssuranceClient): Promise<AssuranceState> {
  let mfa: AssuranceClient["auth"]["mfa"];
  try {
    mfa = client.auth.mfa;
  } catch {
    return EMPTY_ASSURANCE_STATE;
  }

  const [factorsResult, levelResult] = await Promise.all([
    settled(() => mfa.listFactors()),
    settled(() => mfa.getAuthenticatorAssuranceLevel()),
  ]);

  const factors = factorsResult.error ? null : collectFactors(factorsResult.data);
  const verifiedTotpFactors: VerifiedTotpFactor[] = [];
  const unverifiedTotpFactorIds: string[] = [];
  for (const factor of factors ?? []) {
    const id = optionalString(factor.id);
    if (id === null || factor.factor_type !== "totp") continue;
    if (factor.status === "verified") {
      verifiedTotpFactors.push({
        id,
        friendlyName: optionalString(factor.friendly_name),
        createdAt: optionalString(factor.created_at),
      });
      continue;
    }
    unverifiedTotpFactorIds.push(id);
  }

  const levelData =
    !levelResult.error && levelResult.data && typeof levelResult.data === "object"
      ? (levelResult.data as { currentLevel?: unknown })
      : null;
  // Only the reached level is taken from this call. Its own `nextLevel` is ignored on
  // purpose: see `requiredLevel` above for why a cookie-derived factor list cannot be
  // allowed to decide whether a second factor is owed.
  const currentLevel = assuranceLevel(levelData?.currentLevel);
  const factorsReadable = factors !== null;
  const requiredLevel = factorsReadable ? (verifiedTotpFactors.length > 0 ? "aal2" : "aal1") : null;

  return {
    verifiedTotpFactors,
    unverifiedTotpFactorIds,
    currentLevel,
    requiredLevel,
    mfaEnrolled: verifiedTotpFactors.length > 0,
    // An unreadable level is not treated as a challenge here: rendering would then
    // bounce an owner to a challenge it cannot describe, possibly in a loop. Mutations
    // refuse it instead, through `levelReadable` in `assuranceForMutation`.
    challengeRequired: requiredLevel === "aal2" && currentLevel === "aal1",
    levelReadable: currentLevel !== null,
    factorsReadable,
  };
}

/**
 * The decision an account mutation needs, with no redirect.
 *
 * Page guards redirect an unsatisfied session to the challenge; a Server Action
 * cannot, so it needs the same answer as a value. Three outcomes, and both
 * non-satisfied ones refuse the mutation:
 *
 * - `challenge-required`: this account's verified factors require more than this
 *   session has reached. Without this check, enrolling TOTP would protect only page
 *   rendering while the actions behind those pages stayed reachable at AAL1 — which
 *   is the position an attacker who phished the password starts from, and the position
 *   that current-password reauthentication cannot improve on.
 * - `unavailable`: either half of the decision was unreadable. Both are required: an
 *   unread factor inventory cannot be treated as "no factors", and an unread level
 *   cannot be treated as "high enough". A mutation refused during an outage is a
 *   retry; a mutation allowed during one is unrecoverable.
 */
export type MutationAssurance = "satisfied" | "challenge-required" | "unavailable";

export function assuranceForMutation(state: AssuranceState): MutationAssurance {
  if (!state.levelReadable || !state.factorsReadable) return "unavailable";
  if (state.challengeRequired) return "challenge-required";
  return "satisfied";
}

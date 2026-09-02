import { z } from "zod";

export const PROFILE_UPDATE_RPC = "update_my_app_profile_v2";

const mutationResultSchema = z
  .object({
    user_id: z.string().uuid(),
    profile_version: z.number().int().positive(),
    updated_at: z.string().datetime({ offset: true }),
  })
  .strict();

export type ProfileMutationResult = z.infer<typeof mutationResultSchema>;

export function parseProfileMutationResult(data: unknown): ProfileMutationResult | null {
  const candidate = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data;
  const parsed = mutationResultSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Exact classification of a v2 RPC envelope. Only two shapes are trusted:
 *
 * - success: `error` is exactly `null` and `data` is exactly one valid receipt;
 * - stale: `data` is exactly `null` and `error.code` is exactly the string `"40001"`.
 *
 * Everything else is a service failure, including a missing/undefined `error`,
 * a mixed `{ data, error }` pair, a malformed receipt, a numeric `40001`, and a
 * thrown transport error. Failures never authorize UI success and never allow a
 * caller to treat a committed write as definitively rejected.
 */
export type ProfileMutationEnvelope =
  | { status: "success"; result: ProfileMutationResult }
  | { status: "stale" }
  | { status: "failure" };

function isDefinitiveStale(data: unknown, error: unknown): boolean {
  if (data !== null) return false;
  if (error === null || typeof error !== "object") return false;
  return "code" in error && (error as { code: unknown }).code === "40001";
}

export function classifyProfileMutationEnvelope(
  data: unknown,
  error: unknown,
): ProfileMutationEnvelope {
  if (isDefinitiveStale(data, error)) return { status: "stale" };
  if (error !== null) return { status: "failure" };
  const result = parseProfileMutationResult(data);
  return result ? { status: "success", result } : { status: "failure" };
}

export type ProfileVersionReader = {
  from: (table: "app_profiles") => {
    select: (columns: "profile_version") => {
      eq: (
        column: "user_id",
        value: string,
      ) => { maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }> };
    };
  };
};

/**
 * Read the caller's committed profile version after a definitive stale result so
 * the form can offer an immediate retry instead of requiring a manual reload.
 * Returns null when the value cannot be established exactly; the caller then
 * keeps its existing token rather than guessing.
 */
export async function readCommittedProfileVersion(
  client: ProfileVersionReader,
  userId: string,
): Promise<number | null> {
  try {
    const { data, error } = await client
      .from("app_profiles")
      .select("profile_version")
      .eq("user_id", userId)
      .maybeSingle();
    if (error !== null || !data || typeof data !== "object") return null;
    const version = (data as { profile_version?: unknown }).profile_version;
    return typeof version === "number" && Number.isSafeInteger(version) && version > 0
      ? version
      : null;
  } catch {
    return null;
  }
}

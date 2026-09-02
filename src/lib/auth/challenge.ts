export const CHALLENGE_FIELD_NAME = "cf-turnstile-response";
export const CHALLENGE_ERROR_MESSAGE = "Complete the security check and try again.";
export const MAX_CHALLENGE_TOKEN_LENGTH = 4_096;

export type ParsedChallengeToken =
  { success: true; token: string } | { success: false; message: typeof CHALLENGE_ERROR_MESSAGE };

export function parseChallengeToken(value: unknown): ParsedChallengeToken {
  if (typeof value !== "string") {
    return { success: false, message: CHALLENGE_ERROR_MESSAGE };
  }

  const token = value.trim();
  if (token.length === 0 || token.length > MAX_CHALLENGE_TOKEN_LENGTH) {
    return { success: false, message: CHALLENGE_ERROR_MESSAGE };
  }

  return { success: true, token };
}

import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const RECOVERY_AUTHORIZATION_COOKIE = "qt-recovery-authorization";
const RECOVERY_AUTHORIZATION_VERSION = 1;
const RECOVERY_AUTHORIZATION_TTL_SECONDS = 300;
const MAX_MARKER_LENGTH = 2_048;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

type RecoveryAuthorizationPayload = [
  version: 1,
  userId: string,
  issuedAt: number,
  expiresAt: number,
  nonce: string,
];

type RecoveryAuthorizationIdentity = {
  userId: string;
  accessToken: string;
  now?: Date;
};

type CreateRecoveryAuthorizationInput = RecoveryAuthorizationIdentity & {
  nonce?: string;
};

function signPayload(encodedPayload: string, accessToken: string): Buffer {
  return createHmac("sha256", accessToken)
    .update(`quantify-account-recovery-v1.${encodedPayload}`, "utf8")
    .digest();
}

function parsePayload(encodedPayload: string): RecoveryAuthorizationPayload | null {
  if (!BASE64URL_PATTERN.test(encodedPayload)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 5) return null;
    const [version, userId, issuedAt, expiresAt, nonce] = parsed;
    if (
      version !== RECOVERY_AUTHORIZATION_VERSION ||
      typeof userId !== "string" ||
      !UUID_PATTERN.test(userId) ||
      typeof issuedAt !== "number" ||
      !Number.isSafeInteger(issuedAt) ||
      typeof expiresAt !== "number" ||
      !Number.isSafeInteger(expiresAt) ||
      typeof nonce !== "string" ||
      nonce.length < 16 ||
      nonce.length > 128
    ) {
      return null;
    }
    return [version, userId, issuedAt, expiresAt, nonce];
  } catch {
    return null;
  }
}

export function createRecoveryAuthorizationValue({
  userId,
  accessToken,
  now = new Date(),
  nonce = randomBytes(16).toString("base64url"),
}: CreateRecoveryAuthorizationInput): string {
  if (!UUID_PATTERN.test(userId) || accessToken.length === 0 || Number.isNaN(now.getTime())) {
    throw new Error("Recovery authorization identity is invalid.");
  }

  const issuedAt = Math.floor(now.getTime() / 1_000);
  const payload: RecoveryAuthorizationPayload = [
    RECOVERY_AUTHORIZATION_VERSION,
    userId,
    issuedAt,
    issuedAt + RECOVERY_AUTHORIZATION_TTL_SECONDS,
    nonce,
  ];
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(encodedPayload, accessToken).toString("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyRecoveryAuthorizationValue(
  value: string,
  { userId, accessToken, now = new Date() }: RecoveryAuthorizationIdentity,
): boolean {
  if (
    value.length === 0 ||
    value.length > MAX_MARKER_LENGTH ||
    !UUID_PATTERN.test(userId) ||
    accessToken.length === 0 ||
    Number.isNaN(now.getTime())
  ) {
    return false;
  }

  const parts = value.split(".");
  if (parts.length !== 2) return false;
  const [encodedPayload, encodedSignature] = parts;
  if (!encodedPayload || !encodedSignature || !BASE64URL_PATTERN.test(encodedSignature)) {
    return false;
  }

  const payload = parsePayload(encodedPayload);
  if (!payload) return false;
  const [, markerUserId, issuedAt, expiresAt] = payload;
  const currentTime = Math.floor(now.getTime() / 1_000);
  if (
    markerUserId !== userId ||
    expiresAt - issuedAt !== RECOVERY_AUTHORIZATION_TTL_SECONDS ||
    issuedAt > currentTime + 30 ||
    expiresAt < currentTime
  ) {
    return false;
  }

  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    return false;
  }
  const expectedSignature = signPayload(encodedPayload, accessToken);
  return (
    suppliedSignature.length === expectedSignature.length &&
    timingSafeEqual(suppliedSignature, expectedSignature)
  );
}

export async function issueRecoveryAuthorization({
  userId,
  accessToken,
  secure,
  now = new Date(),
}: RecoveryAuthorizationIdentity & { secure: boolean }): Promise<void> {
  const store = await cookies();
  store.set(
    RECOVERY_AUTHORIZATION_COOKIE,
    createRecoveryAuthorizationValue({ userId, accessToken, now }),
    {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/reset-password",
      maxAge: RECOVERY_AUTHORIZATION_TTL_SECONDS,
      priority: "high",
    },
  );
}

export async function clearRecoveryAuthorization(): Promise<void> {
  const store = await cookies();
  store.delete({ name: RECOVERY_AUTHORIZATION_COOKIE, path: "/reset-password" });
}

export async function consumeRecoveryAuthorization(
  identity: RecoveryAuthorizationIdentity,
): Promise<boolean> {
  const store = await cookies();
  const value = store.get(RECOVERY_AUTHORIZATION_COOKIE)?.value;
  store.delete({ name: RECOVERY_AUTHORIZATION_COOKIE, path: "/reset-password" });
  return value ? verifyRecoveryAuthorizationValue(value, identity) : false;
}

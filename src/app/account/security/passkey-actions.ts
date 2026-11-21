"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AccountApiRequestError,
  completeAccountApiPasskeyRegistration,
  removeAccountApiPasskey,
  requestAccountApiPasskeyChallenge,
  requestAccountApiPasskeyRegistration,
  verifyAccountApiPasskey,
} from "@/lib/admin/account-api";
import { PASSKEY_NAME_MAX, type PasskeyStepResult } from "@/lib/passkeys/state";
import { portalOrigin, requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/supabase/server";

/**
 * The server half of every passkey step.
 *
 * The browser makes or uses the passkey; these actions carry the service's challenge out
 * and the device's answer back, with the session's own token. They decide nothing. What
 * a step demands (the password again, a recent proof with a passkey already held) is the
 * Account API's rule, and its refusals are turned into one sentence each here.
 *
 * The address a passkey is made for is the console's configured address, never one the
 * browser names: a passkey answers only to the address it was made at, and the service
 * checks that address against its own list as well.
 */

type OptionsJson = Record<string, unknown>;

const UNAVAILABLE: PasskeyStepResult<never> = {
  status: "error",
  reason: "unavailable",
  message: "Passkeys are temporarily unavailable. Please try again.",
};

const SIGNED_OUT: PasskeyStepResult<never> = {
  status: "error",
  reason: "signed-out",
  message: "Your session has ended. Sign in again, then retry.",
};

const passwordSchema = z.string().min(1).max(1024);
const nameSchema = z.string().max(400);
const passkeyIdSchema = z.guid();
// The browser's answer is passed through to the service, which checks every byte. Here it
// only has to be an object of a sane size, so nothing else can be smuggled along with it.
const credentialSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 24_000);

function refusalFor(error: unknown): PasskeyStepResult<never> {
  if (!(error instanceof AccountApiRequestError)) return UNAVAILABLE;
  const details = error.details;
  if (error.status === 429) {
    return {
      status: "error",
      reason: "rate-limited",
      message: "Too many attempts. Wait a few minutes, then try again.",
    };
  }
  if (error.status === 401) {
    if (details.reason === "invalid credentials") {
      return { status: "error", reason: "password", message: "That password is not correct." };
    }
    return SIGNED_OUT;
  }
  if (error.code === "second_factor_required") {
    if (details.second_factor === "enrol") {
      return {
        status: "error",
        reason: "needs-enrolment",
        message: "Add a passkey to this account first.",
      };
    }
    return {
      status: "error",
      reason: "needs-passkey",
      message: "Confirm with a passkey this account already has, then try again.",
    };
  }
  if ("origin" in details) {
    return {
      status: "error",
      reason: "address",
      message:
        "Passkeys are not set up for this address. Open the console at its own address and try again.",
    };
  }
  if ("challenge" in details) {
    return {
      status: "error",
      reason: "expired",
      message: "That took too long, or the step was already used. Start again.",
    };
  }
  if ("passkeys" in details && error.status === 400) {
    return {
      status: "error",
      reason: "refused",
      message: "This account already holds as many passkeys as it can. Remove one first.",
    };
  }
  if ("session" in details) return SIGNED_OUT;
  if (error.status === 404) {
    return {
      status: "error",
      reason: "refused",
      message: "That passkey is not on this account any more.",
    };
  }
  if (error.status === 400 || error.status === 403) {
    return {
      status: "error",
      reason: "refused",
      message: "That passkey was not accepted. Try again, or use another one.",
    };
  }
  return UNAVAILABLE;
}

async function session(): Promise<{ accessToken: string; origin: string } | null> {
  await requireSameOriginServerAction();
  const origin = portalOrigin();
  const azure = await createServerAzureClient();
  const accessToken = azure.getAccessToken();
  if (!accessToken || !origin) return null;
  return { accessToken, origin };
}

function key(): { idempotencyKey: string } {
  return { idempotencyKey: `portal-${randomUUID()}` };
}

function refresh(): void {
  revalidatePath("/account/security");
  revalidatePath("/admin", "layout");
  revalidatePath("/passkey");
}

/** Step one of adding a passkey: the password again, for the options the browser needs. */
export async function beginPasskeyRegistration(
  password: unknown,
): Promise<PasskeyStepResult<OptionsJson>> {
  try {
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      return { status: "error", reason: "password", message: "Enter your current password." };
    }
    const current = await session();
    if (!current) return SIGNED_OUT;
    const answer = await requestAccountApiPasskeyRegistration(
      current.accessToken,
      { password: parsed.data, origin: current.origin },
      key(),
    );
    return { status: "ok", value: answer.public_key };
  } catch (error) {
    return refusalFor(error);
  }
}

/** Step two: what the device made, and the name the person gave it. */
export async function finishPasskeyRegistration(
  name: unknown,
  credential: unknown,
): Promise<PasskeyStepResult> {
  try {
    const parsedName = nameSchema.safeParse(name);
    const parsedCredential = credentialSchema.safeParse(credential);
    if (!parsedName.success || !parsedCredential.success) return UNAVAILABLE;
    const current = await session();
    if (!current) return SIGNED_OUT;
    await completeAccountApiPasskeyRegistration(
      current.accessToken,
      { name: parsedName.data.trim().slice(0, PASSKEY_NAME_MAX), credential: parsedCredential.data },
      key(),
    );
    refresh();
    return { status: "ok", value: null };
  } catch (error) {
    return refusalFor(error);
  }
}

/** Step one of proving a passkey: the options the browser needs. */
export async function beginPasskeyVerification(): Promise<PasskeyStepResult<OptionsJson>> {
  try {
    const current = await session();
    if (!current) return SIGNED_OUT;
    const answer = await requestAccountApiPasskeyChallenge(
      current.accessToken,
      { origin: current.origin },
      key(),
    );
    return { status: "ok", value: answer.public_key };
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.status === 404) {
      return {
        status: "error",
        reason: "needs-enrolment",
        message: "This account has no passkey yet. Add one under Security.",
      };
    }
    return refusalFor(error);
  }
}

/** Step two: the device's answer. On success this session is proved as of now. */
export async function finishPasskeyVerification(credential: unknown): Promise<PasskeyStepResult> {
  try {
    const parsed = credentialSchema.safeParse(credential);
    if (!parsed.success) return UNAVAILABLE;
    const current = await session();
    if (!current) return SIGNED_OUT;
    await verifyAccountApiPasskey(current.accessToken, { credential: parsed.data }, key());
    refresh();
    return { status: "ok", value: null };
  } catch (error) {
    return refusalFor(error);
  }
}

/** Remove one of the account's own passkeys. The service asks for a recent proof. */
export async function removePasskey(passkeyId: unknown): Promise<PasskeyStepResult> {
  try {
    const parsed = passkeyIdSchema.safeParse(passkeyId);
    if (!parsed.success) return UNAVAILABLE;
    const current = await session();
    if (!current) return SIGNED_OUT;
    await removeAccountApiPasskey(current.accessToken, { passkey_id: parsed.data }, key());
    refresh();
    return { status: "ok", value: null };
  } catch (error) {
    return refusalFor(error);
  }
}

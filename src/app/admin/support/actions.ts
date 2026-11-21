"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  AccountApiRequestError,
  fetchAccountApiMe,
  manageAccountApiAdminSupport,
  replyToAccountApiAdminSupport,
  type AccountApiAdminSupportManageBody,
} from "@/lib/admin/account-api";
import {
  canManageSupport,
  canReplyToSupport,
  hasAdminPortalAccess,
  hasPrivilegedRole,
  hasSatisfiedPrivilegedAssurance,
} from "@/lib/admin/access";
import {
  isSupportPriority,
  isSupportStatus,
  SUPPORT_ID_PATTERN,
  SUPPORT_REPLY_MAX_LENGTH,
  type AdminSupportActionState,
} from "@/lib/admin/support-input";
import { getCurrentAssurance } from "@/lib/dal/assurance-guard";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/supabase/server";

/**
 * Answering a customer, and running the queue, from the console.
 *
 * Three properties hold this file together:
 *
 * 1. Nothing returned from here came back from the service. Every outcome is one of the
 *    literal strings below. An upstream error body names routes and correlation ids, and
 *    a 404 from the desk is deliberately ambiguous between "no such thread" and "not
 *    yours to read" — repeating its text would resolve the ambiguity the API created on
 *    purpose.
 * 2. Every action re-derives the caller. A Server Action is a POST endpoint of its own,
 *    so the page's gate is not its gate: origin, identity, capability and assurance are
 *    checked here as well, in that order, before anything is sent.
 * 3. Every write carries its own idempotency key, so a double submission is one reply
 *    rather than two the customer has to read.
 */

const failure = (message: string): AdminSupportActionState => ({ status: "error", message });

/** One value for a name, of bounded size, or nothing. Repeated fields are a rejection. */
function singleValue(formData: FormData, name: string, limit: number): string | null {
  const values = formData.getAll(name);
  if (values.length > 1) return null;
  const value = values[0];
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > limit) return null;
  return value;
}

function conversationId(formData: FormData): string | null {
  const raw = singleValue(formData, "conversationId", 64);
  if (raw === null) return null;
  const candidate = raw.trim();
  return SUPPORT_ID_PATTERN.test(candidate) ? candidate : null;
}

type Caller = { ok: true; accessToken: string } | { ok: false; message: string };

/**
 * The caller, checked against the one capability this action needs.
 *
 * Reading the queue is not enough for either action here: answering and running the queue
 * are separate permissions upstream, and an agent who can do one is routinely not meant
 * to do the other.
 */
async function deskCaller(
  permits: (me: Awaited<ReturnType<typeof fetchAccountApiMe>>) => boolean,
  refusal: string,
): Promise<Caller> {
  const azure = await createServerAzureClient();
  const accessToken = azure.getAccessToken();
  if (!accessToken) return { ok: false, message: "Sign in again to answer a conversation." };

  const me = await fetchAccountApiMe(accessToken);
  if (!hasAdminPortalAccess(me) || !permits(me)) return { ok: false, message: refusal };

  if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(await getCurrentAssurance())) {
    return { ok: false, message: "Verify your authenticator code before using the support desk." };
  }
  return { ok: true, accessToken };
}

function refreshed(id: string): void {
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${id}`);
}

/** What the desk is told when the service refuses. Never the service's own words. */
function deskFailure(error: unknown): AdminSupportActionState {
  if (error instanceof AccountApiRequestError) {
    if (error.status === 404) {
      return failure("That conversation is no longer available to you. Reload the queue.");
    }
    if (error.status === 409) {
      return failure("Somebody else answered this first. Reload the conversation and read it.");
    }
    if (error.status === 403) return failure("This account cannot do that.");
    if (error.status === 400)
      return failure("That could not be sent. Check the message and retry.");
  }
  return failure("The support desk is unreachable right now. Nothing was sent.");
}

export async function replyToSupportConversation(
  _state: AdminSupportActionState,
  formData: FormData,
): Promise<AdminSupportActionState> {
  const id = conversationId(formData);
  const body = singleValue(formData, "body", SUPPORT_REPLY_MAX_LENGTH);
  if (!id) return failure("That conversation could not be identified. Reload the queue.");
  if (body === null) return failure("That reply is too long to send.");
  if (!body.trim()) return failure("Write a reply before sending.");

  try {
    await requireSameOriginServerAction();
    const caller = await deskCaller(
      canReplyToSupport,
      "This account cannot answer support conversations.",
    );
    if (!caller.ok) return failure(caller.message);

    await replyToAccountApiAdminSupport(
      caller.accessToken,
      id,
      { body: body.trim() },
      { idempotencyKey: `portal-${randomUUID()}` },
    );
    refreshed(id);
    return { status: "success", message: "Sent. The customer sees it in the app and here." };
  } catch (error) {
    return deskFailure(error);
  }
}

export async function manageSupportConversation(
  _state: AdminSupportActionState,
  formData: FormData,
): Promise<AdminSupportActionState> {
  const id = conversationId(formData);
  if (!id) return failure("That conversation could not be identified. Reload the queue.");

  const assignee = singleValue(formData, "assigneeId", 64);
  const assigneeName = singleValue(formData, "assigneeName", 160);
  const status = singleValue(formData, "status", 32);
  const priority = singleValue(formData, "priority", 32);
  if (assignee === null || assigneeName === null || status === null || priority === null) {
    return failure("That change could not be read. Reload the conversation and try again.");
  }

  const body: AccountApiAdminSupportManageBody = {};
  // Present-but-empty is meaningful on the assignee: it is how a conversation is handed
  // back to the unassigned queue. Every other field is only sent when it has a value.
  if (formData.has("assigneeId")) {
    body.assignee_id = assignee.trim();
    if (assigneeName.trim()) body.assignee_name = assigneeName.trim();
  }
  const requestedStatus = status.trim();
  if (requestedStatus) {
    if (!isSupportStatus(requestedStatus)) return failure("That status is not one the desk uses.");
    body.status = requestedStatus;
  }
  const requestedPriority = priority.trim();
  if (requestedPriority) {
    if (!isSupportPriority(requestedPriority)) {
      return failure("That priority is not one the desk uses.");
    }
    body.priority = requestedPriority;
  }
  if (Object.keys(body).length === 0) return failure("Nothing was changed.");

  try {
    await requireSameOriginServerAction();
    const caller = await deskCaller(
      canManageSupport,
      "This account cannot assign or close support conversations.",
    );
    if (!caller.ok) return failure(caller.message);

    await manageAccountApiAdminSupport(caller.accessToken, id, body, {
      idempotencyKey: `portal-${randomUUID()}`,
    });
    refreshed(id);
    return { status: "success", message: "Queue updated." };
  } catch (error) {
    return deskFailure(error);
  }
}

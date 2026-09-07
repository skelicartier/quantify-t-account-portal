"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  AccountApiRequestError,
  enqueueAccountApiAdminNotificationEmail,
  fetchAccountApiAdminNotificationEmailQueue,
  fetchAccountApiMe,
} from "@/lib/admin/account-api";
import {
  canManageNotifications,
  hasAdminPortalAccess,
  hasSatisfiedPrivilegedAssurance,
} from "@/lib/admin/access";
import { getCurrentAssurance } from "@/lib/dal/assurance-guard";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import {
  NOTIFICATION_EMAIL_QUEUE_BODY_BYTE_LIMIT,
  NOTIFICATION_EMAIL_QUEUE_LIMIT,
  notificationEmailInputSchema,
  notificationEmailRevisionSchema,
  type NotificationEmailActionState,
} from "@/lib/notifications/email-input";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const failure = (message: string): NotificationEmailActionState => ({
  status: "error",
  message,
});

export async function enqueueAdminEmail(
  _previous: NotificationEmailActionState,
  formData: FormData,
): Promise<NotificationEmailActionState> {
  const revision = notificationEmailRevisionSchema.safeParse(formData.get("revision"));
  const raw = formData.get("email");
  if (
    !revision.success ||
    typeof raw !== "string" ||
    Buffer.byteLength(raw, "utf8") > NOTIFICATION_EMAIL_QUEUE_BODY_BYTE_LIMIT ||
    formData.getAll("revision").length !== 1 ||
    formData.getAll("email").length !== 1
  ) {
    return failure("Check the email fields and try again.");
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return failure("Check the email fields and try again.");
  }
  const parsed = notificationEmailInputSchema.safeParse(value);
  if (!parsed.success) return failure("Check the subject, body, recipients, and schedule.");

  try {
    await requireSameOriginServerAction();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (error || !accessToken) return failure("Sign in again to queue email.");
    const me = await fetchAccountApiMe(accessToken);
    if (!hasAdminPortalAccess(me) || !canManageNotifications(me)) {
      return failure("This account cannot queue email.");
    }
    if (!hasSatisfiedPrivilegedAssurance(await getCurrentAssurance())) {
      return failure("Verify your authenticator code before queueing email.");
    }
    const current = await fetchAccountApiAdminNotificationEmailQueue(accessToken);
    if (current.revision !== revision.data)
      return failure("The email queue changed. Reload the page before queueing again.");
    if (current.jobs.length >= NOTIFICATION_EMAIL_QUEUE_LIMIT)
      return failure("The email queue is full.");
    await enqueueAccountApiAdminNotificationEmail(
      accessToken,
      { ...parsed.data, expected_revision: revision.data },
      { idempotencyKey: `portal-${randomUUID()}` },
    );
    revalidatePath("/admin/email");
    return { status: "success", message: "Email queued." };
  } catch (error) {
    if (error instanceof AccountApiRequestError) {
      if (error.status === 409) {
        return failure("The email queue changed. Reload the page before queueing again.");
      }
      if (error.code === "quota_exceeded") {
        return failure("The email queue quota has been reached. Retry later.");
      }
    }
    return failure("Email could not be queued. Reload to check the latest queue before retrying.");
  }
}

"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { recordAccountApiNotificationReceipt } from "@/lib/admin/account-api";
import { requireMutationAssurance } from "@/lib/dal/assurance-guard";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { NotificationActionState } from "@/lib/notifications/input";

export async function acknowledgeNotification(
  _previous: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const failure: NotificationActionState = {
    status: "error",
    message: "Your response could not be saved. Please try again.",
  };
  const id = formData.get("notificationId");
  const status = formData.get("status");
  if (
    typeof id !== "string" ||
    !/^[a-z0-9][a-z0-9_-]{5,63}$/u.test(id) ||
    !["read", "dismissed", "clicked"].includes(String(status)) ||
    formData.getAll("notificationId").length !== 1 ||
    formData.getAll("status").length !== 1
  )
    return failure;
  try {
    await requireSameOriginServerAction();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) return failure;
    if ((await requireMutationAssurance()).decision !== "satisfied") return failure;
    await recordAccountApiNotificationReceipt(
      data.session.access_token,
      id,
      status as "read" | "dismissed" | "clicked",
      {
        idempotencyKey: `portal-${randomUUID()}`,
      },
    );
    revalidatePath("/account/notifications");
    return {
      status: "success",
      message: status === "dismissed" ? "Dismissal recorded." : "Response recorded.",
    };
  } catch {
    return failure;
  }
}

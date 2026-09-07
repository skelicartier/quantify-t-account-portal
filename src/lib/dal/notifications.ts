import "server-only";

import { redirect } from "next/navigation";
import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  fetchAccountApiNotificationState,
  fetchAccountApiNotifications,
} from "@/lib/admin/account-api";
import { requireCurrentAccount } from "@/lib/dal/account";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function requireCurrentNotificationCenter() {
  await requireCurrentAccount();
  const supabase = await createServerSupabaseClient({ cookieWriteMode: "best-effort" });
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new AccountApiUnavailableError();
  if (!data.session?.access_token) redirect("/login?next=%2Faccount%2Fnotifications");
  try {
    const [document, state] = await Promise.all([
      fetchAccountApiNotifications(data.session.access_token),
      fetchAccountApiNotificationState(data.session.access_token),
    ]);
    return { document, state };
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.status === 401) {
      redirect("/login?next=%2Faccount%2Fnotifications");
    }
    throw new AccountApiUnavailableError();
  }
}

export async function requireCurrentNotifications() {
  return (await requireCurrentNotificationCenter()).document;
}

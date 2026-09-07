import "server-only";

import { redirect } from "next/navigation";
import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  fetchAccountApiNotificationState,
  fetchAccountApiNotifications,
} from "@/lib/admin/account-api";
import { requireCurrentAccount } from "@/lib/dal/account";
import { createServerAzureClient } from "@/lib/supabase/server";

export async function requireCurrentNotificationCenter() {
  await requireCurrentAccount();
  const azure = await createServerAzureClient({ cookieWriteMode: "best-effort" });
  const accessToken = azure.getAccessToken();
  if (!accessToken) redirect("/login?next=%2Faccount%2Fnotifications");
  try {
    const [document, state] = await Promise.all([
      fetchAccountApiNotifications(accessToken),
      fetchAccountApiNotificationState(accessToken),
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

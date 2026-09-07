import "server-only";

import { redirect } from "next/navigation";

import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  fetchAccountApiAccountLifecycle,
} from "@/lib/admin/account-api";
import { requireCurrentAccount } from "@/lib/dal/account";
import { createServerAzureClient } from "@/lib/supabase/server";

export async function requireCurrentAccountLifecycle() {
  await requireCurrentAccount();
  const azure = await createServerAzureClient({ cookieWriteMode: "best-effort" });
  const accessToken = azure.getAccessToken();
  if (!accessToken) redirect("/login?next=%2Faccount%2Fdata");
  try {
    return await fetchAccountApiAccountLifecycle(accessToken);
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.status === 401) {
      redirect("/login?next=%2Faccount%2Fdata");
    }
    throw new AccountApiUnavailableError();
  }
}

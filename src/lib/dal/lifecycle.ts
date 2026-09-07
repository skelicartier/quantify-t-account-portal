import "server-only";

import { redirect } from "next/navigation";

import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  fetchAccountApiAccountLifecycle,
} from "@/lib/admin/account-api";
import { requireCurrentAccount } from "@/lib/dal/account";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function requireCurrentAccountLifecycle() {
  await requireCurrentAccount();
  const supabase = await createServerSupabaseClient({ cookieWriteMode: "best-effort" });
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new AccountApiUnavailableError();
  if (!data.session?.access_token) redirect("/login?next=%2Faccount%2Fdata");
  try {
    return await fetchAccountApiAccountLifecycle(data.session.access_token);
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.status === 401) {
      redirect("/login?next=%2Faccount%2Fdata");
    }
    throw new AccountApiUnavailableError();
  }
}

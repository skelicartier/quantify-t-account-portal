import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { loadAccountOverview, type AccountDataClient } from "@/lib/dal/account-query";
import type { AccountOverviewDto } from "@/lib/dto/account";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const getCurrentAccount = cache(async (): Promise<AccountOverviewDto | null> => {
  try {
    const client = await createServerSupabaseClient({ cookieWriteMode: "best-effort" });
    return await loadAccountOverview(client as unknown as AccountDataClient);
  } catch {
    return null;
  }
});

export async function requireCurrentAccount(): Promise<AccountOverviewDto> {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");
  return account;
}

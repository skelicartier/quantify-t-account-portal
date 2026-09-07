import "server-only";

import { headers } from "next/headers";

import { getSupabasePublicConfiguration } from "@/lib/supabase/config";

export class SameOriginActionError extends Error {
  constructor() {
    super("Server Action request did not come from the configured portal origin.");
    this.name = "SameOriginActionError";
  }
}

function originFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function configuredPortalOrigin(): string | null {
  try {
    return originFromUrl(getSupabasePublicConfiguration().siteUrl);
  } catch {
    return null;
  }
}

function requestOrigin(headersList: Headers): string | null {
  return originFromUrl(headersList.get("origin")) ?? originFromUrl(headersList.get("referer"));
}

export async function requireSameOriginServerAction(): Promise<void> {
  let headersList: Headers;
  try {
    headersList = await headers();
  } catch {
    if (process.env.NODE_ENV !== "production") return;
    throw new SameOriginActionError();
  }

  const expectedOrigin = configuredPortalOrigin();
  const actualOrigin = requestOrigin(headersList);
  if (!expectedOrigin || !actualOrigin || actualOrigin !== expectedOrigin) {
    throw new SameOriginActionError();
  }
}

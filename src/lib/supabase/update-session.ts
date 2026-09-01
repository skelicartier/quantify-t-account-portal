import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublicConfiguration } from "@/lib/supabase/config";

export type RefreshedSupabaseSession = {
  response: NextResponse;
  user: User | null;
};

export async function updateSupabaseSession(
  request: NextRequest,
): Promise<RefreshedSupabaseSession> {
  let response = NextResponse.next({ request });
  const { url, publishableKey, cookieOptions } = getSupabasePublicConfiguration();
  const supabase = createServerClient(url, publishableKey, {
    cookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headersToSet)) {
          response.headers.set(name, value);
        }
      },
    },
  });

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    return { response, user: error ? null : user };
  } catch {
    return { response, user: null };
  }
}

export function copyResponseCookies(source: NextResponse, target: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}

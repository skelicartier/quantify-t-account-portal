import { NextResponse, type NextRequest } from "next/server";

import { buildLoginRedirectUrl, isProtectedAccountPath } from "@/lib/auth/route-policy";
import { copyResponseCookies, updateSupabaseSession } from "@/lib/supabase/update-session";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (!isProtectedAccountPath(request.nextUrl.pathname)) return NextResponse.next();

  try {
    const { response, user } = await updateSupabaseSession(request);
    if (user) return response;

    const redirectResponse = NextResponse.redirect(buildLoginRedirectUrl(request.nextUrl));
    return copyResponseCookies(response, redirectResponse);
  } catch {
    return NextResponse.redirect(buildLoginRedirectUrl(request.nextUrl));
  }
}

export const config = {
  matcher: ["/account/:path*"],
};

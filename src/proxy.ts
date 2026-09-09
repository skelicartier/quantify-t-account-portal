import { NextResponse, type NextRequest } from "next/server";

import { buildLoginRedirectUrl, isProtectedPortalPath } from "@/lib/auth/route-policy";
import { copyResponseCookies, updateSession } from "@/lib/supabase/update-session";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (!isProtectedPortalPath(request.nextUrl.pathname)) return NextResponse.next();

  try {
    const { response, user } = await updateSession(request);
    if (user) return response;

    const redirectResponse = NextResponse.redirect(buildLoginRedirectUrl(request.nextUrl));
    return copyResponseCookies(response, redirectResponse);
  } catch (e) {
    console.error("[PROXY ERROR]", e instanceof Error ? e.message : String(e));
    return NextResponse.redirect(buildLoginRedirectUrl(request.nextUrl));
  }
}

export const config = {
  matcher: ["/account/:path*", "/admin/:path*"],
};

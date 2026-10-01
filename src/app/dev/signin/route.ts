import { NextResponse, type NextRequest } from "next/server";

import { registerCurrentAccountApiSession } from "@/lib/account/session-lifecycle";
import {
  DEV_PASSWORD,
  DEV_PERSONAS,
  devAutologinPersona,
  isDevPersona,
} from "@/lib/auth/dev-bypass";
import { sanitizeNextPath } from "@/lib/auth/login";
import { createServerAzureClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `GET /dev/signin?as=<persona>&next=<path>`: signs in against the local mock as that
 * persona and lands on `next`. Development only; see `dev-bypass.ts`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const flag = devAutologinPersona();
  if (!flag) return new NextResponse("Not found", { status: 404 });
  // Back to the host the browser used (localhost or 127.0.0.1): cookies are per host.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const origin = `${request.nextUrl.protocol}//${host}`;
  const requested = request.nextUrl.searchParams.get("as") ?? flag;
  const email = isDevPersona(requested) ? requested : DEV_PERSONAS[0].email;
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
  try {
    const azure = await createServerAzureClient();
    // Whoever was signed in before is signed out first, so switching persona switches.
    azure.clearSession();
    const { data, error } = await azure.signInWithPassword(email, DEV_PASSWORD);
    if (error || !data?.session) {
      return NextResponse.redirect(new URL("/login?form=1&notice=dev-unavailable", origin));
    }
    await registerCurrentAccountApiSession(azure);
  } catch {
    return NextResponse.redirect(new URL("/login?form=1&notice=dev-unavailable", origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}

import { NextResponse } from "next/server";

import { copyResponseCookies } from "@/lib/supabase/update-session";

describe("Supabase session response", () => {
  it("preserves refreshed cookie security attributes on an authentication redirect", () => {
    const refreshed = NextResponse.next();
    refreshed.cookies.set("sb-session", "refreshed-value", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
    const redirect = NextResponse.redirect("https://console.quantifyterminal.com/login");

    copyResponseCookies(refreshed, redirect);

    expect(redirect.cookies.get("sb-session")).toMatchObject({
      name: "sb-session",
      value: "refreshed-value",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
  });
});

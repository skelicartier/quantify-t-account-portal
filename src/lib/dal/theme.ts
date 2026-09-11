import "server-only";

import { cookies } from "next/headers";

import { CONSOLE_THEME_COOKIE, DEFAULT_CONSOLE_THEME, parseConsoleTheme } from "@/lib/theme";
import type { ConsoleTheme } from "@/lib/theme";

/** The console theme for this request; dark whenever the cookie is absent or unreadable. */
export async function readConsoleTheme(): Promise<ConsoleTheme> {
  try {
    const store = await cookies();
    return parseConsoleTheme(store.get(CONSOLE_THEME_COOKIE)?.value);
  } catch {
    return DEFAULT_CONSOLE_THEME;
  }
}

export const CONSOLE_THEMES = ["dark", "light"] as const;

export type ConsoleTheme = (typeof CONSOLE_THEMES)[number];

export const DEFAULT_CONSOLE_THEME: ConsoleTheme = "dark";

/** Device-level preference for the signed-in console; the sign-in pages are always dark. */
export const CONSOLE_THEME_COOKIE = "qt-console-theme";

export const CONSOLE_THEME_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isConsoleTheme(value: unknown): value is ConsoleTheme {
  return typeof value === "string" && (CONSOLE_THEMES as readonly string[]).includes(value);
}

export function parseConsoleTheme(value: unknown): ConsoleTheme {
  return isConsoleTheme(value) ? value : DEFAULT_CONSOLE_THEME;
}

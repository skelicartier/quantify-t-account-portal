/**
 * The development sign-in bypass, for looking at the console before the Account API is
 * live: on only when this is not a production build, `CONSOLE_DEV_AUTOLOGIN` names a
 * persona in `.env.local`, AND the Account API it points at is on this machine (the
 * mock). In a production build, or against any real service, it is off: the route
 * answers not-found and the proxy and the sign-in page behave as they always do.
 */

export const DEV_PERSONAS = [
  { email: "owner@example.test", label: "Owner" },
  { email: "admin@example.test", label: "Admin" },
  { email: "support@example.test", label: "Support" },
  { email: "user@example.test", label: "Customer" },
] as const;

/** The mock takes any password of eight characters or more. */
export const DEV_PASSWORD = "password-1234";

function pointsAtThisMachine(raw: string | undefined): boolean {
  try {
    const host = new URL((raw ?? "").trim() || "http://localhost:7071/api/v1").hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

export function devAutologinPersona(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  if (!pointsAtThisMachine(process.env.QT_ACCOUNT_API_URL)) return null;
  const value = (process.env.CONSOLE_DEV_AUTOLOGIN ?? "").trim();
  return value ? value : null;
}

export function isDevPersona(email: string): boolean {
  return DEV_PERSONAS.some((persona) => persona.email === email);
}

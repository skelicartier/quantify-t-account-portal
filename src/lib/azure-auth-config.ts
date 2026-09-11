/**
 * Azure Auth Configuration.
 *
 * The portal talks to the Account API for auth. Local development may fall back to
 * the Functions host, but production must name the deployed API explicitly.
 */

export interface AzureAuthConfig {
  apiUrl: string;
  cookieName: string;
  refreshTokenName: string;
  cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax" | "strict" | "none";
    path: string;
  };
}

function normalizeAccountApiUrl(raw: string | undefined): string {
  const fallback = process.env.NODE_ENV === "production" ? "" : "http://localhost:7071/api/v1";
  const value = (raw || fallback).trim().replace(/\/+$/u, "");
  if (!value) throw new Error("QT_ACCOUNT_API_URL is required for Azure auth.");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("QT_ACCOUNT_API_URL must be a valid URL.");
  }

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password) {
    throw new Error("QT_ACCOUNT_API_URL must not include credentials.");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("QT_ACCOUNT_API_URL must use HTTPS in production.");
  }
  if (!local && url.protocol !== "https:") {
    throw new Error("QT_ACCOUNT_API_URL must use HTTPS unless it points to localhost.");
  }
  if (url.search || url.hash) {
    throw new Error("QT_ACCOUNT_API_URL must not include query or fragment parts.");
  }

  return value;
}

export function getAzureAuthConfig(): AzureAuthConfig {
  return {
    apiUrl: normalizeAccountApiUrl(process.env.QT_ACCOUNT_API_URL),
    cookieName: "qt-session",
    refreshTokenName: "qt-refresh",
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

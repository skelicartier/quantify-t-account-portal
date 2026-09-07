/**
 * Azure Auth Configuration
 * 
 * Replaces Supabase config with Azure SQL auth settings.
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

export function getAzureAuthConfig(): AzureAuthConfig {
  return {
    apiUrl: process.env.QT_ACCOUNT_API_URL || "http://localhost:7071",
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

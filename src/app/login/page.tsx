import Link from "next/link";

import { login } from "@/app/login/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { sanitizeNextPath } from "@/lib/auth/login";
import { getSupabasePublicConfiguration } from "@/lib/supabase/config";

export const metadata = {
  title: "Sign in",
};

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    notice?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const parameters = await searchParams;
  const requestedPath = Array.isArray(parameters.next) ? parameters.next[0] : parameters.next;
  const notice = Array.isArray(parameters.notice) ? parameters.notice[0] : parameters.notice;
  const nextPath = sanitizeNextPath(requestedPath);
  const providerLogoutIncomplete = notice === "logout-incomplete";
  const invalidAuthLink = notice === "invalid-auth-link";
  const passwordUpdated = notice === "password-updated";
  const { turnstileSiteKey } = getSupabasePublicConfiguration();

  return (
    <AuthShell
      eyebrow="Secure account access"
      title="Sign in to Quantify Terminal"
      description="Use the same verified account that connects your desktop terminal."
    >
      {providerLogoutIncomplete && (
        <div className="auth-alert" role="status">
          This browser is signed out, but provider session cleanup could not be confirmed. Sign in
          again only on a trusted device.
        </div>
      )}
      {invalidAuthLink && (
        <div className="auth-alert" role="status">
          This confirmation or recovery link is invalid or has expired. Request a new email and try
          again.
        </div>
      )}
      {passwordUpdated && (
        <div className="auth-alert auth-alert--success" role="status">
          Your password was updated. Sign in with the new password.
        </div>
      )}

      <LoginForm action={login} nextPath={nextPath} turnstileSiteKey={turnstileSiteKey} />

      <p className="auth-card__footer">
        Need a Quantify Terminal account? <Link href="/signup">Create an account</Link>
      </p>
    </AuthShell>
  );
}

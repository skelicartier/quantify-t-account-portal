import Link from "next/link";

import { login, verifyLoginChallenge } from "@/app/login/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { Callout } from "@/components/ui/callout";
import { sanitizeNextPath } from "@/lib/auth/login";

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

const NOTICES: Record<string, { tone: "neutral" | "success" | "attention"; text: string }> = {
  "logout-incomplete": {
    tone: "attention",
    text: "This browser is signed out, but the session could not be fully closed on the server. Sign in again only on a trusted device.",
  },
  "invalid-auth-link": {
    tone: "attention",
    text: "This confirmation or recovery link is invalid or has expired. Request a new email and try again.",
  },
  "invalid-confirm-link": {
    tone: "attention",
    text: "This confirmation or recovery link is invalid or has expired. Request a new email and try again.",
  },
  "email-confirmed": {
    tone: "success",
    text: "Your email address is confirmed. Sign in to continue.",
  },
  "password-updated": {
    tone: "success",
    text: "Your password was updated. Sign in with the new password.",
  },
  "mfa-required": {
    tone: "neutral",
    text: "This account requires an authenticator code. Sign in with your password to continue to the code step.",
  },
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const parameters = await searchParams;
  const requestedPath = Array.isArray(parameters.next) ? parameters.next[0] : parameters.next;
  const noticeKey = Array.isArray(parameters.notice) ? parameters.notice[0] : parameters.notice;
  const nextPath = sanitizeNextPath(requestedPath);
  const notice = noticeKey ? NOTICES[noticeKey] : undefined;
  // Turnstile enforcement is not enabled for this deployment; the field stays inert.
  const turnstileSiteKey = "";

  return (
    <AuthShell
      title="Sign in to Quantify Terminal"
      description="Use the account that connects your desktop terminal."
    >
      {notice && (
        <div className="auth-form">
          <Callout tone={notice.tone} role="status" compact>
            {notice.text}
          </Callout>
        </div>
      )}

      <LoginForm
        action={login}
        challengeAction={verifyLoginChallenge}
        nextPath={nextPath}
        turnstileSiteKey={turnstileSiteKey}
      />

      <p className="auth__switch">
        Need a Quantify Terminal account? <Link href="/signup">Create an account</Link>
      </p>
    </AuthShell>
  );
}

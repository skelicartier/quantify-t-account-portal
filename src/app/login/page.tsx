import Link from "@/components/ui/link";
import { redirect } from "next/navigation";

import { login, verifyLoginChallenge } from "@/app/login/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { Callout } from "@/components/ui/callout";
import { isDesktopConnectNextPath } from "@/lib/auth/desktop-connect";
import { devAutologinPersona } from "@/lib/auth/dev-bypass";
import { sanitizeNextPath } from "@/lib/auth/login";
import { turnstileSiteKey as resolveTurnstileSiteKey } from "@/lib/auth/turnstile";

export const metadata = {
  title: "Sign in",
};

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    notice?: string | string[];
    form?: string | string[];
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
  "dev-unavailable": {
    tone: "attention",
    text: "The demo sign-in could not reach the local mock. Start it with npm run mock:api, or sign in below.",
  },
  "mfa-required": {
    tone: "neutral",
    text: "This account is protected by a passkey. Sign in with your password, then confirm with the passkey.",
  },
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const parameters = await searchParams;
  const requestedPath = Array.isArray(parameters.next) ? parameters.next[0] : parameters.next;
  const noticeKey = Array.isArray(parameters.notice) ? parameters.notice[0] : parameters.notice;
  const nextPath = sanitizeNextPath(requestedPath);
  const notice = noticeKey ? NOTICES[noticeKey] : undefined;
  // Development only: the demo skips this page (the form stays at `/login?form=1`).
  if (devAutologinPersona() && !noticeKey && !parameters.form) {
    redirect(`/dev/signin?next=${encodeURIComponent(nextPath)}`);
  }
  // The desktop app sent the visitor here; the handoff rides along into sign-up too.
  const returnsToDesktop = isDesktopConnectNextPath(nextPath);
  // Rendered only when the challenge is fully configured — both the site key AND the secret
  // this server verifies tokens with. A widget nothing verifies is theatre, and the site key
  // alone was set in production while every page hardcoded "".
  const turnstileSiteKey = resolveTurnstileSiteKey();

  return (
    <AuthShell title="Sign in">
      {notice && (
        <div className="auth-form">
          <Callout tone={notice.tone} role="status" compact>
            {notice.text}
          </Callout>
        </div>
      )}
      {returnsToDesktop && (
        <div className="auth-form">
          <Callout tone="neutral" role="status" compact>
            Sign in to connect the desktop app on this computer. You&apos;ll be returned to it
            automatically.
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
        New here?{" "}
        <Link href={returnsToDesktop ? `/signup?next=${encodeURIComponent(nextPath)}` : "/signup"}>
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

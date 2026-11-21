import Link from "@/components/ui/link";

import { signup } from "@/app/signup/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { Callout } from "@/components/ui/callout";
import { isDesktopConnectNextPath } from "@/lib/auth/desktop-connect";
import { sanitizeNextPath } from "@/lib/auth/login";
import { turnstileSiteKey as resolveTurnstileSiteKey } from "@/lib/auth/turnstile";

export const metadata = {
  title: "Create account",
};

export const dynamic = "force-dynamic";

type SignupPageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const parameters = await searchParams;
  const requestedPath = Array.isArray(parameters.next) ? parameters.next[0] : parameters.next;
  const nextPath = sanitizeNextPath(requestedPath);
  // Only the desktop handoff is worth carrying through sign-up and email confirmation.
  const returnsToDesktop = isDesktopConnectNextPath(nextPath);
  // Rendered only when the challenge is fully configured — both the site key AND the secret
  // this server verifies tokens with. A widget nothing verifies is theatre, and the site key
  // alone was set in production while every page hardcoded "".
  const turnstileSiteKey = resolveTurnstileSiteKey();

  return (
    <AuthShell
      title="Create your account"
      description="One account for this console and your desktop terminal."
    >
      {returnsToDesktop && (
        <div className="auth-form">
          <Callout tone="neutral" role="status" compact>
            Create your account, confirm your email, then sign in. You&apos;ll be returned to
            Quantify Terminal on this computer.
          </Callout>
        </div>
      )}

      <SignupForm
        action={signup}
        turnstileSiteKey={turnstileSiteKey}
        nextPath={returnsToDesktop ? nextPath : undefined}
      />

      <p className="auth__switch">
        Already have an account?{" "}
        <Link href={returnsToDesktop ? `/login?next=${encodeURIComponent(nextPath)}` : "/login"}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

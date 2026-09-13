import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { desktopConnectNextPath } from "@/lib/auth/desktop-connect";

export const metadata: Metadata = {
  title: "Email verified",
};

export const dynamic = "force-dynamic";

type ConfirmedPageProps = {
  searchParams: Promise<{
    reason?: string | string[];
    next?: string | string[];
  }>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Where the confirmation email's button lands. The token was already spent by
 * /auth/confirm, so this page only states the outcome and points at sign-in; a desktop
 * handoff that survived sign-up rides along so the app can be connected right after.
 */
export default async function ConfirmedPage({ searchParams }: ConfirmedPageProps) {
  const parameters = await searchParams;
  const reason = first(parameters.reason);
  const invalid = reason === "invalid-confirm-link";
  const throttled = reason === "too-many-attempts";
  const handoffPath = desktopConnectNextPath(first(parameters.next));
  const signInHref = handoffPath ? `/login?next=${encodeURIComponent(handoffPath)}` : "/login";

  if (throttled) {
    return (
      <AuthShell
        title="Too many attempts"
        description="Too many confirmation links have been opened from here recently. Your link has not been used up — wait a few minutes and open it again."
      >
        <div className="auth-form">
          <ButtonLink href="/login" variant="ghost" block>
            Back to sign in
          </ButtonLink>
        </div>
      </AuthShell>
    );
  }

  if (invalid) {
    return (
      <AuthShell
        title="This link is invalid or has expired"
        description="Confirmation links work once and expire after a day. Sign in to get a new one, or reset your password if you can't get in."
      >
        <div className="auth-form">
          <ButtonLink href="/login" block>
            Sign in
          </ButtonLink>
          <ButtonLink href="/forgot-password" variant="ghost" block>
            Reset your password
          </ButtonLink>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Your email is verified"
      description="Your Quantify Terminal account is ready to use."
    >
      <div className="auth-form">
        {handoffPath && (
          <Callout tone="neutral" role="status" compact>
            Quantify Terminal on your computer is waiting. Sign in and approve the request to
            connect it.
          </Callout>
        )}
        <ButtonLink href={signInHref} block>
          Sign in to the console
        </ButtonLink>
      </div>
    </AuthShell>
  );
}

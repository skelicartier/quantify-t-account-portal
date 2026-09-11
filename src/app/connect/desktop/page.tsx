import type { Metadata } from "next";

import { logout } from "@/app/account/actions";
import { connectDesktop } from "@/app/connect/desktop/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConnectDesktopForm } from "@/components/auth/connect-desktop-form";
import { ButtonLink } from "@/components/ui/button";
import { getDesktopConnectIdentity } from "@/lib/admin/access";
import { desktopConnectPath, parseDesktopConnectParams } from "@/lib/auth/desktop-connect";

export const metadata: Metadata = {
  title: "Connect the desktop app",
};

export const dynamic = "force-dynamic";

type ConnectDesktopPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toSearchParams(
  parameters: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(parameters)) {
    const entries = Array.isArray(value) ? value : value === undefined ? [] : [value];
    for (const entry of entries) query.append(name, entry);
  }
  return query;
}

/**
 * The desktop app's "Sign in with browser" lands here. Signed-out visitors go through
 * sign-in (or sign-up) and come back; signed-in visitors confirm the connection and are
 * sent to the app's loopback listener with a one-time code.
 */
export default async function ConnectDesktopPage({ searchParams }: ConnectDesktopPageProps) {
  const handoff = parseDesktopConnectParams(toSearchParams(await searchParams));

  if (!handoff) {
    return (
      <AuthShell
        themed
        title="This connection link is incomplete"
        description="Quantify Terminal opens this page itself when you choose Sign in with browser. Return to the app and try again."
      >
        <div className="auth-form">
          <ButtonLink href="/account" block>
            Go to your account
          </ButtonLink>
        </div>
      </AuthShell>
    );
  }

  const nextPath = desktopConnectPath(handoff);
  const { me } = await getDesktopConnectIdentity(nextPath);

  return (
    <AuthShell
      themed
      title="Connect Quantify Terminal on this computer"
      description="The desktop app is waiting to sign in with your account. Connect to send it a one-time code."
    >
      <ConnectDesktopForm action={connectDesktop} handoff={handoff} email={me.user.email} />

      <form className="auth__switch" action={logout}>
        <input type="hidden" name="next" value={nextPath} />
        Not you?{" "}
        <button type="submit" className="auth__switch-button">
          Sign out
        </button>
      </form>
    </AuthShell>
  );
}

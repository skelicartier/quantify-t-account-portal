import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { logout } from "@/app/account/actions";
import { cancelDesktopConnect, connectDesktop } from "@/app/connect/desktop/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConnectDesktopForm } from "@/components/auth/connect-desktop-form";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { getDesktopConnectIdentity } from "@/lib/admin/access";
import {
  AccountApiRequestError,
  fetchAccountApiHandoff,
  type AccountApiHandoff,
} from "@/lib/admin/account-api";
import {
  desktopConnectPath,
  loginPathForDesktopConnect,
  parseDesktopConnectParams,
} from "@/lib/auth/desktop-connect";
import { requestNow } from "@/lib/request-time";

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

function Notice({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <AuthShell themed title={title} description={description}>
      <div className="auth-form">
        {children}
        <ButtonLink href="/account" block>
          Go to your account
        </ButtonLink>
      </div>
    </AuthShell>
  );
}

/**
 * The desktop app's "Sign in with browser" lands here. Signed-out visitors go through
 * sign-in (or sign-up) and come back; signed-in visitors see the request the app made —
 * its code and device — and approve or cancel it. The app is polling the Account API and
 * signs itself in once the request is approved; nothing is ever sent to the visitor's
 * computer from here.
 */
export default async function ConnectDesktopPage({ searchParams }: ConnectDesktopPageProps) {
  const handoff = parseDesktopConnectParams(toSearchParams(await searchParams));

  if (!handoff) {
    return (
      <Notice
        title="This connection link is incomplete"
        description="Quantify Terminal opens this page itself when you choose Sign in with browser. Return to the app and try again."
      />
    );
  }

  const nextPath = desktopConnectPath(handoff);
  const { accessToken, me } = await getDesktopConnectIdentity(nextPath);

  let request: AccountApiHandoff | null = null;
  let unavailable = false;
  try {
    request = await fetchAccountApiHandoff(accessToken, handoff.handoff);
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.status === 401) {
      redirect(loginPathForDesktopConnect(nextPath));
    }
    if (!(error instanceof AccountApiRequestError && error.status === 404)) unavailable = true;
  }

  if (unavailable) {
    return (
      <Notice
        title="The connection service is unavailable"
        description="Quantify Terminal is still waiting. Reload this page in a moment to try again."
      />
    );
  }
  if (request === null || request.status === "expired") {
    return (
      <Notice
        title="This sign-in request has expired"
        description="Return to Quantify Terminal and choose Sign in with browser again. A request stays open for ten minutes."
      />
    );
  }
  if (request.status === "approved" || request.status === "redeemed") {
    return (
      <Notice
        title="Already connected"
        description="This request was approved. Quantify Terminal signs you in on its own; you can close this tab."
      />
    );
  }
  if (request.status === "denied") {
    return (
      <Notice
        title="This request was cancelled"
        description="Nothing was connected. To sign in, return to Quantify Terminal and choose Sign in with browser again."
      />
    );
  }

  return (
    <AuthShell
      themed
      title="Connect Quantify Terminal on this computer"
      description="The desktop app is waiting to sign in with your account."
    >
      {request.intent === "signup" && (
        <div className="auth-form">
          <Callout tone="neutral" role="status" compact>
            Your account is ready. Connect to sign the app in with it.
          </Callout>
        </div>
      )}
      <ConnectDesktopForm
        action={connectDesktop}
        cancelAction={cancelDesktopConnect}
        handoff={handoff}
        request={request}
        email={me.user.email}
        now={requestNow()}
      />

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

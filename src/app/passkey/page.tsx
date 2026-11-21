import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { logout } from "@/app/account/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasskeyConfirm } from "@/components/passkeys/passkey-confirm";
import { Button } from "@/components/ui/button";
import { sanitizeNextPath } from "@/lib/auth/login";
import { getCurrentAccount } from "@/lib/dal/account";
import { getCurrentAssurance } from "@/lib/dal/assurance-guard";

export const metadata: Metadata = { title: "Confirm it is you" };
export const dynamic = "force-dynamic";

type PasskeyPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

/**
 * The door for a session that owes its passkey: the password was right, and the account
 * has a passkey this session has not proved yet. Nothing else in the console renders for
 * it until it does. Signing out is offered because it is the only other honest way on.
 */
export default async function PasskeyPage({ searchParams }: PasskeyPageProps) {
  const [account, assurance, parameters] = await Promise.all([
    getCurrentAccount(),
    getCurrentAssurance(),
    searchParams,
  ]);
  if (account === null) redirect("/login");
  const requested = Array.isArray(parameters.next) ? parameters.next[0] : parameters.next;
  const candidate = sanitizeNextPath(requested);
  // Never back to this page, or the confirmation would land where it started.
  const nextPath = candidate.startsWith("/passkey") ? "/account" : candidate;
  if (!assurance.challengeRequired) redirect(nextPath);

  return (
    <AuthShell
      title="Confirm it is you"
      description={`Signed in as ${account.email}. This account is protected by a passkey: use your fingerprint, face or device PIN to open the console.`}
    >
      <div className="stack">
        <PasskeyConfirm label="Use passkey" href={nextPath} />
        <p className="auth__desc">
          Lost the device that holds it? Ask the workspace Owner to reset your passkeys. Nothing
          on this page can remove one.
        </p>
        <form action={logout}>
          <Button type="submit" variant="ghost">
            Sign out
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}

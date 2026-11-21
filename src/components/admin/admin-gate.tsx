import type { ReactNode } from "react";

import { PasskeyConfirm } from "@/components/passkeys/passkey-confirm";
import { ButtonLink } from "@/components/ui/button";
import { capabilityLabel } from "@/lib/admin/role-labels";
import type { AssuranceState } from "@/lib/auth/assurance";

type GateAccess = {
  status: "authorized" | "forbidden" | "mfa-required" | "capability-required" | "not-found";
  capability?: string;
  /** Present on `mfa-required`: what the service said this session still owes. */
  assurance?: AssuranceState;
};

type AdminGateProps = {
  access: GateAccess;
  /** Human name of the page, used in the "X is not available" heading. */
  section: string;
  children: ReactNode;
};

function GateCard({
  id,
  title,
  body,
  actions,
}: {
  id: string;
  title: string;
  body: string;
  actions: ReactNode;
}) {
  return (
    <section className="card page-state" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <p className="card__desc">{body}</p>
      <div className="page-state__actions">{actions}</div>
    </section>
  );
}

/**
 * Renders privileged content only when the loader authorized it; otherwise one calm,
 * product-facing explanation with the single most useful next step.
 */
export function AdminGate({ access, section, children }: AdminGateProps) {
  switch (access.status) {
    case "authorized":
      return <>{children}</>;
    case "forbidden":
      return (
        <GateCard
          id="admin-gate-forbidden"
          title="This account is not authorized for administration"
          body="Your account is active, but it doesn't include administration access. If you expected it, ask an owner to update your role."
          actions={<ButtonLink href="/account">Return to account</ButtonLink>}
        />
      );
    case "mfa-required": {
      const passkey = access.assurance?.passkey;
      if (passkey?.enrolled) {
        return (
          <GateCard
            id="admin-gate-mfa"
            title="Confirm it is you"
            body="Administration opens once this session is confirmed with your passkey: your fingerprint, face or device PIN. It asks again in every new session."
            actions={<PasskeyConfirm label="Use passkey" />}
          />
        );
      }
      if (passkey) {
        return (
          <GateCard
            id="admin-gate-mfa"
            title="Add a passkey to open Administration"
            body="Staff accounts here must hold a passkey. Add one under Security with your current password, then come back."
            actions={
              <ButtonLink href="/account/security#security-passkeys-heading" variant="primary">
                Open security settings
              </ButtonLink>
            }
          />
        );
      }
      return (
        <GateCard
          id="admin-gate-mfa"
          title="Sign-in security could not be checked"
          body="The account service did not say whether this session has confirmed its passkey, so Administration stays closed. Nothing is wrong with your account; try again in a moment."
          actions={
            <ButtonLink href="/admin" variant="primary">
              Try again
            </ButtonLink>
          }
        />
      );
    }
    case "capability-required":
      return (
        <GateCard
          id="admin-gate-capability"
          title={`${section} is not available`}
          body={`Your role doesn't include ${access.capability ? capabilityLabel(access.capability).toLowerCase() : "this permission"}. Ask an owner to grant it.`}
          actions={<ButtonLink href="/admin">Return to dashboard</ButtonLink>}
        />
      );
    case "not-found":
      return (
        <GateCard
          id="admin-gate-not-found"
          title="No account record was found"
          body="The account may have been removed, or the link may be out of date."
          actions={<ButtonLink href="/admin/users">Return to users</ButtonLink>}
        />
      );
    default:
      return null;
  }
}

import type { ReactNode } from "react";

import { ButtonLink } from "@/components/ui/button";
import { capabilityLabel } from "@/lib/admin/role-labels";

type GateAccess = {
  status: "authorized" | "forbidden" | "mfa-required" | "capability-required" | "not-found";
  capability?: string;
};

type AdminGateProps = {
  access: GateAccess;
  /** Human name of the page, used in the "X is not available" heading. */
  section: string;
  children: ReactNode;
};

function GateCard({
  id,
  eyebrow,
  title,
  body,
  actions,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  actions: ReactNode;
}) {
  return (
    <section className="card page-state" aria-labelledby={id}>
      <p className="eyebrow">{eyebrow}</p>
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
          eyebrow="Access"
          title="This account is not authorized for administration"
          body="Your account is active, but it doesn't include administration access. If you expected it, ask an owner to update your role."
          actions={<ButtonLink href="/account">Return to account</ButtonLink>}
        />
      );
    case "mfa-required":
      return (
        <GateCard
          id="admin-gate-mfa"
          eyebrow="Additional verification"
          title="A verified second factor is required"
          body="Owner, Admin and Support roles must confirm a second factor before privileged views open."
          actions={
            <ButtonLink href="/account/security" variant="primary">
              Open security settings
            </ButtonLink>
          }
        />
      );
    case "capability-required":
      return (
        <GateCard
          id="admin-gate-capability"
          eyebrow="Permissions"
          title={`${section} is not available`}
          body={`Your role doesn't include ${access.capability ? capabilityLabel(access.capability).toLowerCase() : "this permission"}. Ask an owner to grant it.`}
          actions={<ButtonLink href="/admin">Return to dashboard</ButtonLink>}
        />
      );
    case "not-found":
      return (
        <GateCard
          id="admin-gate-not-found"
          eyebrow="Not found"
          title="No account record was found"
          body="The account may have been removed, or the link may be out of date."
          actions={<ButtonLink href="/admin/users">Return to users</ButtonLink>}
        />
      );
    default:
      return null;
  }
}

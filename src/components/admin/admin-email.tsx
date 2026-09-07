import Link from "next/link";

import { enqueueAdminEmail } from "@/app/admin/email/actions";
import { AdminEmailManager } from "@/components/admin/admin-email-manager";
import { formatAdminLabel, formatAdminNumber } from "@/components/admin/admin-format";
import type { AdminEmailAccess } from "@/lib/admin/access";

type AdminEmailProps = {
  access: AdminEmailAccess;
};

export function AdminEmail({ access }: AdminEmailProps) {
  const { me } = access;

  return (
    <main className="account-main admin-main" id="main-content">
      <section className="account-hero admin-hero" aria-labelledby="admin-email-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 id="admin-email-heading">Email Queue</h1>
        </div>
        <div className={`admin-role-badge admin-role-badge--${me.role.effective}`}>
          {formatAdminLabel(me.role.effective)}
        </div>
      </section>

      {access.status === "forbidden" && (
        <section className="admin-state-panel" aria-labelledby="admin-email-forbidden-heading">
          <p className="account-card__label">Access denied</p>
          <h2 id="admin-email-forbidden-heading">
            This account is not authorized for administration
          </h2>
          <Link className="button" href="/account">
            Return to account
          </Link>
        </section>
      )}

      {access.status === "mfa-required" && (
        <section className="admin-state-panel" aria-labelledby="admin-email-mfa-heading">
          <p className="account-card__label">Additional verification</p>
          <h2 id="admin-email-mfa-heading">A verified second factor is required</h2>
          <Link className="button button--primary" href="/account/security">
            Open security settings
          </Link>
        </section>
      )}

      {access.status === "capability-required" && (
        <section className="admin-state-panel" aria-labelledby="admin-email-capability-heading">
          <p className="account-card__label">Capability required</p>
          <h2 id="admin-email-capability-heading">Email queueing is not granted</h2>
          <p>{access.capability}</p>
        </section>
      )}

      {access.status === "authorized" && (
        <>
          <dl className="notification-summary" aria-label="Email queue summary">
            <div>
              <dt>Queued</dt>
              <dd>{formatAdminNumber(access.queue.jobs.length)} jobs</dd>
            </div>
            <div>
              <dt>24h quota</dt>
              <dd>
                {formatAdminNumber(access.queue.quota.queued_24h)} /{" "}
                {formatAdminNumber(access.queue.quota.daily_limit)}
              </dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd className="account-id">{access.queue.revision || "None"}</dd>
            </div>
          </dl>

          <section className="admin-section" aria-labelledby="admin-email-table-heading">
            <div className="admin-section__heading">
              <div>
                <p className="account-card__label">Queued email</p>
                <h2 id="admin-email-table-heading">Admin email jobs</h2>
              </div>
            </div>
            <AdminEmailManager queue={access.queue} action={enqueueAdminEmail} />
          </section>
        </>
      )}
    </main>
  );
}

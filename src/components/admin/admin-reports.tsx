import Link from "next/link";

import { enqueueAdminReport } from "@/app/admin/reports/actions";
import { AdminReportManager } from "@/components/admin/admin-report-manager";
import { formatAdminLabel, formatAdminNumber } from "@/components/admin/admin-format";
import type { AdminReportsAccess } from "@/lib/admin/access";

type AdminReportsProps = {
  access: AdminReportsAccess;
};

export function AdminReports({ access }: AdminReportsProps) {
  const { me } = access;

  return (
    <main className="account-main admin-main" id="main-content">
      <section className="account-hero admin-hero" aria-labelledby="admin-reports-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 id="admin-reports-heading">Reports</h1>
        </div>
        <div className={`admin-role-badge admin-role-badge--${me.role.effective}`}>
          {formatAdminLabel(me.role.effective)}
        </div>
      </section>

      {access.status === "forbidden" && (
        <section className="admin-state-panel" aria-labelledby="admin-reports-forbidden-heading">
          <p className="account-card__label">Access denied</p>
          <h2 id="admin-reports-forbidden-heading">
            This account is not authorized for administration
          </h2>
          <Link className="button" href="/account">
            Return to account
          </Link>
        </section>
      )}

      {access.status === "mfa-required" && (
        <section className="admin-state-panel" aria-labelledby="admin-reports-mfa-heading">
          <p className="account-card__label">Additional verification</p>
          <h2 id="admin-reports-mfa-heading">A verified second factor is required</h2>
          <Link className="button button--primary" href="/account/security">
            Open security settings
          </Link>
        </section>
      )}

      {access.status === "capability-required" && (
        <section className="admin-state-panel" aria-labelledby="admin-reports-capability-heading">
          <p className="account-card__label">Capability required</p>
          <h2 id="admin-reports-capability-heading">Report access is not granted</h2>
          <p>{access.capability}</p>
        </section>
      )}

      {access.status === "authorized" && (
        <>
          <dl className="notification-summary" aria-label="Report queue summary">
            <div>
              <dt>Reports</dt>
              <dd>{formatAdminNumber(access.reports.jobs.length)} jobs</dd>
            </div>
            <div>
              <dt>Queue limit</dt>
              <dd>{formatAdminNumber(access.reports.queue.job_limit)}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd className="account-id">{access.reports.revision || "None"}</dd>
            </div>
          </dl>

          <section className="admin-section" aria-labelledby="admin-reports-table-heading">
            <div className="admin-section__heading">
              <div>
                <p className="account-card__label">Audit CSV</p>
                <h2 id="admin-reports-table-heading">Private report jobs</h2>
              </div>
            </div>
            <AdminReportManager reports={access.reports} action={enqueueAdminReport} />
          </section>
        </>
      )}
    </main>
  );
}

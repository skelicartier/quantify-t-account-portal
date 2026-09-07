"use client";

import { useActionState } from "react";
import { FileText } from "lucide-react";

import { formatAdminLabel, formatAdminNumber } from "@/components/admin/admin-format";
import type { AccountApiAdminReports } from "@/lib/admin/account-api";

type AdminReportActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

type Props = {
  reports: AccountApiAdminReports;
  action: (state: AdminReportActionState, data: FormData) => Promise<AdminReportActionState>;
};

const INITIAL_ADMIN_REPORT_STATE: AdminReportActionState = {
  status: "idle",
  message: "",
};

const FILTER_FIELDS = [
  { name: "event_type", label: "Event" },
  { name: "outcome", label: "Outcome" },
  { name: "source", label: "Source" },
  { name: "subject_user_id", label: "Subject" },
  { name: "actor_user_id", label: "Actor" },
  { name: "session_id", label: "Session" },
  { name: "request_id", label: "Request" },
] as const;

function filterSummary(job: AccountApiAdminReports["jobs"][number]): string {
  const count = Object.values(job.filters).filter(Boolean).length;
  return count === 0 ? "All permitted events" : `${formatAdminNumber(count)} filters`;
}

function downloadStatus(job: AccountApiAdminReports["jobs"][number]): string {
  if (job.status === "expired") return "Expired";
  if (job.download.available) return "Ready";
  if (job.status === "failed") return job.last_error || "Failed";
  return job.next_attempt_at || "Queued";
}

export function AdminReportManager({ reports, action }: Props) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ADMIN_REPORT_STATE);
  const queueFull = reports.jobs.length >= reports.queue.job_limit;

  return (
    <>
      <form action={formAction} className="admin-filter-form">
        <input type="hidden" name="revision" value={reports.revision} />
        <fieldset disabled={pending || queueFull}>
          {FILTER_FIELDS.map((field) => (
            <label key={field.name}>
              <span>{field.label}</span>
              <input name={field.name} autoComplete="off" />
            </label>
          ))}
          <button className="button button--primary" type="submit">
            <FileText size={16} aria-hidden="true" />
            {pending ? "Queueing" : "Queue CSV"}
          </button>
        </fieldset>
        {queueFull && <p role="status">Report queue limit reached.</p>}
        {state.message && (
          <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
        )}
      </form>

      {reports.jobs.length === 0 ? (
        <p className="admin-empty-state">No reports queued.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Status</th>
                <th>Filters</th>
                <th>Rows</th>
                <th>Expires</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {reports.jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <span className="admin-row-title">
                      {formatAdminLabel(job.report_type)} {job.format.toUpperCase()}
                    </span>
                    <span className="account-id">{job.id}</span>
                  </td>
                  <td>{formatAdminLabel(job.status)}</td>
                  <td>{filterSummary(job)}</td>
                  <td>{formatAdminNumber(job.row_count)}</td>
                  <td>{job.download.expires_at || job.expires_at || "Pending"}</td>
                  <td>{downloadStatus(job)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

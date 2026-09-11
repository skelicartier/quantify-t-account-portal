import { AdminGate } from "@/components/admin/admin-gate";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card, Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill, YesNoPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type {
  AdminConfigurationAccess,
  AdminCredentialStatusAccess,
  AdminReleaseStatusAccess,
} from "@/lib/admin/access";
import { formatBytes, formatDurationSeconds, formatLabel, formatNumber } from "@/lib/format";

type StatusProps<T> = { access: T; now?: number | undefined };

function FeatureRow({
  label,
  enabled,
  description,
}: {
  label: string;
  enabled: boolean;
  description?: string;
}) {
  return (
    <li className="list-row">
      <span className="list-row__main">
        <span className="list-row__title">{label}</span>
        {description && <span className="list-row__desc">{description}</span>}
      </span>
      <StatusPill value={enabled ? "enabled" : "disabled"} />
    </li>
  );
}

export function AdminConfiguration({ access, now }: StatusProps<AdminConfigurationAccess>) {
  const configuration = access.status === "authorized" ? access.configuration : null;
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Configuration"
        titleId="admin-platform-heading"
        description="How the account service is set up. Everything here is read-only."
        meta={
          configuration ? (
            <Timestamp value={configuration.generated_at} now={now} prefix="Updated" />
          ) : undefined
        }
      />
      <div className="page-content">
        <AdminGate access={access} section="Configuration">
          {configuration && (
            <div className="board">
              <StatGrid columns={4} label="Environment">
                <Stat label="Environment" value={formatLabel(configuration.environment)} text />
                <Stat
                  label="Allowed origins"
                  value={formatNumber(configuration.cors.allowed_origin_count)}
                />
                <Stat
                  label="Wildcard origins"
                  value={
                    <YesNoPill
                      value={configuration.cors.wildcard_allowed}
                      yes="Allowed"
                      no="Blocked"
                    />
                  }
                  text
                />
                <Stat
                  label="Configured owners"
                  value={formatNumber(configuration.features.break_glass_owner_count)}
                  hint="Set by deployment configuration"
                />
              </StatGrid>

              <div className="card-grid card-grid--2">
                <Card
                  eyebrow="Background workers"
                  title="Scheduled jobs"
                  titleId="admin-workers-heading"
                >
                  <ul className="list-rows">
                    <FeatureRow
                      label="Email worker"
                      enabled={configuration.features.email_worker_enabled}
                      description="Delivers queued account emails."
                    />
                    <FeatureRow
                      label="Export worker"
                      enabled={configuration.features.artifact_worker_enabled}
                      description="Builds encrypted account exports and audit CSVs."
                    />
                    <FeatureRow
                      label="Deletion worker"
                      enabled={configuration.features.deletion_worker_enabled}
                      description="Completes cooled-off account deletions."
                    />
                    <FeatureRow
                      label="Signed downloads"
                      enabled={configuration.features.signed_downloads_enabled}
                      description="Short-lived private download links."
                    />
                  </ul>
                </Card>
                <Card
                  eyebrow="Storage and encryption"
                  title="Data protection"
                  titleId="admin-storage-heading"
                >
                  <ul className="list-rows">
                    <FeatureRow
                      label="Export encryption"
                      enabled={configuration.features.account_export_encryption_configured}
                    />
                    <FeatureRow
                      label="Private file storage"
                      enabled={configuration.features.private_artifact_storage_configured}
                    />
                    <FeatureRow
                      label="Legacy role registry"
                      enabled={configuration.features.legacy_role_source_configured}
                    />
                    <li className="list-row">
                      <span className="list-row__main">
                        <span className="list-row__title">Bootstrap admins</span>
                        <span className="list-row__desc">
                          Administrators seeded from configuration.
                        </span>
                      </span>
                      <span className="num">
                        {formatNumber(configuration.features.legacy_bootstrap_admin_count)}
                      </span>
                    </li>
                  </ul>
                </Card>
              </div>

              <Section id="admin-limits" title="Limits" eyebrow="Runtime">
                <KeyValue columns={2}>
                  <KeyValueRow label="Request size">
                    {formatBytes(configuration.limits.max_body_bytes)}
                  </KeyValueRow>
                  <KeyValueRow label="Upstream timeout">
                    {formatDurationSeconds(configuration.limits.upstream_timeout_seconds)}
                  </KeyValueRow>
                  <KeyValueRow label="Idempotency window">
                    {formatDurationSeconds(configuration.limits.idempotency_ttl_seconds)}
                  </KeyValueRow>
                  <KeyValueRow label="Reservation lease">
                    {formatDurationSeconds(configuration.limits.reservation_lease_seconds)}
                  </KeyValueRow>
                  <KeyValueRow label="Email batch">
                    {formatNumber(configuration.limits.email_worker_batch_limit)}
                  </KeyValueRow>
                  <KeyValueRow label="Export batch">
                    {formatNumber(configuration.limits.artifact_worker_batch_limit)}
                  </KeyValueRow>
                  <KeyValueRow label="Deletion batch">
                    {formatNumber(configuration.limits.deletion_worker_batch_limit)}
                  </KeyValueRow>
                  <KeyValueRow label="Download link lifetime">
                    {formatDurationSeconds(configuration.limits.signed_download_ttl_seconds)}
                  </KeyValueRow>
                </KeyValue>
              </Section>
            </div>
          )}
        </AdminGate>
      </div>
    </>
  );
}

const CREDENTIAL_COLUMNS = [
  { key: "name", label: "Credential" },
  { key: "configured", label: "Configured" },
  { key: "type", label: "Type" },
  { key: "rotation", label: "Rotation" },
] as const;

export function AdminCredentials({ access, now }: StatusProps<AdminCredentialStatusAccess>) {
  const status = access.status === "authorized" ? access.credentialStatus : null;
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Credentials"
        titleId="admin-platform-heading"
        description="Whether each integration credential is present. Values are never shown here."
        meta={
          status ? <Timestamp value={status.generated_at} now={now} prefix="Updated" /> : undefined
        }
      />
      <div className="page-content">
        <AdminGate access={access} section="Credentials">
          {status && (
            <>
              <Callout title="Status only">
                Secret values never leave the service. Rotation happens at the deployment source,
                not from this console.
              </Callout>
              <DataTable columns={CREDENTIAL_COLUMNS} caption="Credential status" minWidth={560}>
                {status.credentials.map((credential) => (
                  <tr key={credential.name}>
                    <td>
                      <span className="data-table__primary">{formatLabel(credential.name)}</span>
                    </td>
                    <td>
                      <YesNoPill value={credential.configured} yes="Configured" no="Missing" />
                    </td>
                    <td>{credential.secret ? "Secret" : "Setting"}</td>
                    <td>Rotated at source</td>
                  </tr>
                ))}
              </DataTable>
            </>
          )}
        </AdminGate>
      </div>
    </>
  );
}

function RequirementRow({ label, required }: { label: string; required: boolean }) {
  return (
    <li className="list-row">
      <span className="list-row__title">{label}</span>
      <StatusPill value={required ? "yes" : "no"} label={required ? "Required" : "Not required"} />
    </li>
  );
}

export function AdminReleases({ access, now }: StatusProps<AdminReleaseStatusAccess>) {
  const status = access.status === "authorized" ? access.releaseStatus : null;
  const release = status?.release_management ?? null;
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Releases"
        titleId="admin-platform-heading"
        description="Desktop release publishing status. Publishing itself happens at the deployment source."
        meta={
          status ? <Timestamp value={status.generated_at} now={now} prefix="Updated" /> : undefined
        }
      />
      <div className="page-content">
        <AdminGate access={access} section="Releases">
          {release && (
            <div className="card-grid card-grid--2">
              <Card
                eyebrow="Release management"
                title="Controls"
                titleId="admin-release-controls-heading"
              >
                <KeyValue>
                  <KeyValueRow label="Status">
                    <StatusPill value={release.status} />
                  </KeyValueRow>
                  <KeyValueRow label="Configured">
                    <YesNoPill value={release.configured} yes="Configured" no="Not configured" />
                  </KeyValueRow>
                  <KeyValueRow label="Publishing">
                    <YesNoPill value={release.publish_enabled} yes="Enabled" no="Disabled" />
                  </KeyValueRow>
                  <KeyValueRow label="Rollback">
                    <YesNoPill value={release.rollback_enabled} yes="Enabled" no="Disabled" />
                  </KeyValueRow>
                </KeyValue>
              </Card>
              <Card
                eyebrow="Requirements"
                title="Every release must have"
                titleId="admin-release-requirements-heading"
              >
                <ul className="list-rows">
                  <RequirementRow
                    label="HTTPS download URLs"
                    required={release.requires_https_url}
                  />
                  <RequirementRow label="Checksums" required={release.requires_checksum} />
                  <RequirementRow
                    label="Server signatures"
                    required={release.requires_server_signature}
                  />
                </ul>
              </Card>
            </div>
          )}
        </AdminGate>
      </div>
    </>
  );
}

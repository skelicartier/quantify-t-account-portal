import Link from "next/link";

import { formatAdminLabel, formatAdminNumber } from "@/components/admin/admin-format";
import type {
  AdminConfigurationAccess,
  AdminCredentialStatusAccess,
  AdminReleaseStatusAccess,
} from "@/lib/admin/access";

type PlatformAccess =
  AdminConfigurationAccess | AdminCredentialStatusAccess | AdminReleaseStatusAccess;

function GatePanels({
  access,
  capabilityHeading,
}: {
  access: PlatformAccess;
  capabilityHeading: string;
}) {
  if (access.status === "forbidden") {
    return (
      <section className="admin-state-panel" aria-labelledby="admin-platform-forbidden-heading">
        <p className="account-card__label">Access denied</p>
        <h2 id="admin-platform-forbidden-heading">
          This account is not authorized for administration
        </h2>
        <Link className="button" href="/account">
          Return to account
        </Link>
      </section>
    );
  }

  if (access.status === "mfa-required") {
    return (
      <section className="admin-state-panel" aria-labelledby="admin-platform-mfa-heading">
        <p className="account-card__label">Additional verification</p>
        <h2 id="admin-platform-mfa-heading">A verified second factor is required</h2>
        <Link className="button button--primary" href="/account/security">
          Open security settings
        </Link>
      </section>
    );
  }

  if (access.status === "capability-required") {
    return (
      <section className="admin-state-panel" aria-labelledby="admin-platform-capability-heading">
        <p className="account-card__label">Capability required</p>
        <h2 id="admin-platform-capability-heading">{capabilityHeading}</h2>
        <p>{access.capability}</p>
      </section>
    );
  }

  return null;
}

function Hero({ title, access }: { title: string; access: PlatformAccess }) {
  return (
    <section className="account-hero admin-hero" aria-labelledby="admin-platform-heading">
      <div>
        <p className="eyebrow">Administration</p>
        <h1 id="admin-platform-heading">{title}</h1>
      </div>
      <div className={`admin-role-badge admin-role-badge--${access.me.role.effective}`}>
        {formatAdminLabel(access.me.role.effective)}
      </div>
    </section>
  );
}

function YesNo({ value }: { value: boolean }) {
  return <>{value ? "Yes" : "No"}</>;
}

export function AdminConfiguration({ access }: { access: AdminConfigurationAccess }) {
  return (
    <main className="account-main admin-main" id="main-content">
      <Hero title="Configuration" access={access} />
      <GatePanels access={access} capabilityHeading="Configuration status is not granted" />

      {access.status === "authorized" && (
        <>
          <dl className="notification-summary" aria-label="Configuration summary">
            <div>
              <dt>Environment</dt>
              <dd>{formatAdminLabel(access.configuration.environment)}</dd>
            </div>
            <div>
              <dt>Allowed origins</dt>
              <dd>{formatAdminNumber(access.configuration.cors.allowed_origin_count)}</dd>
            </div>
            <div>
              <dt>Email worker</dt>
              <dd>
                <YesNo value={access.configuration.features.email_worker_enabled} />
              </dd>
            </div>
            <div>
              <dt>Artifact worker</dt>
              <dd>
                <YesNo value={access.configuration.features.artifact_worker_enabled} />
              </dd>
            </div>
            <div>
              <dt>Deletion worker</dt>
              <dd>
                <YesNo value={access.configuration.features.deletion_worker_enabled} />
              </dd>
            </div>
            <div>
              <dt>Signed downloads</dt>
              <dd>
                <YesNo value={access.configuration.features.signed_downloads_enabled} />
              </dd>
            </div>
            <div>
              <dt>Export encryption</dt>
              <dd>
                <YesNo value={access.configuration.features.account_export_encryption_configured} />
              </dd>
            </div>
          </dl>

          <section className="admin-section" aria-labelledby="admin-configuration-heading">
            <div className="admin-section__heading">
              <div>
                <p className="account-card__label">Runtime limits</p>
                <h2 id="admin-configuration-heading">Account API configuration</h2>
              </div>
              <time dateTime={access.configuration.generated_at}>
                {access.configuration.generated_at}
              </time>
            </div>
            <dl className="account-details">
              <div>
                <dt>Max body bytes</dt>
                <dd>{formatAdminNumber(access.configuration.limits.max_body_bytes)}</dd>
              </div>
              <div>
                <dt>Upstream timeout</dt>
                <dd>{access.configuration.limits.upstream_timeout_seconds}s</dd>
              </div>
              <div>
                <dt>Idempotency TTL</dt>
                <dd>{formatAdminNumber(access.configuration.limits.idempotency_ttl_seconds)}s</dd>
              </div>
              <div>
                <dt>Reservation lease</dt>
                <dd>{formatAdminNumber(access.configuration.limits.reservation_lease_seconds)}s</dd>
              </div>
              <div>
                <dt>Email batch limit</dt>
                <dd>{formatAdminNumber(access.configuration.limits.email_worker_batch_limit)}</dd>
              </div>
              <div>
                <dt>Artifact batch limit</dt>
                <dd>
                  {formatAdminNumber(access.configuration.limits.artifact_worker_batch_limit)}
                </dd>
              </div>
              <div>
                <dt>Deletion batch limit</dt>
                <dd>
                  {formatAdminNumber(access.configuration.limits.deletion_worker_batch_limit)}
                </dd>
              </div>
              <div>
                <dt>Download TTL</dt>
                <dd>
                  {formatAdminNumber(access.configuration.limits.signed_download_ttl_seconds)}s
                </dd>
              </div>
              <div>
                <dt>Wildcard CORS</dt>
                <dd>
                  <YesNo value={access.configuration.cors.wildcard_allowed} />
                </dd>
              </div>
              <div>
                <dt>Artifact storage</dt>
                <dd>
                  <YesNo
                    value={access.configuration.features.private_artifact_storage_configured}
                  />
                </dd>
              </div>
              <div>
                <dt>Legacy role source</dt>
                <dd>
                  <YesNo value={access.configuration.features.legacy_role_source_configured} />
                </dd>
              </div>
              <div>
                <dt>Break-glass Owners</dt>
                <dd>{formatAdminNumber(access.configuration.features.break_glass_owner_count)}</dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </main>
  );
}

export function AdminCredentials({ access }: { access: AdminCredentialStatusAccess }) {
  return (
    <main className="account-main admin-main" id="main-content">
      <Hero title="Credentials" access={access} />
      <GatePanels access={access} capabilityHeading="Credential status is not granted" />

      {access.status === "authorized" && (
        <section className="admin-section" aria-labelledby="admin-credentials-heading">
          <div className="admin-section__heading">
            <div>
              <p className="account-card__label">Status only</p>
              <h2 id="admin-credentials-heading">Credential surfaces</h2>
            </div>
            <time dateTime={access.credentialStatus.generated_at}>
              {access.credentialStatus.generated_at}
            </time>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Credential</th>
                  <th scope="col">Configured</th>
                  <th scope="col">Secret</th>
                  <th scope="col">Rotation</th>
                </tr>
              </thead>
              <tbody>
                {access.credentialStatus.credentials.map((credential) => (
                  <tr key={credential.name}>
                    <td>{formatAdminLabel(credential.name)}</td>
                    <td>
                      <YesNo value={credential.configured} />
                    </td>
                    <td>
                      <YesNo value={credential.secret} />
                    </td>
                    <td>{formatAdminLabel(credential.rotation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

export function AdminReleases({ access }: { access: AdminReleaseStatusAccess }) {
  return (
    <main className="account-main admin-main" id="main-content">
      <Hero title="Releases" access={access} />
      <GatePanels access={access} capabilityHeading="Release status is not granted" />

      {access.status === "authorized" && (
        <section className="admin-section" aria-labelledby="admin-releases-heading">
          <div className="admin-section__heading">
            <div>
              <p className="account-card__label">Source lock</p>
              <h2 id="admin-releases-heading">Release controls</h2>
            </div>
            <time dateTime={access.releaseStatus.generated_at}>
              {access.releaseStatus.generated_at}
            </time>
          </div>
          <dl className="account-details">
            <div>
              <dt>Status</dt>
              <dd>{formatAdminLabel(access.releaseStatus.release_management.status)}</dd>
            </div>
            <div>
              <dt>Configured</dt>
              <dd>
                <YesNo value={access.releaseStatus.release_management.configured} />
              </dd>
            </div>
            <div>
              <dt>Publishing</dt>
              <dd>
                <YesNo value={access.releaseStatus.release_management.publish_enabled} />
              </dd>
            </div>
            <div>
              <dt>Rollback</dt>
              <dd>
                <YesNo value={access.releaseStatus.release_management.rollback_enabled} />
              </dd>
            </div>
            <div>
              <dt>HTTPS URLs</dt>
              <dd>
                <YesNo value={access.releaseStatus.release_management.requires_https_url} />
              </dd>
            </div>
            <div>
              <dt>Checksums</dt>
              <dd>
                <YesNo value={access.releaseStatus.release_management.requires_checksum} />
              </dd>
            </div>
            <div>
              <dt>Server signatures</dt>
              <dd>
                <YesNo value={access.releaseStatus.release_management.requires_server_signature} />
              </dd>
            </div>
          </dl>
        </section>
      )}
    </main>
  );
}

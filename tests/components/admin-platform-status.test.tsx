import { render, screen } from "@testing-library/react";

import {
  AdminConfiguration,
  AdminCredentials,
  AdminReleases,
} from "@/components/admin/admin-platform-status";
import type {
  AccountApiAdminConfiguration,
  AccountApiAdminCredentialStatus,
  AccountApiAdminReleaseStatus,
  AccountApiMe,
} from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";

const me: AccountApiMe = {
  ok: true,
  correlation_id: "qt-correlation",
  user: {
    user_id: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
    email: "owner@example.test",
    is_active: true,
  },
  role: {
    effective: "owner",
    database: "owner",
    legacy: "admin",
    mismatch: "expected-owner-projection",
    break_glass: false,
  },
  capabilities: ["account:read-any", "configuration:read"],
  environment: "staging",
};

const assurance: AssuranceState = {
  verifiedTotpFactors: [],
  unverifiedTotpFactorIds: [],
  currentLevel: "aal2",
  requiredLevel: "aal2",
  mfaEnrolled: true,
  challengeRequired: false,
  levelReadable: true,
  factorsReadable: true,
};

const configuration: AccountApiAdminConfiguration = {
  ok: true,
  correlation_id: "qt-configuration",
  generated_at: "2026-09-06T01:00:00Z",
  environment: "staging",
  cors: { allowed_origin_count: 2, wildcard_allowed: false },
  limits: {
    max_body_bytes: 16384,
    upstream_timeout_seconds: 8,
    idempotency_ttl_seconds: 86400,
    reservation_lease_seconds: 180,
    email_worker_batch_limit: 5,
    artifact_worker_batch_limit: 2,
    deletion_worker_batch_limit: 1,
    signed_download_ttl_seconds: 900,
  },
  features: {
    email_worker_enabled: false,
    artifact_worker_enabled: false,
    deletion_worker_enabled: false,
    signed_downloads_enabled: false,
    account_export_encryption_configured: false,
    private_artifact_storage_configured: true,
    legacy_role_source_configured: true,
    break_glass_owner_count: 1,
    legacy_bootstrap_admin_count: 1,
  },
};

const credentialStatus: AccountApiAdminCredentialStatus = {
  ok: true,
  correlation_id: "qt-credentials",
  generated_at: "2026-09-06T01:00:00Z",
  credentials: [
    { name: "supabase_service_role", configured: true, secret: true, rotation: "source-locked" },
    { name: "brevo_sender_email", configured: true, secret: false, rotation: "source-locked" },
  ],
};

const releaseStatus: AccountApiAdminReleaseStatus = {
  ok: true,
  correlation_id: "qt-releases",
  generated_at: "2026-09-06T01:00:00Z",
  release_management: {
    configured: false,
    publish_enabled: false,
    rollback_enabled: false,
    requires_https_url: true,
    requires_checksum: true,
    requires_server_signature: true,
    status: "source-locked",
  },
};

describe("admin platform status", () => {
  it("renders configuration status without configured values", () => {
    render(<AdminConfiguration access={{ status: "authorized", me, assurance, configuration }} />);

    expect(screen.getByRole("heading", { name: "Configuration" })).toBeVisible();
    expect(screen.getByText("16,384")).toBeVisible();
    expect(screen.getByText("86,400s")).toBeVisible();
    expect(screen.getAllByText("2")[0]).toBeVisible();
    expect(screen.queryByText("owner@example.test")).not.toBeInTheDocument();
  });

  it("renders credential and release status as locked status-only tables", () => {
    render(
      <>
        <AdminCredentials access={{ status: "authorized", me, assurance, credentialStatus }} />
        <AdminReleases access={{ status: "authorized", me, assurance, releaseStatus }} />
      </>,
    );

    expect(screen.getByRole("heading", { name: "Credentials" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "Supabase Service Role" })).toBeVisible();
    expect(screen.getAllByText("Source Locked").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("heading", { name: "Releases" })).toBeVisible();
    expect(screen.getByText("Server signatures")).toBeVisible();
    expect(screen.queryByText(/xkeysib|service-role|sender@example/iu)).not.toBeInTheDocument();
  });
});

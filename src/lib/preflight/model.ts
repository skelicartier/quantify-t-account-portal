export type MigrationArtifact = {
  filename: string;
  sha256: string;
};

/**
 * Exact reviewed SHA-256 digests of the raw desktop migration bytes, in applied
 * order. These are the authoritative source-integrity evidence: any byte
 * difference, including whitespace, comments, dynamic SQL, or an inert addition,
 * changes a digest and blocks the source gate until a human reviews the
 * migration change and repins the value.
 *
 * Task 6 stores no user images, so there is no Storage migration in this ledger.
 */
export const DESKTOP_SUPABASE_MIGRATION_ARTIFACTS: readonly MigrationArtifact[] = [
  {
    filename: "20260902000000_local_baseline.sql",
    sha256: "96354d954fa23fce2807ae5602395d4688939d7da66ea2b22f94a290fc5cdfdb",
  },
  {
    filename: "20260902000050_adoption_preflight.sql",
    sha256: "2f2d0f42f4e8f39b59f096aefc1a109523ae6410dbdf9875d2049d5ce71db7ea",
  },
  {
    filename: "20260902000100_immutable_identity.sql",
    sha256: "77d76b4a3bd8f9e71e2f22a2fcb65c91f966d334e48107938e40a20a1a6a8e94",
  },
  {
    filename: "20260902000200_canonical_rbac_provisioning.sql",
    sha256: "9d085a20614a18ea2bf239ef67b9d06ea57f5f72c7cdfa31fa2bff8d0230098e",
  },
  {
    filename: "20260902000300_account_sessions.sql",
    sha256: "170b7cc6c250ffba129f34cc73c62f5e14c5848823e9ef2c061c5f6ada5d46d9",
  },
  {
    filename: "20260902000400_auth_events.sql",
    sha256: "63ebb84627e168f8b0daf1b57766c83a214c4c38e15402ad75c75332865a1b8a",
  },
  {
    filename: "20260902000500_rls_grants_hardening.sql",
    sha256: "b8a80b531910e966e251860a30d97936eda8f306db6d7c2aa7430d317a9aa906",
  },
  {
    filename: "20260902000600_contract_validation.sql",
    sha256: "e3be65feeea020ed44ce809bf577bb931ac2c4b1651e4a53b67184550c34b9cb",
  },
  {
    filename: "20260902000700_profile_contract_preflight.sql",
    sha256: "88f751c1856e55faab43513c7f8e03408c10f9ea9779684de8b5814207e091dd",
  },
  {
    filename: "20260902000900_versioned_profile_rpc.sql",
    sha256: "8afd7fd29aaa3d4a55e77116d9d705be6f836899122a8dd7f2cbde86533997bc",
  },
  {
    filename: "20260902001000_profile_contract_validation.sql",
    sha256: "2a6d2730e6cec843361ade134967d39be626c9fdc34e4a5f9bbe2d1065a52ad7",
  },
] as const;

export const DESKTOP_SUPABASE_MIGRATION_FILENAMES = DESKTOP_SUPABASE_MIGRATION_ARTIFACTS.map(
  (artifact) => artifact.filename,
);

export type PreflightStatus = "pass" | "warning" | "blocked";

export type PreflightCategory =
  "portal" | "desktop" | "supabase" | "azure" | "marketing" | "environment" | "network";

export type PreflightCheck = {
  id: string;
  category: PreflightCategory;
  status: PreflightStatus;
  summary: string;
  evidence: string[];
};

export type PortalAuthLifecycleEvidence = {
  callbackUsesTrustedRedirectType: boolean;
  callbackIssuesRecoveryAuthorization: boolean;
  callbackClearsRejectedExchange: boolean;
  resetRequiresVerifiedSession: boolean;
  resetConsumesAuthorizationBeforeUpdate: boolean;
  turnstileResetsAfterSubmission: boolean;
  securityReauthenticatesBeforeMutation: boolean;
  loginRequiresSatisfiedAssurance: boolean;
  accountGuardEnforcesAssurance: boolean;
  /**
   * Every security action consults the assurance gate before it verifies a password
   * or touches the account. Route guards cannot cover this: a Server Action is an
   * endpoint of its own, so an action without this call is reachable at AAL1 no matter
   * how well the page that hosts it is guarded.
   */
  securityActionsRequireAssurance: boolean;
  /** The same requirement on the profile and preferences mutations. */
  accountActionsRequireAssurance: boolean;
  /** Enrollment confirmation challenges only a provider-reported pending factor. */
  enrollmentBindsProviderIssuedFactor: boolean;
};

export type PortalSecurityEvidence = {
  enforcedChallengeCompatibleCsp: boolean;
  exactNoStoreRoutes: boolean;
  noStoreRoutes: string[];
};

export type RepositorySnapshot = {
  portalPackageJson: string | null;
  portalEnvironmentExample: string | null;
  portalAuthLifecycleEvidence: PortalAuthLifecycleEvidence | null;
  portalSecurityEvidence: PortalSecurityEvidence | null;
  desktopEnvironmentExample: string | null;
  desktopSupabaseSchema: string | null;
  /**
   * Ordered observed digests of the raw desktop migration bytes, or null when the
   * evidence could not be collected completely. Partial evidence is never allowed.
   */
  desktopSupabaseMigrations: readonly MigrationArtifact[] | null;
  desktopAuthService: string | null;
  desktopAzureFunction: string | null;
  desktopAzureDocumentation: string | null;
  desktopAzureRequirements: string | null;
  marketingVercelConfig: string | null;
  marketingStylesheet: string | null;
  accountInfrastructureDefinition: string | null;
};

export type EnvironmentPresence = {
  name: string;
  configured: boolean;
  placeholder: boolean;
  forbidden: boolean;
};

export type NetworkProbe = {
  name: string;
  status: PreflightStatus;
  summary: string;
};

export type PreflightReport = {
  generatedAt: string;
  mode: "offline" | "network";
  checks: PreflightCheck[];
  environment: EnvironmentPresence[];
  network: NetworkProbe[];
  counts: Record<PreflightStatus, number>;
  sourceReady: boolean;
  stagingReady: boolean;
  productionReady: boolean;
};

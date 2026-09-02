export const DESKTOP_SUPABASE_MIGRATION_FILENAMES = [
  "20260902000000_local_baseline.sql",
  "20260902000050_adoption_preflight.sql",
  "20260902000100_immutable_identity.sql",
  "20260902000200_canonical_rbac_provisioning.sql",
  "20260902000300_account_sessions.sql",
  "20260902000400_auth_events.sql",
  "20260902000500_rls_grants_hardening.sql",
  "20260902000600_contract_validation.sql",
] as const;

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

export type RepositorySnapshot = {
  portalPackageJson: string | null;
  portalEnvironmentExample: string | null;
  desktopEnvironmentExample: string | null;
  desktopSupabaseSchema: string | null;
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

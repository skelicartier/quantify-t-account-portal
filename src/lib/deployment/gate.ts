export type DeploymentEnvironment = Record<string, string | undefined>;

export function assertDeploymentAllowed(environment: DeploymentEnvironment): void {
  if (environment.VERCEL_ENV === "production") {
    throw new Error(
      "Production deployment is locked until the integrated staging evidence and explicit go/no-go task are complete.",
    );
  }
}

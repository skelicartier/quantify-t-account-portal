export type DeploymentEnvironment = Record<string, string | undefined>;

const PRODUCTION_GO_NO_GO_VALUE = "approved";

export function assertDeploymentAllowed(environment: DeploymentEnvironment): void {
  if (
    environment.VERCEL_ENV === "production" &&
    environment.QT_PRODUCTION_GO_NO_GO !== PRODUCTION_GO_NO_GO_VALUE
  ) {
    throw new Error(
      "Production deployment is locked until the integrated staging evidence and explicit go/no-go task are complete.",
    );
  }
}

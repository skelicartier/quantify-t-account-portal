import { assertDeploymentAllowed } from "@/lib/deployment/gate";

describe("deployment gate", () => {
  it("allows local, CI, and protected preview builds", () => {
    expect(() => assertDeploymentAllowed({})).not.toThrow();
    expect(() => assertDeploymentAllowed({ VERCEL_ENV: "preview" })).not.toThrow();
    expect(() => assertDeploymentAllowed({ VERCEL_ENV: "development" })).not.toThrow();
  });

  it("blocks every Vercel production build until the release task removes the lock", () => {
    expect(() => assertDeploymentAllowed({ VERCEL_ENV: "production" })).toThrow(
      "Production deployment is locked",
    );
    expect(() =>
      assertDeploymentAllowed({
        VERCEL_ENV: "production",
        QT_PRODUCTION_GO_NO_GO: "true",
      }),
    ).toThrow("Production deployment is locked");
  });

  it("allows production only with the exact explicit go/no-go value", () => {
    expect(() =>
      assertDeploymentAllowed({
        VERCEL_ENV: "production",
        QT_PRODUCTION_GO_NO_GO: "approved",
      }),
    ).not.toThrow();
  });
});

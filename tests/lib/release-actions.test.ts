/**
 * The three release writes, which are the widest-reaching in the product.
 *
 * Publishing decides what executable every installed desktop downloads and whether it
 * installs without asking, so the tests worth having here are not "does the happy path
 * work" but the refusals: who is allowed, what the console will not forward, and what a
 * rollback is permitted to re-publish.
 */

import type { AccountApiMe } from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";
import { INITIAL_RELEASE_ACTION_STATE } from "@/lib/releases/release-input";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const DIGEST = "a".repeat(64);
const OTHER_DIGEST = "b".repeat(64);

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  fetchAccountApiMe: vi.fn(),
  getCurrentAssurance: vi.fn(),
  revalidatePath: vi.fn(),
  fetchReleaseCatalogue: vi.fn(),
  publishReleaseManifest: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/dal/assurance-guard", () => ({ getCurrentAssurance: mocks.getCurrentAssurance }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/account-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api");
  return { ...actual, fetchAccountApiMe: mocks.fetchAccountApiMe };
});
vi.mock("@/lib/admin/release-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/release-api")>("@/lib/admin/release-api");
  return {
    ...actual,
    fetchReleaseCatalogue: mocks.fetchReleaseCatalogue,
    publishReleaseManifest: mocks.publishReleaseManifest,
  };
});

import { publishRelease, rollbackRelease, setReleaseDisabled } from "@/app/admin/releases/actions";

const owner: AccountApiMe = {
  ok: true,
  correlation_id: "qt-me",
  user: { user_id: USER_ID, email: "owner@example.test", is_active: true },
  role: {
    effective: "owner",
    database: "owner",
    legacy: "admin",
    mismatch: "expected-owner-projection",
    break_glass: false,
  },
  capabilities: [
    "account:read-self",
    "account:read-any",
    "releases:read-status",
    "releases:publish",
  ],
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

function publishForm(overrides: Record<string, string> = {}): FormData {
  const fields: Record<string, string> = {
    name: "Quantify Terminal",
    title: "Faster charts",
    version: "1.4.0",
    description: "A new release.",
    features: "Faster charts\nNew geopolitics data",
    severity: "recommended",
    channel: "stable",
    download_page_url: "https://www.quantifyterminal.com/download",
    release_notes_url: "",
    banner_image_url: "",
    windows_url: "https://releases.example.test/qt-1.4.0.exe",
    mac_url: "",
    linux_appimage_url: "",
    linux_deb_url: "",
    linux_rpm_url: "",
    checksum_windows: DIGEST,
    checksum_mac: "",
    checksum_linux_appimage: "",
    checksum_linux_deb: "",
    checksum_linux_rpm: "",
    min_supported_version: "",
    confirm_version: "1.4.0",
    ...overrides,
  };
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const storedManifest = {
  name: "Quantify Terminal",
  version: "1.3.0",
  description: "The previous release.",
  download_page_url: "https://www.quantifyterminal.com/download",
  windows_url: "https://releases.example.test/qt-1.3.0.exe",
  mac_url: "",
  linux_appimage_url: "",
  linux_deb_url: "",
  linux_rpm_url: "",
  checksums: { windows: OTHER_DIGEST },
  disabled: false,
  force_update: false,
  min_supported_version: "",
};

function catalogue(overrides: Record<string, unknown> = {}) {
  return {
    signingConfigured: true,
    currentVersion: "1.4.0",
    entries: [],
    manifests: {
      "1.3.0": { ...storedManifest },
      "1.4.0": { ...storedManifest, version: "1.4.0" },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createServerAzureClient.mockResolvedValue({ getAccessToken: () => "token" });
  mocks.fetchAccountApiMe.mockResolvedValue(owner);
  mocks.getCurrentAssurance.mockResolvedValue(assurance);
  mocks.fetchReleaseCatalogue.mockResolvedValue(catalogue());
  mocks.publishReleaseManifest.mockImplementation(
    async (_token: string, manifest: Record<string, unknown>) => ({
      version: String(manifest.version),
      serving: manifest.disabled !== true,
    }),
  );
});

describe("publishing a release", () => {
  it("forwards a complete manifest and reports that desktops will take it", async () => {
    const result = await publishRelease(INITIAL_RELEASE_ACTION_STATE, publishForm());

    expect(result.status).toBe("success");
    expect(result.message).toMatch(/1\.4\.0 published/u);
    const [, manifest] = mocks.publishReleaseManifest.mock.calls[0]!;
    expect(manifest).toMatchObject({
      version: "1.4.0",
      features: ["Faster charts", "New geopolitics data"],
      checksums: { windows: DIGEST },
      force_update: false,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/releases");
  });

  it("never sends a signature, whatever the form carried", async () => {
    const form = publishForm();
    form.set("signature", "deadbeef");

    await publishRelease(INITIAL_RELEASE_ACTION_STATE, form);

    const [, manifest] = mocks.publishReleaseManifest.mock.calls[0]!;
    expect(manifest).not.toHaveProperty("signature");
  });

  it("composes the announcement without sending anything", async () => {
    const result = await publishRelease(INITIAL_RELEASE_ACTION_STATE, publishForm());

    expect(result.announcement?.subject).toBe("Quantify Terminal 1.4.0 is available");
    expect(result.announcement?.text).toMatch(/at your convenience/u);
    expect(result.announcement?.html).toContain("RECOMMENDED");
  });

  it("says a required update is mandatory in the announcement", async () => {
    const result = await publishRelease(
      INITIAL_RELEASE_ACTION_STATE,
      publishForm({ force_update: "on" }),
    );

    expect(result.announcement?.html).toContain("MANDATORY UPDATE");
    expect(result.announcement?.text).toMatch(/REQUIRED update/u);
  });

  it("treats a version floor as mandatory even with the force box clear", async () => {
    const result = await publishRelease(
      INITIAL_RELEASE_ACTION_STATE,
      publishForm({ min_supported_version: "1.2.0" }),
    );

    expect(result.announcement?.html).toContain("MANDATORY UPDATE");
  });

  it("refuses a plain-http installer URL", async () => {
    const result = await publishRelease(
      INITIAL_RELEASE_ACTION_STATE,
      publishForm({ windows_url: "http://releases.example.test/qt.exe" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/https/iu);
    expect(mocks.publishReleaseManifest).not.toHaveBeenCalled();
  });

  it("refuses a platform URL with no checksum", async () => {
    const result = await publishRelease(
      INITIAL_RELEASE_ACTION_STATE,
      publishForm({ checksum_windows: "" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/checksum/iu);
    expect(mocks.publishReleaseManifest).not.toHaveBeenCalled();
  });

  it("refuses a release with no platform download at all", async () => {
    const result = await publishRelease(
      INITIAL_RELEASE_ACTION_STATE,
      publishForm({ windows_url: "", checksum_windows: "" }),
    );

    expect(result.status).toBe("error");
    expect(mocks.publishReleaseManifest).not.toHaveBeenCalled();
  });

  it("refuses when the confirmation does not match the version", async () => {
    const result = await publishRelease(
      INITIAL_RELEASE_ACTION_STATE,
      publishForm({ confirm_version: "1.4" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/confirmation/iu);
    expect(mocks.publishReleaseManifest).not.toHaveBeenCalled();
  });

  it("refuses an account that can read release status but not publish", async () => {
    mocks.fetchAccountApiMe.mockResolvedValue({
      ...owner,
      capabilities: ["account:read-self", "account:read-any", "releases:read-status"],
    });

    const result = await publishRelease(INITIAL_RELEASE_ACTION_STATE, publishForm());

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/cannot publish/iu);
    expect(mocks.publishReleaseManifest).not.toHaveBeenCalled();
  });

  it("requires AAL2 before publishing", async () => {
    mocks.getCurrentAssurance.mockResolvedValue({
      ...assurance,
      currentLevel: "aal1",
      challengeRequired: true,
    });

    const result = await publishRelease(INITIAL_RELEASE_ACTION_STATE, publishForm());

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/passkey/iu);
    expect(mocks.publishReleaseManifest).not.toHaveBeenCalled();
  });

  it("says a staged release is not being served rather than reporting it published", async () => {
    const result = await publishRelease(
      INITIAL_RELEASE_ACTION_STATE,
      publishForm({ disabled: "on" }),
    );

    expect(result.status).toBe("success");
    expect(result.message).toMatch(/not served/iu);
  });

  it("reports a refusal from the release service in its own words", async () => {
    const { ReleaseApiRequestError } =
      await vi.importActual<typeof import("@/lib/admin/release-api")>("@/lib/admin/release-api");
    mocks.publishReleaseManifest.mockRejectedValue(
      new ReleaseApiRequestError(503, "Release signing is not configured on this deployment."),
    );

    const result = await publishRelease(INITIAL_RELEASE_ACTION_STATE, publishForm());

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/signing is not configured/iu);
  });
});

describe("rolling back", () => {
  function rollbackForm(version = "1.3.0", confirm = version): FormData {
    const data = new FormData();
    data.set("version", version);
    data.set("confirm_version", confirm);
    return data;
  }

  it("re-publishes what the catalogue recorded, never what the browser sent", async () => {
    const data = rollbackForm();
    // A caller who tampers with the form gets their extra fields ignored: the manifest
    // comes from the catalogue read, not from the request body.
    data.set("windows_url", "https://evil.test/payload.exe");

    const result = await rollbackRelease(INITIAL_RELEASE_ACTION_STATE, data);

    expect(result.status).toBe("success");
    const [, manifest] = mocks.publishReleaseManifest.mock.calls[0]!;
    expect(manifest.windows_url).toBe("https://releases.example.test/qt-1.3.0.exe");
  });

  it("clears the disabled flag so the rollback actually reaches clients", async () => {
    mocks.fetchReleaseCatalogue.mockResolvedValue(
      catalogue({ manifests: { "1.3.0": { ...storedManifest, disabled: true } } }),
    );

    await rollbackRelease(INITIAL_RELEASE_ACTION_STATE, rollbackForm());

    const [, manifest] = mocks.publishReleaseManifest.mock.calls[0]!;
    expect(manifest.disabled).toBe(false);
  });

  it("says plainly that machines on a later build stay there", async () => {
    const result = await rollbackRelease(INITIAL_RELEASE_ACTION_STATE, rollbackForm());

    expect(result.message).toMatch(/already on a later build stay there/iu);
  });

  it("refuses a version that is not in the catalogue", async () => {
    const result = await rollbackRelease(INITIAL_RELEASE_ACTION_STATE, rollbackForm("9.9.9"));

    expect(result.status).toBe("error");
    expect(mocks.publishReleaseManifest).not.toHaveBeenCalled();
  });

  it("refuses to roll back to the release already being served", async () => {
    const result = await rollbackRelease(INITIAL_RELEASE_ACTION_STATE, rollbackForm("1.4.0"));

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/already the release being served/iu);
    expect(mocks.publishReleaseManifest).not.toHaveBeenCalled();
  });

  it("refuses a stored manifest whose download URL is not https", async () => {
    mocks.fetchReleaseCatalogue.mockResolvedValue(
      catalogue({
        manifests: {
          "1.3.0": { ...storedManifest, windows_url: "http://old.example.test/qt.exe" },
        },
      }),
    );

    const result = await rollbackRelease(INITIAL_RELEASE_ACTION_STATE, rollbackForm());

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/non-https/iu);
    expect(mocks.publishReleaseManifest).not.toHaveBeenCalled();
  });

  it("still rolls back a release that predates the checksum requirement", async () => {
    mocks.fetchReleaseCatalogue.mockResolvedValue(
      catalogue({ manifests: { "1.3.0": { ...storedManifest, checksums: {} } } }),
    );

    const result = await rollbackRelease(INITIAL_RELEASE_ACTION_STATE, rollbackForm());

    expect(result.status).toBe("success");
  });

  it("refuses without the typed confirmation", async () => {
    const result = await rollbackRelease(INITIAL_RELEASE_ACTION_STATE, rollbackForm("1.3.0", ""));

    expect(result.status).toBe("error");
    expect(mocks.publishReleaseManifest).not.toHaveBeenCalled();
  });
});

describe("turning the served release off", () => {
  function disableForm(version: string, disabled: boolean): FormData {
    const data = new FormData();
    data.set("version", version);
    data.set("disabled", String(disabled));
    return data;
  }

  it("writes the disabled flag onto the release clients are reading", async () => {
    const result = await setReleaseDisabled(
      INITIAL_RELEASE_ACTION_STATE,
      disableForm("1.4.0", true),
    );

    expect(result.status).toBe("success");
    const [, manifest] = mocks.publishReleaseManifest.mock.calls[0]!;
    expect(manifest).toMatchObject({ version: "1.4.0", disabled: true });
  });

  it("says installed copies keep running", async () => {
    const result = await setReleaseDisabled(
      INITIAL_RELEASE_ACTION_STATE,
      disableForm("1.4.0", true),
    );

    expect(result.message).toMatch(/installed copies keep running/iu);
  });

  it("refuses on a superseded version, where the flag would change nothing", async () => {
    const result = await setReleaseDisabled(
      INITIAL_RELEASE_ACTION_STATE,
      disableForm("1.3.0", true),
    );

    expect(result.status).toBe("error");
    expect(result.message).toMatch(/roll back instead/iu);
    expect(mocks.publishReleaseManifest).not.toHaveBeenCalled();
  });

  it("refuses an account without the publish capability", async () => {
    mocks.fetchAccountApiMe.mockResolvedValue({
      ...owner,
      capabilities: ["account:read-self", "account:read-any"],
    });

    const result = await setReleaseDisabled(
      INITIAL_RELEASE_ACTION_STATE,
      disableForm("1.4.0", true),
    );

    expect(result.status).toBe("error");
    expect(mocks.publishReleaseManifest).not.toHaveBeenCalled();
  });
});

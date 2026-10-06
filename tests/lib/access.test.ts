import {
  ACCESS_DECLINED_MESSAGE,
  ACCESS_MESSAGES,
  ACCESS_PENDING_MESSAGE,
  accessHoldOf,
  accessRefusal,
  normaliseAccessStatus,
} from "@/lib/account/access";
import { AccountApiRequestError } from "@/lib/admin/account-api";
import { AzureAuthError } from "@/lib/azure-auth-client";
import { mapAccountOverview } from "@/lib/dto/account";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

function refusal(code: string, status = 403): AccountApiRequestError {
  return new AccountApiRequestError({
    status,
    code,
    message: "provider detail that must never reach a page",
    correlationId: null,
  });
}

describe("access by application", () => {
  it("reads the three statuses and nothing else", () => {
    expect(normaliseAccessStatus("pending")).toBe("pending");
    expect(normaliseAccessStatus(" Approved ")).toBe("approved");
    expect(normaliseAccessStatus("DECLINED")).toBe("declined");
    expect(normaliseAccessStatus("")).toBeNull();
    expect(normaliseAccessStatus("suspended")).toBeNull();
    expect(normaliseAccessStatus(undefined)).toBeNull();
  });

  it("holds back pending and declined accounts, and nothing it cannot read", () => {
    expect(accessHoldOf("pending")).toBe("pending");
    expect(accessHoldOf("declined")).toBe("declined");
    expect(accessHoldOf("approved")).toBeNull();
    // An older service says nothing; guessing "pending" would lock every admitted account out.
    expect(accessHoldOf("unknown")).toBeNull();
    expect(accessHoldOf(null)).toBeNull();
  });

  it("recognises the gate's refusals from either client, by code", () => {
    expect(accessRefusal(refusal("access_pending"))).toBe("pending");
    expect(accessRefusal(refusal("access_declined"))).toBe("declined");
    expect(
      accessRefusal(
        new AzureAuthError({
          status: 403,
          code: "access_declined",
          message: "x",
          correlationId: null,
        }),
      ),
    ).toBe("declined");
    expect(accessRefusal(refusal("forbidden"))).toBeNull();
    expect(accessRefusal(new Error("access_pending"))).toBeNull();
    expect(accessRefusal(null)).toBeNull();
  });

  it("maps each hold to its sentence", () => {
    expect(ACCESS_MESSAGES.pending).toBe(ACCESS_PENDING_MESSAGE);
    expect(ACCESS_MESSAGES.declined).toBe(ACCESS_DECLINED_MESSAGE);
    expect(ACCESS_DECLINED_MESSAGE).toMatch(/export or delete your data/u);
  });
});

describe("the account overview's access status", () => {
  const identity = { id: USER_ID, email: "applicant@example.test" };
  const profile = { user_id: USER_ID, first_name: "Noor", last_name: "Haddad" };

  it("takes the status from the signed-in identity", () => {
    const overview = mapAccountOverview({
      identity: { ...identity, access_status: "pending" },
      profile: { ...profile, access_status: "approved" },
      profileState: "ready",
    });
    expect(overview.accessStatus).toBe("pending");
  });

  it("falls back to the profile's copy of the same column", () => {
    const overview = mapAccountOverview({
      identity,
      profile: { ...profile, access_status: "declined" },
      profileState: "ready",
    });
    expect(overview.accessStatus).toBe("declined");
  });

  it("says unknown, never pending, when neither carries one", () => {
    const overview = mapAccountOverview({ identity, profile, profileState: "ready" });
    expect(overview.accessStatus).toBe("unknown");
  });
});

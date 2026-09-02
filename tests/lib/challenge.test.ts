import {
  CHALLENGE_ERROR_MESSAGE,
  CHALLENGE_FIELD_NAME,
  parseChallengeToken,
} from "@/lib/auth/challenge";

describe("abuse challenge input policy", () => {
  it("accepts a bounded Turnstile token without exposing a private verifier", () => {
    expect(CHALLENGE_FIELD_NAME).toBe("cf-turnstile-response");
    expect(parseChallengeToken("  turnstile-public-response  ")).toEqual({
      success: true,
      token: "turnstile-public-response",
    });
  });

  it.each([null, "", "   ", "x".repeat(4_097)])(
    "rejects missing or oversized challenge input",
    (input) => {
      expect(parseChallengeToken(input)).toEqual({
        success: false,
        message: CHALLENGE_ERROR_MESSAGE,
      });
    },
  );

  it("rejects non-string form values", () => {
    expect(parseChallengeToken(new File(["unsafe"], "challenge.txt"))).toEqual({
      success: false,
      message: CHALLENGE_ERROR_MESSAGE,
    });
  });
});

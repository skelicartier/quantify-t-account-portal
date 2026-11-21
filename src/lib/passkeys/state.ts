/**
 * What the console knows about this session's passkey, in a shape both the server and
 * the browser can hold. It decides what is shown; the Account API decides what answers.
 */
export type PasskeyState = {
  /** `off`, `when-enrolled` or `required`: how strict the service is with staff. */
  mode: "off" | "when-enrolled" | "required";
  /** The account holds a staff role. */
  staff: boolean;
  /** The account has at least one passkey. */
  enrolled: boolean;
  count: number;
  /** Staff routes will not answer until this session proves a passkey. */
  required: boolean;
  /** This session proved one recently enough to read. */
  verified: boolean;
  /** This session proved one recently enough to change things. */
  fresh: boolean;
  verifiedUntil: string | null;
  freshUntil: string | null;
};

/** What a passkey step answers: done, or one sentence saying why not. */
export type PasskeyStepResult<T = null> =
  | { status: "ok"; value: T }
  | { status: "error"; message: string; reason: PasskeyRefusal };

export type PasskeyRefusal =
  | "password"
  | "rate-limited"
  | "needs-passkey"
  | "needs-enrolment"
  | "signed-out"
  | "address"
  | "expired"
  | "refused"
  | "unavailable";

export const PASSKEY_NAME_MAX = 80;

/** A passkey as the Security page lists it: a name and two dates, never a key. */
export type PasskeyListItem = {
  id: string;
  name: string;
  createdAt: string | null;
  lastUsedAt: string | null;
};

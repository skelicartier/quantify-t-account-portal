export const ACCOUNT_EXPORT_CONFIRMATION = "EXPORT MY DATA";
export const ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT";
export const ACCOUNT_DELETION_CANCEL_CONFIRMATION = "KEEP MY ACCOUNT";

/**
 * `lifecycle.BROKER_HOLD_CODE`: a due erasure waits for a broker to confirm cancellation. The
 * deletion page branches on this code, never on the wording of `last_error`.
 */
export const DELETION_BROKER_HOLD_CODE = "broker_cancellation";

/** What the erasure removes and keeps, in the Account API's words (`erasure.ERASURE_STATEMENT`). */
export type AccountErasureSummary = {
  erased: string;
  kept: string[];
};

export type AccountLifecycleActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors: {
    currentPassword: string[];
    confirmation: string[];
  };
  /** Set by a deletion request the service accepted, so the confirmation can say what goes. */
  erasure?: AccountErasureSummary;
};

export const INITIAL_ACCOUNT_LIFECYCLE_STATE: AccountLifecycleActionState = {
  status: "idle",
  message: "",
  fieldErrors: { currentPassword: [], confirmation: [] },
};

export function singleFormValue(
  formData: FormData,
  field: string,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
): string | null {
  const values = formData.getAll(field);
  if (values.length !== 1 || typeof values[0] !== "string") return null;
  const value = values[0].trim();
  if (value) return value;
  return allowEmpty ? "" : null;
}

export function exactConfirmation(value: string | null, expected: string): boolean {
  return value === expected;
}

export type ShellSection = "account";

export type ShellIdentity = {
  email: string | null;
  displayName: string;
  initials: string;
  role: string | null;
  plan?: string | null;
  environment?: string | null;
  /** The demo's personas, offered in the identity menu; development only. */
  devPersonas?: ReadonlyArray<{ email: string; label: string }> | undefined;
};

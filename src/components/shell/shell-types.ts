export type ShellSection = "account" | "admin";

export type ShellIdentity = {
  email: string | null;
  displayName: string;
  initials: string;
  role: string | null;
  plan?: string | null;
  environment?: string | null;
  canEnterAdmin: boolean;
};

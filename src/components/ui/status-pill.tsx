import { formatLabel } from "@/lib/format";

export type PillTone = "live" | "danger" | "attention" | "neutral";

const LIVE = new Set([
  "active",
  "success",
  "ready",
  "sent",
  "complete",
  "completed",
  "verified",
  "enabled",
  "configured",
  "on",
  "confirmed",
  "in-sync",
  "yes",
]);

const DANGER = new Set([
  "failure",
  "failed",
  "dead",
  "revoked",
  "blocked",
  "inactive",
  "disabled",
  "not-configured",
  "unverified",
  "off",
  "no",
]);

const ATTENTION = new Set([
  "retry",
  "paused",
  "expired",
  "unknown",
  "source-locked",
  "processing",
  "skipped",
  "partial",
  "pending-review",
]);

const LABEL_OVERRIDES: Record<string, string> = {
  retry: "Retrying",
  dead: "Failed",
  failure: "Failed",
  "source-locked": "Locked at source",
  "not-configured": "Not configured",
  "in-sync": "In sync",
};

export function statusTone(value: string | null | undefined): PillTone {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  if (LIVE.has(key)) return "live";
  if (DANGER.has(key)) return "danger";
  if (ATTENTION.has(key)) return "attention";
  return "neutral";
}

export function statusLabel(value: string | null | undefined): string {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!key) return "Unknown";
  return LABEL_OVERRIDES[key] ?? formatLabel(key);
}

type StatusPillProps = {
  value: string | null | undefined;
  label?: string;
  tone?: PillTone;
  className?: string;
};

/** A 7px status dot with a ring, followed by a human label. Single text node inside. */
export function StatusPill({ value, label, tone, className }: StatusPillProps) {
  const resolvedTone = tone ?? statusTone(value);
  return (
    <span className={["pill", `pill--${resolvedTone}`, className ?? ""].filter(Boolean).join(" ")}>
      {label ?? statusLabel(value)}
    </span>
  );
}

export function YesNoPill({
  value,
  yes = "Yes",
  no = "No",
}: {
  value: boolean;
  yes?: string;
  no?: string;
}) {
  return <StatusPill value={value ? "yes" : "no"} label={value ? yes : no} />;
}

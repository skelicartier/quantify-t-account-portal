/**
 * The shapes the support desk's forms and their Server Actions agree on.
 *
 * No Account API import, so the browser half of each form can use them: nothing here
 * describes a conversation, only the envelope around one — which thread a submission is
 * for and what the person on the desk is told afterwards.
 *
 * The rule that matters in this file: a result carries a fixed message, never text that
 * came back from the service. Upstream error bodies name routes, correlation ids and
 * sometimes the conversation of somebody who is not this caller's to see.
 */

export type AdminSupportActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_ADMIN_SUPPORT_STATE: AdminSupportActionState = {
  status: "idle",
  message: "",
};

/** Minted by the service, matched on shape rather than parsed. */
export const SUPPORT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;

/** The service's own cap, repeated so an over-long reply is refused before it is sent. */
export const SUPPORT_REPLY_MAX_LENGTH = 8_000;

export const SUPPORT_STATUSES = ["open", "pending", "resolved"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export function isSupportStatus(value: unknown): value is SupportStatus {
  return typeof value === "string" && (SUPPORT_STATUSES as readonly string[]).includes(value);
}

export function isSupportPriority(value: unknown): value is SupportPriority {
  return typeof value === "string" && (SUPPORT_PRIORITIES as readonly string[]).includes(value);
}

const STATUS_LABELS: Record<SupportStatus, string> = {
  // "Pending" is the service's word for answered-and-waiting-on-the-customer. Left as it
  // is, a desk reads an answered queue as an unanswered one.
  open: "Needs an answer",
  pending: "Waiting on customer",
  resolved: "Resolved",
};

const PRIORITY_LABELS: Record<SupportPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export function supportStatusLabel(value: string): string {
  return isSupportStatus(value) ? STATUS_LABELS[value] : "Unknown";
}

export function supportPriorityLabel(value: string): string {
  return isSupportPriority(value) ? PRIORITY_LABELS[value] : "Normal";
}

/**
 * How a row is toned in the queue. The tones are the shared pill vocabulary, not new
 * words: "needs an answer" is the same kind of thing as any other item asking for
 * attention, and a desk that has to learn a second colour language reads neither.
 */
export type SupportTone = "live" | "danger" | "attention" | "neutral";

export function supportStatusTone(value: string): SupportTone {
  if (value === "resolved") return "neutral";
  // Open is the one that needs somebody; answered-and-waiting is healthy.
  return value === "open" ? "attention" : "live";
}

/** Only the two that should pull the eye get a tone of their own. */
export function supportPriorityTone(value: string): SupportTone {
  if (value === "urgent") return "danger";
  return value === "high" ? "attention" : "neutral";
}

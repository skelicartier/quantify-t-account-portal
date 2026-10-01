/** The two audit event types, read back as something an operator can scan. */
export function subscriptionEventLabel(eventType: string): string {
  if (eventType === "account.subscription_changed") return "Plan changed";
  if (eventType === "account.entitlement_changed") return "Override changed";
  return eventType;
}

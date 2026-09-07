import type { AccountActivityEventDto } from "@/lib/dto/session";

type AccountActivityProps = {
  events: AccountActivityEventDto[];
};

function formatLabel(value: string): string {
  const acronyms = new Set(["api", "mfa", "totp", "uuid"]);
  return value
    .split(/[-_.\s]+/u)
    .filter(Boolean)
    .map((part) =>
      acronyms.has(part.toLowerCase())
        ? part.toUpperCase()
        : `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
    )
    .join(" ");
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export function AccountActivity({ events }: AccountActivityProps) {
  const lastEvent = events[0]?.occurredAt ?? null;

  return (
    <main className="account-main" id="main-content">
      <section className="account-page-heading" aria-labelledby="account-activity-heading">
        <p className="eyebrow">Cloud account</p>
        <h1 id="account-activity-heading">Activity</h1>
        <p>Authentication and account-security events from the cloud audit stream.</p>
      </section>

      <section className="account-grid account-grid--compact" aria-label="Activity summary">
        <article className="account-card">
          <p className="account-card__label">Events</p>
          <h2>{events.length}</h2>
        </article>
        <article className="account-card">
          <p className="account-card__label">Latest</p>
          <h2>{formatDateTime(lastEvent)}</h2>
        </article>
        <article className="account-card">
          <p className="account-card__label">Scope</p>
          <h2>Self only</h2>
        </article>
      </section>

      <section className="account-section" aria-labelledby="account-activity-list-heading">
        <div className="account-section__heading">
          <p className="account-card__label">Event history</p>
          <h2 id="account-activity-list-heading">Security timeline</h2>
        </div>

        {events.length > 0 ? (
          <div className="account-table-wrap">
            <table className="account-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Outcome</th>
                  <th>Surface</th>
                  <th>Occurred</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{formatLabel(event.eventType)}</td>
                    <td>
                      <span className={`status-value status-value--${event.outcome}`}>
                        {formatLabel(event.outcome)}
                      </span>
                    </td>
                    <td>{formatLabel(event.source)}</td>
                    <td>{formatDateTime(event.occurredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="account-empty-state">No security events were returned for this account.</p>
        )}
      </section>
    </main>
  );
}

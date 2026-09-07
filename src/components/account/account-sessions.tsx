import type { AccountSessionDto, AccountSessionStatus } from "@/lib/dto/session";

type AccountSessionsProps = {
  sessions: AccountSessionDto[];
};

function formatLabel(value: string): string {
  return value
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
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

function countByStatus(sessions: AccountSessionDto[], status: AccountSessionStatus): number {
  return sessions.filter((session) => session.status === status).length;
}

function sessionName(session: AccountSessionDto): string {
  return session.deviceName ?? formatLabel(session.source);
}

export function AccountSessions({ sessions }: AccountSessionsProps) {
  const activeCount = countByStatus(sessions, "active");
  const revokedCount = countByStatus(sessions, "revoked");
  const expiredCount = countByStatus(sessions, "expired");
  const mostRecent = sessions[0]?.lastSeenAt ?? null;

  return (
    <main className="account-main" id="main-content">
      <section className="account-page-heading" aria-labelledby="account-sessions-heading">
        <p className="eyebrow">Cloud account</p>
        <h1 id="account-sessions-heading">Sessions</h1>
        <p>Cloud session inventory for the signed-in Supabase identity.</p>
      </section>

      <section className="account-grid account-grid--compact" aria-label="Session summary">
        <article className="account-card">
          <p className="account-card__label">Active</p>
          <h2>{activeCount}</h2>
        </article>
        <article className="account-card">
          <p className="account-card__label">Ended</p>
          <h2>{revokedCount + expiredCount}</h2>
        </article>
        <article className="account-card">
          <p className="account-card__label">Last seen</p>
          <h2>{formatDateTime(mostRecent)}</h2>
        </article>
      </section>

      <section className="account-section" aria-labelledby="account-session-list-heading">
        <div className="account-section__heading">
          <p className="account-card__label">Inventory</p>
          <h2 id="account-session-list-heading">Signed-in surfaces</h2>
        </div>

        {sessions.length > 0 ? (
          <div className="account-table-wrap">
            <table className="account-table">
              <thead>
                <tr>
                  <th>Surface</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Last seen</th>
                  <th>Created</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <strong>{sessionName(session)}</strong>
                      <span>{formatLabel(session.source)}</span>
                    </td>
                    <td>{formatLabel(session.provider)}</td>
                    <td>
                      <span className={`status-value status-value--${session.status}`}>
                        {formatLabel(session.status)}
                      </span>
                    </td>
                    <td>{formatDateTime(session.lastSeenAt)}</td>
                    <td>{formatDateTime(session.createdAt)}</td>
                    <td>{formatDateTime(session.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="account-empty-state">No cloud sessions were returned for this account.</p>
        )}
      </section>
    </main>
  );
}

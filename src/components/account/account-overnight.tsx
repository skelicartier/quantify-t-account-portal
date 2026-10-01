import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { SegmentedLinks } from "@/components/ui/toolbar";
import type {
  OvernightBlindSpots,
  OvernightBrief,
  OvernightDocument,
  OvernightItem,
  OvernightMorning,
} from "@/lib/admin/account-api";
import type { OvernightBriefView, OvernightView } from "@/lib/dal/overnight";
import { formatDate } from "@/lib/format";

const BASE = "/account/overnight";

export const OVERNIGHT_TABS = [
  { key: "today", label: "This morning" },
  { key: "blind-spots", label: "Blind spots" },
  { key: "mornings", label: "Earlier mornings" },
] as const;

export type OvernightTab = (typeof OVERNIGHT_TABS)[number]["key"];

/** The six blocks of an item, in the order the terminal and the email print them. */
export const CARD_BLOCKS = [
  "Your belief",
  "What landed",
  "Where it hits",
  "What it costs",
  "To be right",
  "Precedent",
] as const;

const QUIET = "Nothing landed on this book overnight, so there is nothing to open.";
const NO_ORDER =
  "Hold, trim, exit or revise the belief from the terminal, where the decision is recorded with its reason. No order is ever placed: trim and exit are instructions you carry to your own broker.";

const VERDICT: Record<OvernightItem["verdict"], { label: string; tone: PillTone }> = {
  BREACHED: { label: "Breached", tone: "danger" },
  APPROACHING: { label: "Approaching", tone: "attention" },
  "READ-ACROSS": { label: "Read-across", tone: "neutral" },
};

const SECTIONS: ReadonlyArray<{ key: keyof OvernightBlindSpots["counts"]; title: string }> = [
  { key: "unbelieved_variables", title: "Unbelieved variables" },
  { key: "unthresholded_assumptions", title: "Unthresholded assumptions" },
  { key: "stale_beliefs", title: "Stale beliefs" },
  { key: "no_thesis", title: "No thesis recorded" },
];

function href(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `${BASE}?${text}` : BASE;
}

/** "30 Sep": the console's own date, without the year the switcher does not need. */
function shortDay(date: string): string {
  return formatDate(`${date}T00:00:00Z`, date).replace(/ \d{4}$/u, "");
}

function stageWord(stage: OvernightItem["stage"]): string {
  return stage === "active" ? "" : stage;
}

function itemMeta(item: OvernightItem): string {
  return [
    item.weight && `${item.weight} of book`,
    item.reach && `reach ${item.reach}`,
    item.landed && `landed ${[item.landed.value, item.landed.period].filter(Boolean).join(" ")}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function SourceLink({ url }: { url: string }) {
  if (!url) return null;
  return (
    <a className="text-link overnight__source" href={url} target="_blank" rel="noopener noreferrer">
      Open the source
      <ExternalLink size={13} strokeWidth={1.8} aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function Readouts({ items }: { items: ReadonlyArray<{ label: string; value: ReactNode }> }) {
  const shown = items.filter((item) => item.value !== "" && item.value !== null);
  if (shown.length === 0) return null;
  return (
    <dl className="overnight-readouts">
      {shown.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="overnight-block" aria-labelledby={id}>
      <h3 className="overnight-block__title" id={id}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function ItemDetail({ item }: { item: OvernightItem }) {
  const verdict = VERDICT[item.verdict];
  const stage = stageWord(item.stage);
  const prefix = `overnight-item-${item.rank}`;
  const precedent = item.precedent;
  // With a distribution or a case list to draw, the summary and the "kept going" sentence
  // lead and the table carries the rest; otherwise every line is printed as the terminal does.
  const showTables =
    precedent !== null &&
    ((precedent.spreads.length > 0 && !precedent.thin) ||
      (precedent.thin && precedent.cases.length > 0));
  const precedentLines = (showTables ? item.lines.precedent.slice(0, 2) : item.lines.precedent).map(
    (line) => line.trim(),
  );
  return (
    <article className="overnight-detail" aria-labelledby={`${prefix}-title`}>
      <header className="overnight-detail__head">
        <div className="overnight-detail__title-row">
          <h2 className="overnight-detail__title" id={`${prefix}-title`}>
            <span className="overnight-rank">{String(item.rank).padStart(2, "0")}</span>
            {item.name}
            {stage && <span className="overnight-stage"> · {stage}</span>}
          </h2>
          <StatusPill value={item.verdict} label={verdict.label} tone={verdict.tone} />
        </div>
        <p className="overnight-detail__meta">
          {[
            item.ticker,
            item.weight && `${item.weight} of book`,
            item.reach && `reach ${item.reach}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className={`overnight-detail__why overnight-detail__why--${verdict.tone}`}>{item.why}</p>
      </header>

      <Block id={`${prefix}-belief`} title={CARD_BLOCKS[0]}>
        <p className="overnight-line">{item.lines.belief}</p>
        <p className="overnight-note">
          {[
            item.belief.rule && `Rule ${item.belief.rule}`,
            item.belief.horizon && `horizon to ${formatDate(item.belief.horizon)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </Block>

      <Block id={`${prefix}-landed`} title={CARD_BLOCKS[1]}>
        <p className="overnight-line">{item.lines.landed}</p>
        {item.landed && (
          <>
            <Readouts
              items={[
                { label: "Landed", value: item.landed.value },
                { label: "Period", value: item.landed.period },
                {
                  label: `Judged as ${item.landed.judged_period || "TTM"}`,
                  value: item.landed.judged,
                },
              ]}
            />
            <p className="overnight-note">
              {[
                item.landed.kind && item.landed.kind[0]!.toUpperCase() + item.landed.kind.slice(1),
                item.landed.published && (
                  <Timestamp
                    key="published"
                    value={item.landed.published}
                    mode="absolute"
                    prefix="published"
                  />
                ),
                item.landed.source,
              ]
                .filter(Boolean)
                .map((part, index) => (
                  <span key={index}>
                    {index > 0 && " · "}
                    {part}
                  </span>
                ))}
            </p>
            <SourceLink url={item.landed.url} />
          </>
        )}
      </Block>

      <Block id={`${prefix}-hits`} title={CARD_BLOCKS[2]}>
        <p className="overnight-line">{item.lines.hits}</p>
        {item.chain.rows.length > 0 && (
          <>
            <p className="overnight-note">
              The cells that moved: {item.chain.rows.length} of{" "}
              {item.chain.cells.toLocaleString("en-GB")} recomputed.
            </p>
            <DataTable
              caption={`Where it hits, ${item.name}`}
              scroll={false}
              columns={[
                { key: "row", label: "Row", align: "end" },
                { key: "cell", label: "Cell" },
                { key: "period", label: "Period" },
                { key: "before", label: "Before", align: "end" },
                { key: "after", label: "After", align: "end" },
                { key: "change", label: "Change", align: "end" },
              ]}
            >
              {item.chain.rows.map((row, index) => (
                <tr key={`${row.row}-${row.label}-${index}`}>
                  <td className="data-table__num">{row.row || "—"}</td>
                  <td>
                    <span className="data-table__primary">{row.label}</span>
                    {row.landed && (
                      <span className="data-table__secondary">Where the figure landed</span>
                    )}
                  </td>
                  <td>{row.period || "—"}</td>
                  <td className="data-table__num">{row.before}</td>
                  <td className="data-table__num">{row.after}</td>
                  <td className="data-table__num">{row.change || "—"}</td>
                </tr>
              ))}
            </DataTable>
          </>
        )}
      </Block>

      <Block id={`${prefix}-cost`} title={CARD_BLOCKS[3]}>
        <p className="overnight-line">{item.lines.cost}</p>
        <Readouts
          items={item.scenarios.map((end) => ({
            label: `${end.output || "Output"} if it ${end.name} (${end.target})`,
            value: end.change || "—",
          }))}
        />
      </Block>

      <Block id={`${prefix}-unbreak`} title={CARD_BLOCKS[4]}>
        <p className="overnight-line">{item.lines.unbreak}</p>
        {item.unbreak && (
          <Readouts
            items={[
              {
                label: `Needed per ${item.unbreak.cadence || "period"} × ${item.unbreak.periods}`,
                value: item.unbreak.needed,
              },
              {
                label: `Trailing per ${item.unbreak.cadence || "period"} over ${item.unbreak.observed}`,
                value: item.unbreak.trailing,
              },
            ]}
          />
        )}
      </Block>

      <Block id={`${prefix}-precedent`} title={CARD_BLOCKS[5]}>
        {precedentLines.length === 0 ? (
          <p className="overnight-line">—</p>
        ) : (
          precedentLines.map((line, index) => (
            <p key={index} className="overnight-line">
              {line}
            </p>
          ))
        )}
        {showTables && precedent && precedent.spreads.length > 0 && !precedent.thin && (
          <DataTable
            caption={`Precedent, ${item.name}`}
            scroll={false}
            columns={[
              { key: "horizon", label: "Horizon" },
              { key: "n", label: "N", align: "end" },
              { key: "min", label: "Min", align: "end" },
              { key: "p25", label: "P25", align: "end" },
              { key: "median", label: "Median", align: "end" },
              { key: "p75", label: "P75", align: "end" },
              { key: "max", label: "Max", align: "end" },
              { key: "clusters", label: "Clusters" },
            ]}
          >
            {precedent.spreads.map((spread) => (
              <tr key={spread.horizon}>
                <td>{spread.horizon}</td>
                <td className="data-table__num">{spread.n}</td>
                <td className="data-table__num">{spread.min}</td>
                <td className="data-table__num">{spread.p25}</td>
                <td className="data-table__num">{spread.median}</td>
                <td className="data-table__num">{spread.p75}</td>
                <td className="data-table__num">{spread.max}</td>
                <td>{spread.clusters || "—"}</td>
              </tr>
            ))}
          </DataTable>
        )}
        {showTables && precedent && precedent.thin && precedent.cases.length > 0 && (
          <DataTable
            caption={`Precedent cases, ${item.name}`}
            scroll={false}
            columns={[
              { key: "case", label: "Case" },
              { key: "when", label: "When" },
              { key: "move", label: "Move", align: "end" },
            ]}
          >
            {precedent.cases.map((found, index) => (
              <tr key={`${found.label}-${index}`}>
                <td>{found.label}</td>
                <td>
                  <Timestamp value={found.when} mode="date" fallback="—" />
                </td>
                <td className="data-table__num">{found.move}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Block>

      {item.notes.length > 0 && (
        <Block id={`${prefix}-notes`} title="Notes">
          <ul className="overnight-list">
            {item.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </Block>
      )}

      <p className="overnight-decide">{NO_ORDER}</p>
    </article>
  );
}

function DocumentDetail({ document, index }: { document: OvernightDocument; index: number }) {
  const prefix = `overnight-document-${index}`;
  const held = document.held.length;
  return (
    <article className="overnight-detail" aria-labelledby={`${prefix}-title`}>
      <header className="overnight-detail__head">
        <div className="overnight-detail__title-row">
          <h2 className="overnight-detail__title" id={`${prefix}-title`}>
            <span className="overnight-rank">{document.form || "Document"}</span>
            {document.issuer}
          </h2>
          {held > 0 ? (
            <StatusPill value="held" label={`${held} held`} tone="live" />
          ) : (
            <StatusPill value="not-read" label="Not read" tone="neutral" />
          )}
        </div>
        <p className="overnight-detail__meta">{document.title}</p>
        <p className="overnight-detail__meta">
          {document.filed ? (
            <Timestamp value={document.filed} mode="absolute" prefix="Filed" />
          ) : (
            "Filing time unknown"
          )}
        </p>
        <SourceLink url={document.url} />
      </header>
      <Block id={`${prefix}-read`} title="What it changed, and who read it">
        {held > 0 ? (
          <ul className="overnight-list">
            {document.held.map((line, position) => (
              <li key={position}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="overnight-line">No belief reads a figure this document changed.</p>
        )}
      </Block>
      <Block id={`${prefix}-why`} title="Why nothing moved">
        <p className="overnight-line">{document.why}</p>
      </Block>
    </article>
  );
}

function Rail({
  brief,
  selected,
}: {
  brief: OvernightBrief;
  selected: { kind: "item" | "doc"; index: number } | null;
}) {
  return (
    <nav className="overnight-rail" aria-label="This morning's items">
      {brief.items.length > 0 && (
        <div className="overnight-rail__group">
          <h2 className="overnight-rail__title">
            Moved an assumption <span className="overnight-rail__count">{brief.items.length}</span>
          </h2>
          <ul>
            {brief.items.map((item, index) => {
              const current = selected?.kind === "item" && selected.index === index;
              const verdict = VERDICT[item.verdict];
              const stage = stageWord(item.stage);
              return (
                <li key={item.rank}>
                  <Link
                    className="overnight-row"
                    href={href({ date: brief.date, item: String(item.rank) })}
                    aria-current={current ? "true" : undefined}
                    scroll={false}
                  >
                    <span className="overnight-row__head">
                      <span className="overnight-rank">{String(item.rank).padStart(2, "0")}</span>
                      <span className="overnight-row__title">
                        {[item.ticker, item.name].filter(Boolean).join("  ")}
                        {stage && <span className="overnight-stage"> · {stage}</span>}
                      </span>
                      <StatusPill value={item.verdict} label={verdict.label} tone={verdict.tone} />
                    </span>
                    <span className="overnight-row__line">{item.belief.text}</span>
                    {itemMeta(item) && (
                      <span className="overnight-row__meta">{itemMeta(item)}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {brief.documents.length > 0 && (
        <div className="overnight-rail__group">
          <h2 className="overnight-rail__title">
            Read and held <span className="overnight-rail__count">{brief.documents.length}</span>
          </h2>
          <ul>
            {brief.documents.map((document, index) => {
              const current = selected?.kind === "doc" && selected.index === index;
              const held = document.held.length;
              return (
                <li key={`${document.issuer}-${index}`}>
                  <Link
                    className="overnight-row"
                    href={href({ date: brief.date, doc: String(index + 1) })}
                    aria-current={current ? "true" : undefined}
                    scroll={false}
                  >
                    <span className="overnight-row__head">
                      <span className="overnight-rank">{document.form || "Doc"}</span>
                      <span className="overnight-row__title">{document.issuer}</span>
                      {held > 0 ? (
                        <StatusPill value="held" label={`${held} held`} tone="live" />
                      ) : (
                        <StatusPill value="not-read" label="Not read" tone="neutral" />
                      )}
                    </span>
                    <span className="overnight-row__line">{document.title}</span>
                    <span className="overnight-row__meta">
                      {document.filed ? (
                        <Timestamp value={document.filed} mode="absolute" prefix="Filed" />
                      ) : (
                        "Filing time unknown"
                      )}
                      {" · "}
                      {held > 0
                        ? `${held} belief${held === 1 ? "" : "s"} read it and ${held === 1 ? "holds" : "hold"}`
                        : "No belief reads what it changed"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );
}

/** Which row is open: the one the URL names, else the first, as the terminal opens it. */
export function selectedRow(
  brief: OvernightBrief,
  item: string | undefined,
  doc: string | undefined,
): { kind: "item" | "doc"; index: number } | null {
  if (doc) {
    const index = Number.parseInt(doc, 10) - 1;
    if (Number.isInteger(index) && index >= 0 && index < brief.documents.length) {
      return { kind: "doc", index };
    }
  }
  if (item) {
    const index = brief.items.findIndex((candidate) => String(candidate.rank) === item);
    if (index >= 0) return { kind: "item", index };
  }
  if (brief.items.length > 0) return { kind: "item", index: 0 };
  if (brief.documents.length > 0) return { kind: "doc", index: 0 };
  return null;
}

function Today({
  brief,
  item,
  doc,
}: {
  brief: OvernightBrief;
  item: string | undefined;
  doc: string | undefined;
}) {
  const selected = selectedRow(brief, item, doc);
  const spots = brief.blind_spots;
  return (
    <>
      <p className="overnight-count">{brief.count_line}</p>
      <StatGrid columns={4} label="This morning">
        <Stat label="Documents" value={brief.documents_seen} />
        <Stat
          label="Moved"
          value={brief.documents_moving}
          tone={brief.documents_moving > 0 ? "danger" : "default"}
        />
        <Stat label="Held" value={brief.beliefs_held} />
        <Stat label="Blind spots" value={spots ? spots.total : "—"} />
      </StatGrid>
      {spots && spots.total > 0 && (
        <p className="overnight-note">
          {spots.teaser}{" "}
          <Link className="text-link" href={href({ date: brief.date, tab: "blind-spots" })}>
            See the blind spots
          </Link>
        </p>
      )}
      {selected === null ? (
        <EmptyState title={QUIET} />
      ) : (
        <div className="overnight">
          <Rail brief={brief} selected={selected} />
          <div className="overnight-pane">
            {selected.kind === "item" ? (
              <ItemDetail item={brief.items[selected.index]!} />
            ) : (
              <DocumentDetail document={brief.documents[selected.index]!} index={selected.index} />
            )}
          </div>
        </div>
      )}
      {(brief.attributions.length > 0 || brief.notes.length > 0) && (
        <div className="overnight-foot">
          {brief.notes.map((note, index) => (
            <p key={`note-${index}`}>{note}</p>
          ))}
          {brief.attributions.length > 0 && <p>Sources: {brief.attributions.join(" · ")}</p>}
        </div>
      )}
    </>
  );
}

function BlindSpots({ spots }: { spots: OvernightBlindSpots | null }) {
  if (!spots) {
    return (
      <EmptyState
        title="Blind spots were not read this morning."
        description="The terminal reads them with the brief; they appear here with the next one."
      />
    );
  }
  return (
    <>
      <p className="overnight-count">{spots.teaser}</p>
      <StatGrid columns={4} label="Blind spots">
        {SECTIONS.map((section) => (
          <Stat key={section.key} label={section.title} value={spots.counts[section.key]} />
        ))}
      </StatGrid>
      {SECTIONS.map((section) => {
        const rows = spots.rows.filter((row) => row.section === section.key);
        if (rows.length === 0) return null;
        return (
          <section
            key={section.key}
            className="overnight-section"
            aria-labelledby={`blind-${section.key}`}
          >
            <h2 className="overnight-section__title" id={`blind-${section.key}`}>
              {section.title}
            </h2>
            <DataTable
              caption={section.title}
              scroll={false}
              columns={[
                { key: "position", label: "Position" },
                { key: "weight", label: "Share of book", align: "end" },
                { key: "missing", label: "What is missing" },
                { key: "seen", label: "Last seen" },
              ]}
            >
              {rows.map((row, index) => (
                <tr key={`${row.label}-${index}`}>
                  <td>
                    <span className="data-table__primary">{row.label}</span>
                    {row.variable && <span className="data-table__secondary">{row.variable}</span>}
                  </td>
                  <td className="data-table__num">{row.weight || "—"}</td>
                  <td>{row.text}</td>
                  <td>
                    <Timestamp value={row.last_seen} mode="date" fallback="—" />
                  </td>
                </tr>
              ))}
            </DataTable>
          </section>
        );
      })}
      {spots.rows_total > spots.rows.length && (
        <p className="overnight-note">
          Showing {spots.rows.length} of {spots.rows_total}; the terminal lists every one.
        </p>
      )}
      <p className="overnight-note">
        A blind spot closes when you record a belief about it in the terminal.
      </p>
    </>
  );
}

function Mornings({
  mornings,
  keep,
  now,
}: {
  mornings: OvernightMorning[];
  keep: number;
  now: number | undefined;
}) {
  return (
    <>
      <DataTable
        caption="Earlier mornings"
        scroll={false}
        columns={[
          { key: "morning", label: "Morning" },
          { key: "documents", label: "Documents", align: "end" },
          { key: "moved", label: "Moved", align: "end" },
          { key: "held", label: "Held", align: "end" },
          { key: "blind", label: "Blind spots", align: "end" },
          { key: "summary", label: "Summary" },
          { key: "arrived", label: "Arrived" },
        ]}
      >
        {mornings.map((morning) => (
          <tr key={morning.date}>
            <td>
              <Link className="row-link data-table__primary" href={href({ date: morning.date })}>
                {formatDate(`${morning.date}T00:00:00Z`)}
              </Link>
            </td>
            <td className="data-table__num">{morning.documents_seen}</td>
            <td className="data-table__num">{morning.documents_moving}</td>
            <td className="data-table__num">{morning.beliefs_held}</td>
            <td className="data-table__num">{morning.blind_spots_total ?? "—"}</td>
            <td>{morning.count_line}</td>
            <td>
              <Timestamp value={morning.received_at} now={now} fallback="—" />
            </td>
          </tr>
        ))}
      </DataTable>
      <p className="overnight-note">The last {keep} mornings are kept.</p>
    </>
  );
}

type AccountOvernightProps = {
  view: OvernightView;
  date: string | undefined;
  brief: OvernightBriefView | null;
  tab: OvernightTab;
  item?: string | undefined;
  doc?: string | undefined;
  now?: number | undefined;
};

/**
 * The OVERNIGHT morning brief, as the terminal files it: what landed on the book overnight,
 * ranked, each item opening on the six blocks the terminal and the email print. Everything
 * here is the terminal's own text; the page lays it out and decides nothing.
 */
export function AccountOvernight({
  view,
  date,
  brief,
  tab,
  item,
  doc,
  now,
}: AccountOvernightProps) {
  const ready = brief?.status === "ready" ? brief.brief : null;
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Overnight"
        titleId="overnight-heading"
        meta={
          ready ? (
            <span>
              {formatDate(`${ready.date}T00:00:00Z`)}
              {ready.generated_at && (
                <>
                  {" · "}
                  <Timestamp value={ready.generated_at} mode="absolute" prefix="built" />
                </>
              )}
            </span>
          ) : undefined
        }
        description="Each morning the terminal reads what was filed overnight on the names you hold and checks it against the beliefs you recorded. It sends that brief here, so you can read it before the terminal is open. Decisions stay in the terminal."
      />
      <div className="page-content">
        {view.status === "unavailable" && (
          <Callout tone="danger" role="alert" title="The account service could not be reached">
            Your briefs are unchanged — this is a read that failed. Reload in a moment.
          </Callout>
        )}
        {view.status === "ready" && view.mornings.length === 0 && (
          <EmptyState
            title="No morning brief has arrived yet."
            description="The terminal builds a brief each morning from the names you hold and sends it here. Sign in to the terminal with this account; the first brief arrives after its next morning run."
          />
        )}
        {view.status === "ready" && view.mornings.length > 0 && (
          <>
            <nav className="rtabs" aria-label="Overnight views">
              {OVERNIGHT_TABS.map((entry) => (
                <Link
                  key={entry.key}
                  href={href({ date, tab: entry.key === "today" ? undefined : entry.key })}
                  aria-current={tab === entry.key ? "page" : undefined}
                >
                  {entry.label}
                  {entry.key === "mornings" && (
                    <span className="rtabs__count">{view.mornings.length}</span>
                  )}
                </Link>
              ))}
            </nav>
            {tab !== "mornings" && view.mornings.length > 1 && (
              <div className="overnight-days">
                <SegmentedLinks
                  label="Morning"
                  items={view.mornings.slice(0, 7).map((morning) => ({
                    href: href({ date: morning.date, tab: tab === "today" ? undefined : tab }),
                    label: shortDay(morning.date),
                    current: morning.date === date,
                  }))}
                />
              </div>
            )}
            {tab === "mornings" ? (
              <Mornings mornings={view.mornings} keep={view.keep} now={now} />
            ) : brief?.status === "missing" ? (
              <Callout tone="attention" title="There is no brief for that morning">
                Only the last {view.keep} mornings are kept.{" "}
                <Link className="text-link" href={BASE}>
                  Open the latest
                </Link>
              </Callout>
            ) : brief?.status === "unavailable" ? (
              <Callout tone="danger" role="alert" title="This morning's brief could not be read">
                It is unchanged — this is a read that failed. Reload in a moment.
              </Callout>
            ) : ready && tab === "blind-spots" ? (
              <BlindSpots spots={ready.blind_spots} />
            ) : ready ? (
              <Today brief={ready} item={item} doc={doc} />
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

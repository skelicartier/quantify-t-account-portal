type SpinnerProps = {
  /** `inline` sits inside a button or a line of text; `block` is the page-sized one. */
  size?: "inline" | "block";
  /** Read by screen readers; omit when the surrounding element already says what is loading. */
  label?: string | undefined;
  className?: string | undefined;
};

const SPOKES = 8;

/**
 * The console's loading mark: short lines set around a centre, each fading in turn, so
 * the bright one travels round the ring.
 *
 * A page that is fetching looks exactly like a page that is stuck unless something moves.
 * This moves wherever work is in flight: in the middle of a page that has not arrived
 * yet, and in a button whose action is running. It takes its colour from the text around
 * it, and holds still, as a ring of graded lines, for anyone who has asked their system
 * to reduce motion.
 */
export function Spinner({ size = "inline", label, className }: SpinnerProps) {
  return (
    <span
      className={["spinner", size === "block" ? "spinner--block" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {Array.from({ length: SPOKES }, (_, index) => (
        <span key={index} />
      ))}
    </span>
  );
}

/**
 * The page-sized spinner, held in the middle of the content pane. A page change and the
 * placeholder of a page still loading both use this one, in the same place, so the mark
 * does not jump when one hands over to the other. `late` waits a moment before showing,
 * so a page that arrives at once never flashes it.
 */
export function PageSpinner({ late = false }: { late?: boolean }) {
  return (
    <div className={late ? "page-loading page-loading--late" : "page-loading"} aria-hidden="true">
      <Spinner size="block" />
    </div>
  );
}

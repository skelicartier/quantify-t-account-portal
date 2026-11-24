type SpinnerProps = {
  /** `inline` sits inside a button or a line of text; `block` is the page-sized one. */
  size?: "inline" | "block";
  /** Read by screen readers; omit when the surrounding element already says what is loading. */
  label?: string | undefined;
  className?: string | undefined;
};

/**
 * The console's loading mark: the logo in motion. The logo is a ring with the purple dot on
 * it; here the dot glides round a hairline ring.
 *
 * A page that is fetching looks exactly like a page that is stuck unless something moves.
 * This moves wherever work is in flight: in the middle of a page that has not arrived
 * yet, and in a button whose action is running. Inside a button the dot takes the label's
 * colour (purple would be lost on the amber one). It holds still, with the dot where the
 * logo has it, for anyone who has asked their system to reduce motion.
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
      <span />
    </span>
  );
}

/**
 * The page-sized spinner, held in the middle of the content pane. A pressed link and the
 * placeholder of a page still loading both use this one, in the same place, so the mark
 * does not jump when one hands over to the other.
 */
export function PageSpinner() {
  return (
    <div className="page-loading" aria-hidden="true">
      <Spinner size="block" />
    </div>
  );
}

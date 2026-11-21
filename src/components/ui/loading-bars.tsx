type LoadingBarsProps = {
  /** `inline` sits inside a button or a line of text; `block` announces a whole page. */
  size?: "inline" | "block";
  /** Read by screen readers; omit when the surrounding element already says what is loading. */
  label?: string | undefined;
  className?: string | undefined;
};

const STRIPS = 5;

/**
 * The console's loading mark: five vertical strips rising and falling in turn.
 *
 * A page that is fetching looks exactly like a page that is stuck unless something moves.
 * This moves, in the accent colour, wherever work is in flight: across a page change, in a
 * button whose action is running, at the head of a page that has not arrived yet. It takes
 * its colour from the text around it unless it is the block size, and stops moving for
 * anyone who has asked their system to reduce motion.
 */
export function LoadingBars({ size = "inline", label, className }: LoadingBarsProps) {
  return (
    <span
      className={["bars", size === "block" ? "bars--block" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {Array.from({ length: STRIPS }, (_, index) => (
        <span key={index} />
      ))}
    </span>
  );
}

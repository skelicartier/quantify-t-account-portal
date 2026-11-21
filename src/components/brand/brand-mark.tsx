import Link from "@/components/ui/link";

import { Wordmark } from "@/components/brand/wordmark";

type BrandMarkProps = {
  /** The phone bar's smaller size. */
  compact?: boolean;
  href?: string;
};

/**
 * The brand at the top of the rail and the phone bar: the wordmark alone. A collapsed
 * rail has no room for it and shows none.
 */
export function BrandMark({ compact = false, href = "/account" }: BrandMarkProps) {
  return (
    <Link className="brand" href={href} aria-label="Quantify Terminal, your account">
      <Wordmark size={compact ? "small" : "rail"} />
    </Link>
  );
}

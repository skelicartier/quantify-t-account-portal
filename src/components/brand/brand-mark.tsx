import Link from "next/link";

type BrandMarkProps = {
  compact?: boolean;
  href?: string;
};

export function BrandMark({ compact = false, href = "/login" }: BrandMarkProps) {
  return (
    <Link className="brand" href={href} aria-label="Quantify Terminal account home">
      <span className="brand__mark" aria-hidden="true">
        QT
      </span>
      {!compact && (
        <span className="brand__name">
          <strong>QUANTIFY</strong>
          <span>TERMINAL</span>
        </span>
      )}
    </Link>
  );
}

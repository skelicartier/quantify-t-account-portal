import Link from "next/link";

type BrandMarkProps = {
  compact?: boolean;
  href?: string;
};

export function BrandMark({ compact = false, href = "/login" }: BrandMarkProps) {
  return (
    <Link className="brand-mark" href={href} aria-label="Quantify Terminal account home">
      <span className="brand-mark__symbol" aria-hidden="true">
        QT
      </span>
      {!compact && (
        <span className="brand-mark__wordmark">
          <strong>QUANTIFY</strong>
          <span>TERMINAL</span>
        </span>
      )}
    </Link>
  );
}

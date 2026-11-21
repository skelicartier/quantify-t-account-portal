import type { CSSProperties } from "react";

import { PageSpinner } from "@/components/ui/spinner";

type SkeletonProps = {
  variant?: "line" | "title" | "block";
  width?: string | number;
  height?: string | number;
};

export function Skeleton({ variant = "line", width, height }: SkeletonProps) {
  const style: CSSProperties = {};
  if (width !== undefined) style.width = width;
  if (height !== undefined) style.height = height;
  return <span className={`skeleton skeleton--${variant}`} style={style} aria-hidden="true" />;
}

type PageSkeletonProps = {
  variant?: "account" | "admin" | "detail";
};

/**
 * What a console page shows until it arrives: a cleared pane with the spinner in the
 * middle, announced once. It is deliberately the same picture a pressed link shows
 * (`RouteProgress`), so a page change is one steady spinner from the press to the page
 * and never a second layout flashing in between.
 */
export function PageSkeleton({ variant = "account" }: PageSkeletonProps) {
  return (
    <div className="skeleton-page" role="status" aria-busy="true" data-variant={variant}>
      <PageSpinner />
      <span className="sr-only">Loading</span>
    </div>
  );
}

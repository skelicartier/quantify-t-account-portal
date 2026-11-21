"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { setPendingPath } from "@/components/shell/pending-route";
import { PageSpinner } from "@/components/ui/spinner";

const STALE_AFTER_MS = 10_000;

type Navigation = { from: string; to: string };

/**
 * What a pressed link shows until its page arrives: a thin bar along the top edge, the
 * page cleared, and the spinner in the middle of it.
 *
 * It shows on the press itself. The new page takes as long as it takes, but the person
 * must never be left looking at the section they just left, wondering whether the press
 * registered. Clicks are observed on the document, so every console link (rail, paging,
 * "Open") gets the same treatment without wrapping each one; it ends when the address
 * changes, where the page's own placeholder shows the same spinner in the same place.
 *
 * A link that does not lead to a page is left alone: one that downloads, one that opens
 * elsewhere, one marked `data-no-progress` (a file the server streams back), and one to
 * the page already open.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = `${pathname}?${searchParams.toString()}`;
  const [navigation, setNavigation] = useState<Navigation | null>(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (anchor.closest("[data-no-progress]")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const to = `${url.pathname}?${url.searchParams.toString()}`;
      if (to === current) return;
      const started: Navigation = { from: current, to };
      setNavigation(started);
      setPendingPath(url.pathname);
      window.setTimeout(() => {
        setNavigation((active) => {
          if (active !== started) return active;
          setPendingPath(null);
          return null;
        });
      }, STALE_AFTER_MS);
    }
    // Heard on the way down to the link, before the link's own handler. Next's link
    // handles the press itself and marks it handled; listening after it, this saw every
    // press as already dealt with and showed nothing at all for the console's own links.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [current]);

  const pending = navigation !== null && navigation.from === current;
  useEffect(() => {
    // The address changed: the page has started to arrive, and the rail follows it again.
    if (!pending) setPendingPath(null);
  }, [pending]);
  if (!pending) return null;
  return (
    <>
      <div className="route-progress" role="progressbar" aria-label="Loading page" />
      <div className="page-veil" aria-hidden="true" />
      <PageSpinner />
    </>
  );
}

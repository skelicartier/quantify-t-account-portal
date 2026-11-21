import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * The console's link: Next's, with background loading of the page it points at switched
 * off unless a link asks for it.
 *
 * Left on, every link that scrolls into view sends a request of its own, and every such
 * request passes the session check, which is a call to the Account API. A page with a
 * table of accounts and a full rail sent dozens of them, including one for the CSV
 * export, and the person's own click then waited behind all of it. Nothing was gained in
 * return: these pages are rendered per request, so the only thing loaded ahead was the
 * placeholder, and the console now shows that the moment a link is pressed
 * (`RouteProgress`).
 */
export default function Link({ prefetch = false, ...rest }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...rest} />;
}

import Link from "@/components/ui/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";

type AuthShellProps = {
  title: string;
  description?: string;
  /** Follow the signed-in console's theme instead of the always-dark sign-in canvas. */
  themed?: boolean;
  children: ReactNode;
};

const MARKETING_SITE = "https://www.quantifyterminal.com";

/**
 * The credential surface: the wordmark at the top, the form, a legal line at the foot. No
 * image and no chrome. The brand is said once, by the wordmark: headings, switch lines and
 * the foot never repeat it.
 */
export function AuthShell({ title, description, themed = false, children }: AuthShellProps) {
  return (
    <main className={themed ? "auth auth--console" : "auth auth--entry"} id="main-content">
      <section className="auth__panel" aria-labelledby="auth-heading">
        <div className="auth__brand">
          <Link
            className="auth__wordmark"
            href="/login"
            aria-label="Quantify Terminal account home"
          >
            <Wordmark size="large" />
          </Link>
        </div>
        <div className="auth__body">
          <div className="auth__header">
            <h1 className="auth__title" id="auth-heading">
              {title}
            </h1>
            {description && <p className="auth__desc">{description}</p>}
          </div>
          {children}
        </div>
      </section>
      <AuthLegal />
    </main>
  );
}

/** The single legal line at the foot of every page that sits outside the console shell. */
export function AuthLegal() {
  return (
    <p className="auth__legal">
      <a href={`${MARKETING_SITE}/privacy`} rel="noreferrer">
        Privacy
      </a>
      <a href={`${MARKETING_SITE}/terms`} rel="noreferrer">
        Terms
      </a>
    </p>
  );
}

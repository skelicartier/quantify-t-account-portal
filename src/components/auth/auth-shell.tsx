import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand/brand-mark";

type AuthShellProps = {
  title: string;
  description: string;
  /** Follow the signed-in console's theme instead of the always-dark sign-in canvas. */
  themed?: boolean;
  children: ReactNode;
};

const MARKETING_SITE = "https://www.quantifyterminal.com";

/**
 * The credential surface: one narrow column on the dark canvas — mark, heading, form —
 * and a single legal line at the foot. No chrome competes with the form.
 */
export function AuthShell({ title, description, themed = false, children }: AuthShellProps) {
  return (
    <main className={themed ? "auth auth--console" : "auth"} id="main-content">
      <section className="auth__panel" aria-labelledby="auth-heading">
        <div className="auth__brand">
          <BrandMark />
        </div>
        <div className="auth__header">
          <h1 className="auth__title" id="auth-heading">
            {title}
          </h1>
          <p className="auth__desc">{description}</p>
        </div>
        {children}
      </section>
      <AuthLegal />
    </main>
  );
}

/** The single legal line at the foot of every page that sits outside the console shell. */
export function AuthLegal() {
  return (
    <p className="auth__legal">
      <a href={MARKETING_SITE} rel="noreferrer">
        quantifyterminal.com
      </a>
      <span aria-hidden="true">·</span>
      <a href={`${MARKETING_SITE}/privacy`} rel="noreferrer">
        Privacy
      </a>
      <span aria-hidden="true">·</span>
      <a href={`${MARKETING_SITE}/terms`} rel="noreferrer">
        Terms
      </a>
    </p>
  );
}

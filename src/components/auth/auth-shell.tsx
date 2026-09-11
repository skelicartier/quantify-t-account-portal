import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand/brand-mark";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

const MARKETING_SITE = "https://www.quantifyterminal.com";

/** The single-column credential surface: brand bar, one card, legal links. */
export function AuthShell({ eyebrow, title, description, children }: AuthShellProps) {
  return (
    <main className="auth" id="main-content">
      <div className="auth__bar">
        <BrandMark />
        <a className="auth__site" href={MARKETING_SITE} rel="noreferrer">
          quantifyterminal.com
        </a>
      </div>
      <div className="auth__main">
        <div className="auth__stack">
          <section className="auth-card" aria-labelledby="auth-heading">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="auth-card__title" id="auth-heading">
              {title}
            </h1>
            <p className="auth-card__desc">{description}</p>
            {children}
          </section>
          <p className="auth__legal">
            Protected account surface ·{" "}
            <a href={`${MARKETING_SITE}/privacy`} rel="noreferrer">
              Privacy
            </a>{" "}
            ·{" "}
            <a href={`${MARKETING_SITE}/terms`} rel="noreferrer">
              Terms
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

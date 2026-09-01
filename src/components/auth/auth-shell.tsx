import { ArrowUpRight, KeyRound, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand/brand-mark";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

const trustItems = [
  {
    icon: ShieldCheck,
    title: "Shared cloud identity",
    detail: "One verified account for the portal and desktop terminal.",
  },
  {
    icon: KeyRound,
    title: "Server-enforced access",
    detail: "Authorization is checked at the data and API boundaries.",
  },
];

export function AuthShell({ eyebrow, title, description, children }: AuthShellProps) {
  return (
    <main className="auth-shell" id="main-content">
      <section className="auth-shell__context" aria-labelledby="portal-context-heading">
        <BrandMark />

        <div className="auth-shell__context-copy">
          <p className="eyebrow">Account infrastructure</p>
          <h1 id="portal-context-heading">
            Control your access.
            <span>Keep your terminal connected.</span>
          </h1>
          <p>
            A dedicated account surface for identity, preferences, sessions, and authorized
            administration.
          </p>
        </div>

        <div className="trust-list" aria-label="Security architecture">
          {trustItems.map(({ icon: Icon, title: itemTitle, detail }) => (
            <div className="trust-item" key={itemTitle}>
              <Icon aria-hidden="true" size={18} strokeWidth={1.7} />
              <div>
                <strong>{itemTitle}</strong>
                <span>{detail}</span>
              </div>
            </div>
          ))}
        </div>

        <a className="context-link" href="https://www.quantifyterminal.com" rel="noreferrer">
          Visit quantifyterminal.com
          <ArrowUpRight aria-hidden="true" size={16} />
        </a>
      </section>

      <section className="auth-shell__surface" aria-labelledby="auth-heading">
        <div className="auth-card">
          <div className="auth-card__heading">
            <p className="eyebrow">{eyebrow}</p>
            <h2 id="auth-heading">{title}</h2>
            <p>{description}</p>
          </div>
          {children}
        </div>
        <p className="auth-shell__legal">
          Protected account surface · <a href="https://www.quantifyterminal.com/privacy">Privacy</a>{" "}
          · <a href="https://www.quantifyterminal.com/terms">Terms</a>
        </p>
      </section>
    </main>
  );
}

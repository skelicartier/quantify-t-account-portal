import type { Metadata } from "next";

import { BrandMark } from "@/components/brand/brand-mark";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="auth" id="main-content">
      <div className="auth__bar">
        <BrandMark />
      </div>
      <div className="auth__main">
        <div className="auth__stack">
          <section className="auth-card" aria-labelledby="not-found-heading">
            <p className="eyebrow">404</p>
            <h1 className="auth-card__title" id="not-found-heading">
              We couldn&apos;t find that page
            </h1>
            <p className="auth-card__desc">
              The link may be out of date, or the page may have moved. Your account and admin pages
              are still where they were.
            </p>
            <div className="auth-form">
              <ButtonLink href="/account" variant="primary" block>
                Go to your account
              </ButtonLink>
              <ButtonLink href="/login" block>
                Sign in
              </ButtonLink>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

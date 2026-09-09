"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

import { CHALLENGE_FIELD_NAME } from "@/lib/auth/challenge";

type TurnstileRenderOptions = {
  sitekey: string;
  theme: "dark";
  size: "flexible";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

type TurnstileApi = {
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type TurnstileFieldProps = {
  siteKey: string;
  error?: string | undefined;
  disabled?: boolean | undefined;
};

export function TurnstileField({ siteKey, error, disabled = false }: TurnstileFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const wasDisabled = useRef(disabled);
  const [token, setToken] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const [widgetUnavailable, setWidgetUnavailable] = useState(false);

  const renderWidget = useCallback(() => {
    if (!siteKey || !containerRef.current || !window.turnstile || widgetIdRef.current) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: "dark",
      size: "flexible",
      callback: (nextToken) => {
        setToken(nextToken);
        setWidgetUnavailable(false);
      },
      "expired-callback": () => setToken(""),
      "error-callback": () => {
        setToken("");
        setWidgetUnavailable(true);
      },
    });
  }, [siteKey]);

  useEffect(() => {
    if (scriptReady || window.turnstile) renderWidget();
  }, [renderWidget, scriptReady]);

  useEffect(() => {
    const submissionCompleted = wasDisabled.current && !disabled;
    wasDisabled.current = disabled;
    if (!submissionCompleted) return;

    setToken("");
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [disabled]);

  useEffect(
    () => () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    },
    [],
  );

  if (!siteKey) {
    return (
      <input type="hidden" name={CHALLENGE_FIELD_NAME} value="" disabled={disabled} readOnly />
    );
  }

  const displayedError =
    error ??
    (widgetUnavailable
      ? "Security verification is unavailable. Refresh the page and try again."
      : undefined);

  return (
    <div className="turnstile-field">
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => setWidgetUnavailable(true)}
      />
      <div ref={containerRef} role="group" aria-label="Security verification" />
      <input type="hidden" name={CHALLENGE_FIELD_NAME} value={token} disabled={disabled} readOnly />
      {displayedError && (
        <p className="field-error" id="challenge-error" role="alert">
          {displayedError}
        </p>
      )}
    </div>
  );
}

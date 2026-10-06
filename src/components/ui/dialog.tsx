"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  titleId: string;
  /** Danger draws the full border in the danger tone; nothing is ever a side strip. */
  tone?: "default" | "danger";
  children: ReactNode;
};

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]';

/**
 * A modal confirmation: what is about to happen, and the one decision it needs.
 *
 * Portalled to the console's own root (`.shell`), not to `<body>` and not left in place. Left
 * in place, a dialog opened from a table row sat inside the table's stacking context, and the
 * rows below it painted over its title and its password field. On `<body>` it would lose the
 * theme tokens `.shell` carries, and render dark in the light console. Focus moves to the
 * first control when it opens and back to whatever opened it when it closes; Escape and the
 * backdrop dismiss it, and Tab stays inside it.
 */
export function Dialog({ open, onClose, title, titleId, tone = "default", children }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const controls = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (controls.length === 0) return;
      const firstControl = controls[0]!;
      const lastControl = controls[controls.length - 1]!;
      if (event.shiftKey && document.activeElement === firstControl) {
        event.preventDefault();
        lastControl.focus();
      } else if (!event.shiftKey && document.activeElement === lastControl) {
        event.preventDefault();
        firstControl.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [open]);

  if (!open) return null;

  // Only ever open after a person pressed something, so this runs in the browser.
  const host = document.querySelector<HTMLElement>(".shell") ?? document.body;
  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className={["dialog", tone === "danger" ? "dialog--danger" : ""].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 className="dialog__title" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>,
    host,
  );
}

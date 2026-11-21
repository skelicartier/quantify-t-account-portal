"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Spinner } from "@/components/ui/spinner";

export type ButtonVariant = "default" | "primary" | "danger" | "ghost";
export type ButtonSize = "default" | "small" | "icon";

type ButtonStyle = {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  block?: boolean | undefined;
  className?: string | undefined;
};

export function buttonClass({
  variant = "default",
  size = "default",
  block,
  className,
}: ButtonStyle) {
  return [
    "btn",
    variant !== "default" ? `btn--${variant}` : "",
    size !== "default" ? `btn--${size}` : "",
    block ? "btn--block" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonStyle & {
    children: ReactNode;
    /** Show the spinner. A submit button also shows it while its form is sending. */
    busy?: boolean | undefined;
  };

/**
 * A button. One that submits a form shows the spinner for as long as that form's
 * action is in flight, without each form having to say so: pressing Save and seeing
 * nothing move is what makes a working page look stuck.
 */
export function Button({
  variant,
  size,
  block,
  className,
  type = "button",
  busy,
  children,
  ...rest
}: ButtonProps) {
  const { pending } = useFormStatus();
  const working = busy ?? (type === "submit" && pending);
  return (
    <button
      className={buttonClass({ variant, size, block, className })}
      type={type}
      aria-busy={working || undefined}
      {...rest}
    >
      {working && <Spinner />}
      {children}
    </button>
  );
}

type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  ButtonStyle & { href: string; children: ReactNode };

export function ButtonLink({
  href,
  variant,
  size,
  block,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  const classes = buttonClass({ variant, size, block, className });
  // Only the attributes a styled link needs are forwarded; the loose spread keeps the
  // component usable with plain anchor props under `exactOptionalPropertyTypes`.
  const anchorProps = rest as Record<string, unknown>;
  if (/^https?:\/\//u.test(href)) {
    return (
      <a className={classes} href={href} rel="noreferrer" {...anchorProps}>
        {children}
      </a>
    );
  }
  return (
    <Link className={classes} href={href} {...anchorProps}>
      {children}
    </Link>
  );
}

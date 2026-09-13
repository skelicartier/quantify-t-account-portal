import { z } from "zod";

/**
 * What the console accepts for a portfolio, and what it refuses.
 *
 * The service validates all of this again — it has to, since the desktop and anything else
 * holding a token reach the same routes. This layer exists so a person filling in a form
 * gets told which field is wrong while they are still looking at it, instead of a single
 * "malformed request" after a round trip.
 *
 * Every schema is `.strict()`: a field the form starts sending that this does not know
 * about is a mistake to surface, not one to forward.
 */

/** Matches `portfolio_routes.MAX_NAME_LENGTH`, and the column behind it. */
export const MAX_NAME_LENGTH = 80;

/**
 * A cash figure, parsed from a text input.
 *
 * `Number("")` is 0 and `Number(" ")` is 0, so an empty box would silently become a zero
 * opening balance rather than "not stated". Both are treated as absent instead, and the
 * service applies its own default.
 */
const money = z
  .string()
  .trim()
  .transform((raw) => raw.replace(/,/gu, ""))
  .refine((raw) => raw === "" || Number.isFinite(Number(raw)), "Enter an amount, or leave blank")
  .refine((raw) => raw === "" || Number(raw) >= 0, "An opening balance cannot be negative")
  .refine((raw) => raw === "" || Number(raw) <= 1e12, "That is larger than we can record")
  .transform((raw) => (raw === "" ? undefined : Number(raw)));

const name = z
  .string()
  .trim()
  // Collapsed, not just trimmed: "Growth  Fund" and "Growth Fund" are the same book to a
  // person, so they must be the same book to the uniqueness check.
  .transform((raw) => raw.split(/\s+/u).filter(Boolean).join(" "))
  .pipe(
    z
      .string()
      .min(1, "Give the portfolio a name")
      .max(MAX_NAME_LENGTH, `Use ${MAX_NAME_LENGTH} characters or fewer`),
  );

const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/u, "Use a three-letter currency code, like USD");

const symbol = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, "Name a benchmark, like SPY")
  .max(20, "Use 20 characters or fewer");

export const createPortfolioSchema = z
  .object({
    name,
    baseCurrency: currency,
    benchmarkSymbol: symbol,
    startingCash: money,
    isPaper: z.boolean(),
  })
  .strict();

export const renamePortfolioSchema = z
  .object({
    portfolioId: z.string().min(1).max(64),
    name,
    benchmarkSymbol: symbol,
  })
  .strict();

export const portfolioIdSchema = z.object({ portfolioId: z.string().min(1).max(64) }).strict();

/** A delete asks for the portfolio's own name back, so it cannot be a mis-click. */
export const deletePortfolioSchema = z
  .object({
    portfolioId: z.string().min(1).max(64),
    portfolioName: z.string().min(1).max(MAX_NAME_LENGTH),
    confirmName: z.string().max(MAX_NAME_LENGTH),
  })
  .strict()
  .refine((value) => value.confirmName.trim() === value.portfolioName, {
    path: ["confirmName"],
    message: "Type the portfolio's name exactly to close it",
  });

export type PortfolioFieldErrors = {
  name: string[];
  baseCurrency: string[];
  benchmarkSymbol: string[];
  startingCash: string[];
  confirmName: string[];
};

export const EMPTY_PORTFOLIO_FIELD_ERRORS: PortfolioFieldErrors = {
  name: [],
  baseCurrency: [],
  benchmarkSymbol: [],
  startingCash: [],
  confirmName: [],
};

export type PortfolioActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors: PortfolioFieldErrors;
};

export const INITIAL_PORTFOLIO_ACTION_STATE: PortfolioActionState = {
  status: "idle",
  message: "",
  fieldErrors: EMPTY_PORTFOLIO_FIELD_ERRORS,
};

/** Collect a zod failure into the per-field shape the form renders. */
export function portfolioFieldErrors(error: z.ZodError): PortfolioFieldErrors {
  const collected: PortfolioFieldErrors = {
    name: [],
    baseCurrency: [],
    benchmarkSymbol: [],
    startingCash: [],
    confirmName: [],
  };
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (field in collected) {
      collected[field as keyof PortfolioFieldErrors].push(issue.message);
    }
  }
  return collected;
}

/**
 * How a portfolio's money reads, in its own currency.
 *
 * Formatted here rather than in the component so the server and the browser agree: a
 * `toLocaleString` called during render picks up whatever locale the runtime has, which is
 * how a figure changes between the server-rendered HTML and the hydrated page.
 */
export function formatMoney(value: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // An unknown code is not worth failing a page over; show the number and the code.
    return `${value.toFixed(2)} ${currencyCode}`;
  }
}

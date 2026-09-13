"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  AccountApiRequestError,
  createAccountApiPortfolio,
  deleteAccountApiPortfolio,
  updateAccountApiPortfolio,
} from "@/lib/admin/account-api";
import {
  createPortfolioSchema,
  deletePortfolioSchema,
  portfolioFieldErrors,
  portfolioIdSchema,
  renamePortfolioSchema,
  EMPTY_PORTFOLIO_FIELD_ERRORS,
  type PortfolioActionState,
} from "@/lib/account/portfolio-input";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/supabase/server";

/**
 * Opening, renaming, re-defaulting and closing a portfolio.
 *
 * These are lower-consequence than the broker actions beside them — a portfolio holds no
 * credential and none of this can place an order — so they are same-origin gated but not
 * AAL2 gated. Asking for an authenticator code to rename a book would train people to
 * produce one for something that does not warrant it, which is how the prompt stops being a
 * signal on the writes that do.
 *
 * Every refusal the service makes is surfaced verbatim. They are the interesting ones here
 * ("still holds positions or history", "an account keeps at least one portfolio") and they
 * carry numbers this layer does not have.
 */

const failure = (
  message: string,
  fieldErrors = EMPTY_PORTFOLIO_FIELD_ERRORS,
): PortfolioActionState => ({
  status: "error",
  message,
  fieldErrors,
});

const ok = (message: string): PortfolioActionState => ({
  status: "success",
  message,
  fieldErrors: EMPTY_PORTFOLIO_FIELD_ERRORS,
});

/** The gate, in one place so a fifth action cannot be written without it. */
async function authorize(): Promise<{ accessToken: string } | PortfolioActionState> {
  await requireSameOriginServerAction();
  const azure = await createServerAzureClient();
  const accessToken = azure.getAccessToken();
  if (!accessToken) return failure("Sign in again to manage your portfolios.");
  return { accessToken };
}

function describe(error: unknown, fallback: string): string {
  if (error instanceof AccountApiRequestError) {
    // The service's own refusals are the useful ones, and they are server-authored: they
    // name how many positions a book still holds, or that this is the last one.
    if (error.status === 400 || error.status === 403 || error.status === 404) {
      return error.message;
    }
    if (error.status === 429) return "Too many changes at once. Try again shortly.";
  }
  return fallback;
}

export async function createPortfolio(
  _previous: PortfolioActionState,
  formData: FormData,
): Promise<PortfolioActionState> {
  const text = (name: string) => String(formData.get(name) ?? "");
  const parsed = createPortfolioSchema.safeParse({
    name: text("name"),
    baseCurrency: text("baseCurrency") || "USD",
    benchmarkSymbol: text("benchmarkSymbol") || "SPY",
    startingCash: text("startingCash"),
    // Absent means paper, so a form that fails to send the field cannot open a real-money
    // book by omission.
    isPaper: formData.get("isPaper") !== "false",
  });
  if (!parsed.success) {
    return failure("Check the portfolio details.", portfolioFieldErrors(parsed.error));
  }

  try {
    const gate = await authorize();
    if ("status" in gate) return gate;

    await createAccountApiPortfolio(
      gate.accessToken,
      {
        name: parsed.data.name,
        base_currency: parsed.data.baseCurrency,
        benchmark_symbol: parsed.data.benchmarkSymbol,
        ...(parsed.data.startingCash === undefined
          ? {}
          : { starting_cash: parsed.data.startingCash }),
        is_paper: parsed.data.isPaper,
      },
      { idempotencyKey: `portal-${randomUUID()}` },
    );
    revalidatePath("/account/portfolios");
    return ok(`${parsed.data.name} is open.`);
  } catch (error) {
    return failure(describe(error, "That portfolio could not be opened."));
  }
}

export async function renamePortfolio(
  _previous: PortfolioActionState,
  formData: FormData,
): Promise<PortfolioActionState> {
  const parsed = renamePortfolioSchema.safeParse({
    portfolioId: String(formData.get("portfolioId") ?? ""),
    name: String(formData.get("name") ?? ""),
    benchmarkSymbol: String(formData.get("benchmarkSymbol") ?? "") || "SPY",
  });
  if (!parsed.success) {
    return failure("Check the portfolio details.", portfolioFieldErrors(parsed.error));
  }

  try {
    const gate = await authorize();
    if ("status" in gate) return gate;

    await updateAccountApiPortfolio(
      gate.accessToken,
      parsed.data.portfolioId,
      { name: parsed.data.name, benchmark_symbol: parsed.data.benchmarkSymbol },
      { idempotencyKey: `portal-${randomUUID()}` },
    );
    revalidatePath("/account/portfolios");
    return ok(`Saved. This portfolio is now ${parsed.data.name}.`);
  } catch (error) {
    return failure(describe(error, "That portfolio could not be saved."));
  }
}

export async function makePortfolioDefault(
  _previous: PortfolioActionState,
  formData: FormData,
): Promise<PortfolioActionState> {
  const parsed = portfolioIdSchema.safeParse({
    portfolioId: String(formData.get("portfolioId") ?? ""),
  });
  if (!parsed.success) return failure("Choose a portfolio.");

  try {
    const gate = await authorize();
    if ("status" in gate) return gate;

    // Only the flag is sent. The service clears the previous default in the same
    // transaction, which is why this does not also have to unset the other one — and why it
    // must not try to, since two writes could leave the account with none.
    await updateAccountApiPortfolio(
      gate.accessToken,
      parsed.data.portfolioId,
      { is_default: true },
      { idempotencyKey: `portal-${randomUUID()}` },
    );
    revalidatePath("/account/portfolios");
    return ok("New trades will go here unless you pick another portfolio.");
  } catch (error) {
    return failure(describe(error, "That portfolio could not be made the default."));
  }
}

export async function closePortfolio(
  _previous: PortfolioActionState,
  formData: FormData,
): Promise<PortfolioActionState> {
  const parsed = deletePortfolioSchema.safeParse({
    portfolioId: String(formData.get("portfolioId") ?? ""),
    portfolioName: String(formData.get("portfolioName") ?? ""),
    confirmName: String(formData.get("confirmName") ?? ""),
  });
  if (!parsed.success) {
    return failure(
      "Type the portfolio's name exactly to close it.",
      portfolioFieldErrors(parsed.error),
    );
  }

  try {
    const gate = await authorize();
    if ("status" in gate) return gate;

    await deleteAccountApiPortfolio(gate.accessToken, parsed.data.portfolioId, {
      idempotencyKey: `portal-${randomUUID()}`,
    });
    revalidatePath("/account/portfolios");
    return ok(`${parsed.data.portfolioName} is closed.`);
  } catch (error) {
    return failure(describe(error, "That portfolio could not be closed."));
  }
}

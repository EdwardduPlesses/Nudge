"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import {
  DISPLAY_CURRENCY_CODES,
  DISPLAY_LABELS,
  type DisplayCurrency,
  isDisplayCurrency,
} from "@/lib/currency-config";
import { formatMoney } from "@/lib/format-money";
import { nudgeBudgetFetchInit, useNudgeBudget } from "@/context/nudge-budget-context";

type CurrencyContextValue = {
  currencyCode: DisplayCurrency;
  /** Format an amount already stored in the workbook currency. */
  formatAmount: (amount: number) => string;
  /** Parse user input into a plain number in the workbook currency (no conversion). */
  parseAmount: (text: string | number) => number;
  /** Change the workbook currency (server converts all amounts, then we reload). */
  changeCurrency: (code: DisplayCurrency) => Promise<void>;
};

const CurrencyCtx = createContext<CurrencyContextValue | null>(null);

export function CurrencyPreferenceProvider(props: {
  experienceId: string;
  userId: string;
  children: ReactNode;
}) {
  const { state, whopUserToken } = useNudgeBudget();
  const currencyCode: DisplayCurrency = isDisplayCurrency(state.baseCurrency)
    ? state.baseCurrency
    : "USD";

  const formatAmount = useCallback((amount: number) => formatMoney(amount, currencyCode), [currencyCode]);

  const parseAmount = useCallback((text: string | number) => {
    if (typeof text === "number") return Number.isFinite(text) ? text : 0;
    const n = Number(String(text).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }, []);

  // Guard against re-entrant currency changes (double-tap / rapid re-select) firing a
  // second conversion before the first completes and the page reloads.
  const changing = useRef(false);
  const changeCurrency = useCallback(
    async (code: DisplayCurrency) => {
      if (code === currencyCode || changing.current) return;
      changing.current = true;
      try {
        const res = await fetch(
          "/api/workbook",
          nudgeBudgetFetchInit(whopUserToken, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ baseCurrency: code }),
          }),
        );
        if (res.ok) {
          window.location.reload();
          return; // keep the guard latched through the reload
        }
        console.error("[Nudge] currency change failed", res.status);
      } catch (err) {
        console.error("[Nudge] currency change failed", err);
      }
      changing.current = false;
    },
    [currencyCode, whopUserToken],
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({ currencyCode, formatAmount, parseAmount, changeCurrency }),
    [currencyCode, formatAmount, parseAmount, changeCurrency],
  );

  return <CurrencyCtx.Provider value={value}>{props.children}</CurrencyCtx.Provider>;
}

export function useCurrency() {
  const v = useContext(CurrencyCtx);
  if (!v) throw new Error("useCurrency must be used within CurrencyPreferenceProvider");
  return v;
}

export function displayCurrencyItems(): { code: DisplayCurrency; label: string }[] {
  return DISPLAY_CURRENCY_CODES.map((code) => ({ code, label: DISPLAY_LABELS[code] }));
}

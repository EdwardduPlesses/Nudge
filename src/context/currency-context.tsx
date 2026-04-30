"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DISPLAY_CURRENCY_CODES,
  DISPLAY_LABELS,
  type DisplayCurrency,
  type UsdRatesToTargets,
  isDisplayCurrency,
  isFxComplete,
} from "@/lib/currency-config";
import { formatUsdAsDisplay } from "@/lib/format-money";

const PREF_SUFFIX = ":v1";

type ApiFxResponse = {
  base: "USD";
  rates: UsdRatesToTargets;
  stale?: boolean;
};

type CurrencyContextValue = {
  currency: DisplayCurrency;
  setCurrency: (c: DisplayCurrency) => void;
  rates: UsdRatesToTargets | null;
  rateLoading: boolean;
  rateError: boolean;
  /** Effective multiplier: 1 for USD; else USD → selected rate. */
  rateForCurrency: () => number;
  formatFromUsd: (usdAmount: number) => string;
  /** Whole JPY rounding for display/input. */
  usdAsDisplayAmount: (usdAmount: number) => number;
  displayAmountAsUsd: (displayAmount: number) => number;
  amountApproxLabel: string;
  canonicalHint: string;
};

const CurrencyCtx = createContext<CurrencyContextValue | null>(null);

export function prefStorageKey(experienceId: string, userId: string): string {
  return `nudge:currencyPreference${PREF_SUFFIX}:${experienceId}:${userId}`;
}

function ratesCacheKey(experienceId: string, userId: string): string {
  return `nudge:fxRates${PREF_SUFFIX}:${experienceId}:${userId}`;
}

function loadStoredCurrency(key: string): DisplayCurrency {
  if (typeof window === "undefined") return "USD";
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return "USD";
    const parsed = JSON.parse(raw) as { currency?: unknown };
    if (isDisplayCurrency(parsed.currency)) return parsed.currency;
  } catch {
    /* ignore */
  }
  return "USD";
}

function loadStoredRates(key: string): UsdRatesToTargets | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { rates?: unknown };
    if (parsed.rates && isFxComplete(parsed.rates)) return parsed.rates;
  } catch {
    /* ignore */
  }
  return null;
}

function persistCurrency(key: string, c: DisplayCurrency) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify({ currency: c }));
}

function persistRates(key: string, rates: UsdRatesToTargets) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify({ rates, at: Date.now() }));
}

export function CurrencyPreferenceProvider(props: {
  experienceId: string;
  userId: string;
  children: ReactNode;
}) {
  const prefKey = useMemo(
    () => prefStorageKey(props.experienceId, props.userId),
    [props.experienceId, props.userId],
  );
  const fxKey = useMemo(
    () => ratesCacheKey(props.experienceId, props.userId),
    [props.experienceId, props.userId],
  );

  const [currency, setCurrencyState] = useState<DisplayCurrency>("USD");
  const [hydrated, setHydrated] = useState(false);
  const [rates, setRates] = useState<UsdRatesToTargets | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const c = loadStoredCurrency(prefKey);
      const cachedRates = loadStoredRates(fxKey);
      setCurrencyState(c);
      if (cachedRates) setRates(cachedRates);
      setHydrated(true);
    });
  }, [prefKey, fxKey]);

  useEffect(() => {
    if (!hydrated) return;
    persistCurrency(prefKey, currency);
  }, [hydrated, prefKey, currency]);

  const refreshRates = useCallback(async () => {
    try {
      setRateLoading(true);
      setRateError(false);
      const res = await fetch("/api/exchange-rate", { cache: "no-store" });
      const json = (await res.json()) as ApiFxResponse;
      setRates(json.rates);
      persistRates(fxKey, json.rates);
      if (!res.ok) setRateError(true);
    } catch {
      setRateError(true);
      const cached = loadStoredRates(fxKey);
      if (cached) setRates(cached);
    } finally {
      setRateLoading(false);
    }
  }, [fxKey]);

  useEffect(() => {
    if (!hydrated || currency === "USD") return;
    if (rates) return;
    void refreshRates();
  }, [currency, hydrated, rates, refreshRates]);

  const setCurrency = useCallback((c: DisplayCurrency) => {
    setCurrencyState(c);
    if (c !== "USD") {
      queueMicrotask(() => {
        void refreshRates();
      });
    }
  }, [refreshRates]);

  const rateForCurrency = useCallback(() => {
    if (currency === "USD") return 1;
    if (!rates) return NaN;
    return rates[currency];
  }, [currency, rates]);

  const formatFromUsd = useCallback(
    (usdAmount: number) => {
      if (!Number.isFinite(usdAmount)) return "—";
      if (currency === "USD") return formatUsdAsDisplay(usdAmount, "USD", 1);
      const r = rateForCurrency();
      if (!Number.isFinite(r) || rateLoading || r <= 0) return "…";
      return formatUsdAsDisplay(usdAmount, currency, r);
    },
    [currency, rateForCurrency, rateLoading],
  );

  const usdAsDisplayAmount = useCallback(
    (usdAmount: number): number => {
      if (!Number.isFinite(usdAmount)) return 0;
      if (currency === "USD") return usdAmount;
      const r = rateForCurrency();
      if (!Number.isFinite(r) || r <= 0) return usdAmount;
      const raw = usdAmount * r;
      if (currency === "JPY") return Math.round(raw);
      return Math.round(raw * 100) / 100;
    },
    [currency, rateForCurrency],
  );

  const displayAmountAsUsd = useCallback(
    (displayAmount: number): number => {
      if (!Number.isFinite(displayAmount)) return 0;
      if (currency === "USD") return displayAmount;
      const r = rateForCurrency();
      if (!Number.isFinite(r) || r <= 0) return displayAmount;
      if (currency === "JPY") {
        const yen = Math.round(displayAmount);
        return Math.round((yen / r) * 1e8) / 1e8;
      }
      return displayAmount / r;
    },
    [currency, rateForCurrency],
  );

  const amountApproxLabel = useMemo(() => {
    if (currency === "USD") return "(USD)";
    return `(approx. ${currency})`;
  }, [currency]);

  const canonicalHint = useMemo(
    () => "Amounts stay stored as USD equivalents; FX is display-only.",
    [],
  );

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      setCurrency,
      rates,
      rateLoading,
      rateError,
      rateForCurrency,
      formatFromUsd,
      usdAsDisplayAmount,
      displayAmountAsUsd,
      amountApproxLabel,
      canonicalHint,
    }),
    [
      currency,
      setCurrency,
      rates,
      rateLoading,
      rateError,
      rateForCurrency,
      formatFromUsd,
      usdAsDisplayAmount,
      displayAmountAsUsd,
      amountApproxLabel,
      canonicalHint,
    ],
  );

  return <CurrencyCtx.Provider value={value}>{props.children}</CurrencyCtx.Provider>;
}

export function useCurrency() {
  const v = useContext(CurrencyCtx);
  if (!v) throw new Error("useCurrency must be used within CurrencyPreferenceProvider");
  return v;
}

export function displayCurrencyItems(): {
  code: DisplayCurrency;
  label: string;
}[] {
  return DISPLAY_CURRENCY_CODES.map((code) => ({
    code,
    label: DISPLAY_LABELS[code],
  }));
}

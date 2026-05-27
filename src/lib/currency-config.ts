/** Display currencies besides USD — canonical stored amounts stay USD-equivalent; these are FX display targets only. */

export type DisplayCurrency = "USD" | "ZAR" | "EUR" | "GBP" | "JPY";

export const DISPLAY_CURRENCY_CODES: DisplayCurrency[] = ["USD", "ZAR", "EUR", "GBP", "JPY"];

/** Frankfurter: `USD` × rate = one unit of target (e.g. how many ZAR per 1 USD). */
export const FX_TARGETS = ["ZAR", "EUR", "GBP", "JPY"] as const;
export type FxTargetCode = (typeof FX_TARGETS)[number];

export type UsdRatesToTargets = Record<FxTargetCode, number>;

/** Approximate fallbacks when the live API fails (rates = USD → target multiplier). */
export const FALLBACK_USD_RATES: UsdRatesToTargets = {
  ZAR: 18.6,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 152,
};

export function isDisplayCurrency(v: unknown): v is DisplayCurrency {
  return typeof v === "string" && DISPLAY_CURRENCY_CODES.includes(v as DisplayCurrency);
}

export function isFxComplete(r: Partial<UsdRatesToTargets> | undefined): r is UsdRatesToTargets {
  if (!r) return false;
  return FX_TARGETS.every((k) => typeof r[k] === "number" && Number.isFinite(r[k]) && r[k]! > 0);
}

export const DISPLAY_LABELS: Record<DisplayCurrency, string> = {
  USD: "USD — US dollar",
  ZAR: "ZAR — South African rand",
  EUR: "EUR — Euro",
  GBP: "GBP — British pound",
  JPY: "JPY — Japanese yen",
};

/** Stable `Intl.NumberFormat` options per ISO code — avoids hydration surprises from locale `undefined`. */
export function intlCurrencyOptions(code: DisplayCurrency): Intl.NumberFormatOptions {
  if (code === "JPY") {
    return { style: "currency", currency: "JPY", minimumFractionDigits: 0, maximumFractionDigits: 0 };
  }
  return {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };
}

/** Locales paired with currencies for predictable symbols/grouping across environments. */
export function localeForCurrency(code: DisplayCurrency): string {
  switch (code) {
    case "USD":
      return "en-US";
    case "ZAR":
      return "en-ZA";
    case "EUR":
      return "en-IE";
    case "GBP":
      return "en-GB";
    case "JPY":
      return "ja-JP";
    default:
      return "en-US";
  }
}

/** Conversion multiplier from one display currency to another, via USD pivot. */
export function crossRate(
  from: DisplayCurrency,
  to: DisplayCurrency,
  usdRates: UsdRatesToTargets,
): number {
  if (from === to) return 1;
  const usdFrom = from === "USD" ? 1 : usdRates[from as FxTargetCode];
  const usdTo = to === "USD" ? 1 : usdRates[to as FxTargetCode];
  if (!Number.isFinite(usdFrom) || !Number.isFinite(usdTo) || usdFrom <= 0 || usdTo <= 0) {
    return NaN;
  }
  return usdTo / usdFrom;
}

/** Fraction digits for storage rounding (JPY is whole-number). */
export function decimalsFor(code: DisplayCurrency): number {
  return code === "JPY" ? 0 : 2;
}

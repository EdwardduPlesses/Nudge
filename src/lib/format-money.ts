import type { DisplayCurrency } from "@/lib/currency-config";
import { intlCurrencyOptions, localeForCurrency } from "@/lib/currency-config";

/** Chart ticks / tooltips: keep deterministic USD labeling (SSR-safe). */
export function formatUsdNumber(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Thin bar axis prefix (whole dollars); chart data domain stays USD. */
export function formatUsdAxisTick(amount: number): string {
  return `$${Math.round(amount)}`;
}

/**
 * Y-axis ticks: `amountUsd` is the chart domain value; label uses display currency + FX rate.
 */
export function formatUsdAsDisplayAxisTick(
  amountUsd: number,
  display: DisplayCurrency,
  rate: number,
): string {
  if (display === "USD") return formatUsdAxisTick(amountUsd);
  if (!Number.isFinite(amountUsd)) return "";
  if (!Number.isFinite(rate) || rate <= 0) return "\u2026";

  const raw = Math.abs(amountUsd) * rate;
  const value = display === "JPY" ? Math.round(raw) : Math.round(raw);

  try {
    return new Intl.NumberFormat(localeForCurrency(display), {
      style: "currency",
      currency: display,
      notation: "compact",
      compactDisplay: "short",
      minimumFractionDigits: 0,
      maximumFractionDigits: display === "JPY" ? 0 : 1,
    }).format(value);
  } catch {
    return `${value}`;
  }
}

/** Format `amountUsd` converted to display currency using `usdToDisplayMultiplier`. */
export function formatUsdAsDisplay(amountUsd: number, display: DisplayCurrency, rate: number): string {
  if (display === "USD") return formatUsdNumber(amountUsd);
  const raw = amountUsd * rate;
  const value =
    display === "JPY" ? Math.round(raw) : Math.round(raw * 100) / 100;
  return new Intl.NumberFormat(localeForCurrency(display), intlCurrencyOptions(display)).format(
    value,
  );
}

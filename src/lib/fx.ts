import {
  FALLBACK_USD_RATES,
  FX_TARGETS,
  isFxComplete,
  type UsdRatesToTargets,
} from "@/lib/currency-config";

type FrankfurterLatest = {
  rates?: Partial<UsdRatesToTargets>;
};

/**
 * Fetch USD→{ZAR,EUR,GBP,JPY} multipliers from Frankfurter.
 * Falls back to FALLBACK_USD_RATES on any failure; sets stale=true when doing so.
 * Cache: Next.js ISR revalidate every 3600 s (matches the exchange-rate route's original behavior).
 */
export async function getUsdRatesToTargets(): Promise<{
  rates: UsdRatesToTargets;
  stale: boolean;
}> {
  const symbols = FX_TARGETS.join(",");
  const url = `https://api.frankfurter.app/latest?from=USD&to=${symbols}`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return { rates: { ...FALLBACK_USD_RATES }, stale: true };

    const json = (await res.json()) as FrankfurterLatest;
    if (json.rates && isFxComplete(json.rates)) {
      return { rates: json.rates, stale: false };
    }
    return { rates: { ...FALLBACK_USD_RATES }, stale: true };
  } catch {
    return { rates: { ...FALLBACK_USD_RATES }, stale: true };
  }
}

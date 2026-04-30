import { NextResponse } from "next/server";
import {
  FALLBACK_USD_RATES,
  type UsdRatesToTargets,
  FX_TARGETS,
  isFxComplete,
} from "@/lib/currency-config";

const FRANKFURTER_URL =
  "https://api.frankfurter.app/latest?from=USD&to=ZAR,EUR,GBP,JPY";

type FrankfurterLatest = {
  rates?: Partial<UsdRatesToTargets>;
};

function pickRates(parsed: FrankfurterLatest): UsdRatesToTargets | null {
  const r = parsed.rates;
  if (!isFxComplete(r)) return null;
  return r;
}

export async function GET() {
  let stale = false;
  let rates: UsdRatesToTargets = { ...FALLBACK_USD_RATES };

  try {
    const res = await fetch(FRANKFURTER_URL, { next: { revalidate: 3600 } });
    if (!res.ok) stale = true;
    else {
      const json = (await res.json()) as FrankfurterLatest;
      const picked = pickRates(json);
      if (picked) {
        rates = picked;
      } else {
        stale = true;
      }
    }
  } catch {
    stale = true;
  }

  if (stale) {
    rates = { ...FALLBACK_USD_RATES };
  }

  const body = {
    base: "USD" as const,
    rates,
    stale,
    targets: [...FX_TARGETS],
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=7200",
    },
  });
}

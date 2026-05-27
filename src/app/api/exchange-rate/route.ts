import { NextResponse } from "next/server";
import { FX_TARGETS } from "@/lib/currency-config";
import { getUsdRatesToTargets } from "@/lib/fx";

export async function GET() {
  const { rates, stale } = await getUsdRatesToTargets();

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

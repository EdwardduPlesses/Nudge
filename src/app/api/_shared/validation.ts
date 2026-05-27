import { NextResponse } from "next/server";

/**
 * Parse a JSON request body, returning a 400 response on malformed/empty input
 * instead of throwing an unhandled SyntaxError (which surfaces as an opaque 500).
 *
 * Usage:
 *   const parsed = await readJson(req);
 *   if (parsed.error) return parsed.error;
 *   const body = parsed.body;
 */
export async function readJson(
  req: Request,
): Promise<{ body: Record<string, unknown>; error?: undefined } | { body?: undefined; error: NextResponse }> {
  try {
    const data = await req.json();
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return { error: NextResponse.json({ error: "Invalid request body" }, { status: 400 }) };
    }
    return { body: data as Record<string, unknown> };
  } catch {
    return { error: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) };
  }
}

/** Coerce to a finite number, falling back when the input is NaN/Infinity/garbage. */
export function finiteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Finite number clamped to >= 0 (for money / amounts that can't be negative). */
export function nonNegativeNumber(value: unknown, fallback = 0): number {
  return Math.max(0, finiteNumber(value, fallback));
}

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

/**
 * Extract a valid `YYYY-MM-DD` calendar-day key from a stored/incoming date value.
 * Accepts plain dates and ISO datetimes (e.g. `2026-05-30T12:00:00.000Z`). Returns
 * null for garbage or impossible dates (e.g. `2026-02-31`), so callers can fall back.
 */
export function dateKeyOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (
    dt.getUTCFullYear() !== Number(y) ||
    dt.getUTCMonth() !== Number(mo) - 1 ||
    dt.getUTCDate() !== Number(d)
  ) {
    return null; // overflowed (impossible calendar date)
  }
  return `${y}-${mo}-${d}`;
}

/** Trim/coerce to a string and cap its length (prevents unbounded stored strings). */
export function boundedString(value: unknown, maxLen: number, fallback = ""): string {
  const s = value == null ? fallback : String(value);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

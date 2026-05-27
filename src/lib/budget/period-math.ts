/** Pure date helpers for anchor-day budget periods. Dates are ISO `YYYY-MM-DD` strings. */

export function clampAnchorDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(31, Math.max(1, Math.trunc(day)));
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function iso(year: number, month0: number, day: number): string {
  const d = Math.min(day, daysInMonth(year, month0));
  const mm = String(month0 + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function addDaysIso(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** The period (start..end inclusive) that contains `dateIso`, given an anchor day. */
export function periodRangeFor(dateIso: string, anchorDay: number): { start: string; end: string } {
  const anchor = clampAnchorDay(anchorDay);
  const [y, m, d] = dateIso.split("-").map(Number);
  const month0 = m - 1;
  const startThisMonth = iso(y, month0, anchor);
  let start: string;
  if (d >= Number(startThisMonth.split("-")[2])) {
    start = startThisMonth;
  } else {
    const prevMonth0 = month0 - 1;
    const py = prevMonth0 < 0 ? y - 1 : y;
    const pm0 = (prevMonth0 + 12) % 12;
    start = iso(py, pm0, anchor);
  }
  const nextStart = nextPeriodStart(start, anchor);
  return { start, end: addDaysIso(nextStart, -1) };
}

/** Start date of the cycle after the one beginning at `startIso`. */
export function nextPeriodStart(startIso: string, anchorDay: number): string {
  const anchor = clampAnchorDay(anchorDay);
  const [y, m] = startIso.split("-").map(Number);
  const month0 = m - 1;
  const nextMonth0 = month0 + 1;
  const ny = nextMonth0 > 11 ? y + 1 : y;
  const nm0 = nextMonth0 % 12;
  return iso(ny, nm0, anchor);
}

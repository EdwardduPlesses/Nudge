import { expect, test } from "vitest";
import {
  FIRES_AT_END,
  timingFromDayOfPeriod,
  dayOfPeriodForTiming,
  recurringRowsFor,
  type RecurringItem,
} from "./recurring";

const item = (over: Partial<RecurringItem>): RecurringItem => ({
  id: "r1",
  type: "expense",
  amount: 100,
  categoryId: null,
  goalId: null,
  note: "",
  timing: "start",
  ownerUserId: "u1",
  active: true,
  ...over,
});

const period = { id: "p1", startDate: "2026-05-01", endDate: "2026-05-31" };

test("timingFromDayOfPeriod: null + legacy 1-28 are start; sentinel/>=29 is end", () => {
  expect(timingFromDayOfPeriod(null)).toBe("start");
  expect(timingFromDayOfPeriod(1)).toBe("start");
  expect(timingFromDayOfPeriod(28)).toBe("start");
  expect(timingFromDayOfPeriod(29)).toBe("end");
  expect(timingFromDayOfPeriod(FIRES_AT_END)).toBe("end");
});

test("dayOfPeriodForTiming: end -> sentinel; start/undefined -> null", () => {
  expect(dayOfPeriodForTiming("end")).toBe(FIRES_AT_END);
  expect(dayOfPeriodForTiming("start")).toBe(null);
  expect(dayOfPeriodForTiming(undefined)).toBe(null);
});

test("recurringRowsFor: start fires on period start, end on period end, id is stable", () => {
  const rows = recurringRowsFor(
    "wb1",
    [item({ id: "a", timing: "start" }), item({ id: "b", timing: "end" })],
    period,
  );
  expect(rows[0]).toMatchObject({
    id: "rec_a_2026-05-01",
    workbook_id: "wb1",
    period_id: "p1",
    date: "2026-05-01",
  });
  expect(rows[1]).toMatchObject({ id: "rec_b_2026-05-01", date: "2026-05-31" });
});

test("recurringRowsFor: blank note falls back to 'Recurring'", () => {
  const rows = recurringRowsFor("wb1", [item({ note: "" })], period);
  expect(rows[0].note).toBe("Recurring");
});

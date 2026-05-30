import { expect, test } from "vitest";
import { periodRangeFor, clampAnchorDay, nextPeriodStart, planPeriodsToCreate } from "./period-math";

test("anchor day 1 yields calendar month", () => {
  expect(periodRangeFor("2026-05-15", 1)).toEqual({ start: "2026-05-01", end: "2026-05-31" });
});

test("anchor day 25 spans month boundary", () => {
  expect(periodRangeFor("2026-05-26", 25)).toEqual({ start: "2026-05-25", end: "2026-06-24" });
  expect(periodRangeFor("2026-05-10", 25)).toEqual({ start: "2026-04-25", end: "2026-05-24" });
});

test("anchor day 31 clamps to short months", () => {
  expect(periodRangeFor("2026-02-15", 31)).toEqual({ start: "2026-01-31", end: "2026-02-27" });
});

test("clampAnchorDay bounds 1..31", () => {
  expect(clampAnchorDay(0)).toBe(1);
  expect(clampAnchorDay(40)).toBe(31);
  expect(clampAnchorDay(25)).toBe(25);
});

test("nextPeriodStart advances one cycle", () => {
  expect(nextPeriodStart("2026-05-25", 25)).toBe("2026-06-25");
});

test("planPeriodsToCreate: creates just today's period when none exist", () => {
  expect(planPeriodsToCreate([], 25, "2026-05-30")).toEqual(["2026-05-25"]);
});

test("planPeriodsToCreate: returns [] when today's period already exists", () => {
  expect(planPeriodsToCreate(["2026-05-25"], 25, "2026-05-30")).toEqual([]);
});

test("planPeriodsToCreate: fills the gap forward on the same anchor grid (no overshoot)", () => {
  expect(planPeriodsToCreate(["2026-02-25"], 25, "2026-05-30")).toEqual([
    "2026-03-25",
    "2026-04-25",
    "2026-05-25",
  ]);
});

test("planPeriodsToCreate: does NOT overshoot when the anchor day changes (the 2097 bug)", () => {
  // Old grid started on the 1st; user switches the anchor to 25; today is 2026-05-30.
  expect(planPeriodsToCreate(["2026-04-01", "2026-05-01"], 25, "2026-05-30")).toEqual([
    "2026-05-25",
  ]);
});

test("planPeriodsToCreate: creates only today's period when the latest start is after target", () => {
  // Anchor moved earlier: existing periods now sit after the new target start.
  expect(planPeriodsToCreate(["2026-04-25", "2026-05-25"], 1, "2026-05-30")).toEqual([
    "2026-05-01",
  ]);
});

test("planPeriodsToCreate: is bounded and ends at today's period", () => {
  const plan = planPeriodsToCreate(["1990-01-01"], 1, "2026-05-30");
  expect(plan.length).toBeLessThanOrEqual(241);
  expect(plan[plan.length - 1]).toBe("2026-05-01");
});

test("planPeriodsToCreate: anchor 31 clamps and still terminates at today's period", () => {
  const plan = planPeriodsToCreate(["2026-01-31"], 31, "2026-04-15");
  expect(plan[plan.length - 1]).toBe(periodRangeFor("2026-04-15", 31).start);
  // No created start may be after today's period start.
  const target = periodRangeFor("2026-04-15", 31).start;
  expect(plan.every((s) => s <= target)).toBe(true);
});

import { expect, test } from "vitest";
import { periodRangeFor, clampAnchorDay, nextPeriodStart } from "./period-math";

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

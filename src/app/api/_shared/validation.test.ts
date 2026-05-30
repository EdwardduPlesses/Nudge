import { expect, test } from "vitest";
import { dateKeyOf, boundedString, nonNegativeNumber } from "./validation";

test("dateKeyOf accepts plain dates and ISO datetimes", () => {
  expect(dateKeyOf("2026-05-30")).toBe("2026-05-30");
  expect(dateKeyOf("2026-05-30T12:00:00.000Z")).toBe("2026-05-30");
});

test("dateKeyOf rejects garbage and impossible dates", () => {
  expect(dateKeyOf("banana")).toBeNull();
  expect(dateKeyOf("2026-13-01")).toBeNull(); // month 13
  expect(dateKeyOf("2026-02-31")).toBeNull(); // Feb 31 overflows
  expect(dateKeyOf("")).toBeNull();
  expect(dateKeyOf(12345)).toBeNull();
});

test("boundedString caps length", () => {
  expect(boundedString("abc", 10)).toBe("abc");
  expect(boundedString("a".repeat(50), 10)).toBe("a".repeat(10));
  expect(boundedString(undefined, 10, "x")).toBe("x");
});

test("nonNegativeNumber clamps NaN/Infinity/negatives", () => {
  expect(nonNegativeNumber("banana")).toBe(0);
  expect(nonNegativeNumber(-5)).toBe(0);
  expect(nonNegativeNumber(Infinity)).toBe(0);
  expect(nonNegativeNumber(12.5)).toBe(12.5);
});

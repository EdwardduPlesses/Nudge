import { expect, test } from "vitest";
import { crossRate, decimalsFor } from "./currency-config";

const usd = { ZAR: 18.6, EUR: 0.92, GBP: 0.79, JPY: 152 };

test("crossRate USD->ZAR is the ZAR usd-rate", () => {
  expect(crossRate("USD", "ZAR", usd)).toBeCloseTo(18.6, 6);
});

test("crossRate ZAR->USD is the inverse", () => {
  expect(crossRate("ZAR", "USD", usd)).toBeCloseTo(1 / 18.6, 6);
});

test("crossRate EUR->ZAR = usdZAR/usdEUR", () => {
  expect(crossRate("EUR", "ZAR", usd)).toBeCloseTo(18.6 / 0.92, 6);
});

test("crossRate same currency is 1", () => {
  expect(crossRate("ZAR", "ZAR", usd)).toBe(1);
});

test("decimalsFor: JPY 0, others 2", () => {
  expect(decimalsFor("JPY")).toBe(0);
  expect(decimalsFor("ZAR")).toBe(2);
  expect(decimalsFor("USD")).toBe(2);
});

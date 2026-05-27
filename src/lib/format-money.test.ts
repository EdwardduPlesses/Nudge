import { expect, test } from "vitest";
import { formatMoney } from "./format-money";

test("formats ZAR with R symbol and 2dp", () => {
  const s = formatMoney(100, "ZAR");
  expect(s).toMatch(/R/);
  expect(s).toMatch(/100[.,]00/);
});

test("formats JPY with no decimals (rounds)", () => {
  const s = formatMoney(1234.6, "JPY");
  expect(s).toMatch(/1,?235/);
  expect(s).not.toMatch(/\./);
});

test("non-finite renders em dash", () => {
  expect(formatMoney(NaN, "USD")).toBe("—");
});

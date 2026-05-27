import { expect, test } from "vitest";
import { debtRemaining, payoffOrder, projectDebtFreeMonths, type DebtInput } from "./debt";

const d = (over: Partial<DebtInput>): DebtInput => ({ id: "x", name: "D", balance: 1000, apr: 0, minPayment: 100, ...over });

test("debtRemaining subtracts linked payments from balance, floored at 0", () => {
  const txs = [
    { amount: 200, type: "expense", debtId: "x" },
    { amount: 50, type: "expense", debtId: "y" },
  ];
  expect(debtRemaining(d({ id: "x", balance: 1000 }), txs)).toBe(800);
  expect(debtRemaining(d({ id: "x", balance: 100 }), [{ amount: 250, type: "expense", debtId: "x" }])).toBe(0);
});

test("payoffOrder: snowball ascending remaining, avalanche descending apr", () => {
  const a = d({ id: "a", balance: 500, apr: 10 });
  const b = d({ id: "b", balance: 200, apr: 25 });
  expect(payoffOrder([a, b], [], "snowball").map((x) => x.id)).toEqual(["b", "a"]);
  expect(payoffOrder([a, b], [], "avalanche").map((x) => x.id)).toEqual(["b", "a"]);
});

test("projectDebtFreeMonths: 0% APR, 1000 at 100/mo = 10 months", () => {
  expect(projectDebtFreeMonths([d({ balance: 1000, apr: 0, minPayment: 100 })], [], "snowball")).toBe(10);
});

test("projectDebtFreeMonths returns null when min payments never cover interest", () => {
  expect(projectDebtFreeMonths([d({ balance: 1000, apr: 100, minPayment: 1 })], [], "avalanche")).toBeNull();
});

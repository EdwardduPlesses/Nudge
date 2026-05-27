export interface DebtInput {
  id: string;
  name: string;
  balance: number;
  apr: number; // annual %, e.g. 19.9
  minPayment: number;
}

type PaymentTx = { amount: number; type: string; debtId?: string | null };

/** Remaining balance = entered balance minus the sum of linked expense payments, floored at 0. */
export function debtRemaining(debt: DebtInput, transactions: PaymentTx[]): number {
  const paid = transactions
    .filter((t) => t.debtId === debt.id && t.type === "expense")
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  return Math.max(0, debt.balance - paid);
}

export type PayoffStrategy = "snowball" | "avalanche";

/** Order debts for payoff focus. snowball = smallest remaining first; avalanche = highest APR first. */
export function payoffOrder(
  debts: DebtInput[],
  transactions: PaymentTx[],
  strategy: PayoffStrategy,
): DebtInput[] {
  const withRemaining = debts.map((dbt) => ({ dbt, remaining: debtRemaining(dbt, transactions) }));
  withRemaining.sort((a, b) =>
    strategy === "snowball" ? a.remaining - b.remaining : b.dbt.apr - a.dbt.apr,
  );
  return withRemaining.map((x) => x.dbt);
}

/**
 * Simulate month-by-month payoff with the avalanche/snowball rollover: every debt gets its
 * min payment; any surplus from cleared debts rolls to the current focus debt. Returns the
 * number of months to clear all debts, or null if balances never decrease (min < interest).
 */
export function projectDebtFreeMonths(
  debts: DebtInput[],
  transactions: PaymentTx[],
  strategy: PayoffStrategy,
): number | null {
  let balances = debts.map((dbt) => ({ id: dbt.id, apr: dbt.apr, bal: debtRemaining(dbt, transactions), min: dbt.minPayment }));
  balances = balances.filter((b) => b.bal > 0);
  if (balances.length === 0) return 0;
  const totalMinPool = balances.reduce((s, b) => s + b.min, 0);

  for (let month = 1; month <= 600; month++) {
    // 1. accrue interest
    for (const b of balances) b.bal += b.bal * (b.apr / 100 / 12);
    // 2. budget for this month = sum of original min payments (rolls over as debts clear)
    let pool = totalMinPool;
    // 3. pay minimums (capped at balance)
    for (const b of balances) {
      const pay = Math.min(b.min, b.bal);
      b.bal -= pay;
      pool -= pay;
    }
    // 4. focus order for surplus
    const order = strategy === "snowball"
      ? [...balances].sort((a, b) => a.bal - b.bal)
      : [...balances].sort((a, b) => b.apr - a.apr);
    for (const b of order) {
      if (pool <= 0) break;
      const extra = Math.min(pool, b.bal);
      b.bal -= extra;
      pool -= extra;
    }
    balances = balances.filter((b) => b.bal > 0.005);
    if (balances.length === 0) return month;
  }
  return null; // did not converge within 50 years → min payments insufficient
}

export function addMonthsIso(baseIso: string, months: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

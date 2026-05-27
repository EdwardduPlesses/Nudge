import { expect, test } from "vitest";
import { defaultLeafFor, topKeyForLeaf, type NudgeLeafKey } from "./nudge-tab-nav";

test("defaultLeafFor returns the group's first child", () => {
  expect(defaultLeafFor("plan")).toBe("budgets");
  expect(defaultLeafFor("money")).toBe("goals");
});
test("defaultLeafFor returns the same key for a single item", () => {
  expect(defaultLeafFor("overview")).toBe("overview");
  expect(defaultLeafFor("activity")).toBe("activity");
  expect(defaultLeafFor("insights")).toBe("insights");
});
test("topKeyForLeaf maps a leaf back to its top-level key", () => {
  expect(topKeyForLeaf("budgets")).toBe("plan");
  expect(topKeyForLeaf("recurring")).toBe("plan");
  expect(topKeyForLeaf("goals")).toBe("money");
  expect(topKeyForLeaf("debts")).toBe("money");
  expect(topKeyForLeaf("overview" as NudgeLeafKey)).toBe("overview");
});

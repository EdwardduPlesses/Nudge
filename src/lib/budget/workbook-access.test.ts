import { expect, test } from "vitest";
import { pickActiveWorkbookId } from "./workbook-access";

test("returns the only membership's workbook", () => {
  expect(pickActiveWorkbookId([{ workbookId: "wb1", joinedAt: "2026-01-01" }])).toBe("wb1");
});

test("prefers the most recently joined workbook when multiple", () => {
  expect(
    pickActiveWorkbookId([
      { workbookId: "old", joinedAt: "2026-01-01" },
      { workbookId: "new", joinedAt: "2026-05-01" },
    ]),
  ).toBe("new");
});

test("returns null when no memberships", () => {
  expect(pickActiveWorkbookId([])).toBeNull();
});

import { expect, test } from "vitest";
import { generateInviteCode, pickExactUsernameMatch, isValidAcceptMode } from "./sharing";

test("generateInviteCode is 8 uppercase alphanumerics, no ambiguous chars", () => {
  for (let i = 0; i < 50; i++) {
    const c = generateInviteCode();
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  }
});

test("pickExactUsernameMatch is case-insensitive exact, ignores partials", () => {
  const rows = [{ id: "u1", username: "Sarah" }, { id: "u2", username: "sarah_b" }];
  expect(pickExactUsernameMatch(rows, "sarah")?.id).toBe("u1");
  expect(pickExactUsernameMatch(rows, "nope")).toBeNull();
});

test("isValidAcceptMode only allows adopt/fresh", () => {
  expect(isValidAcceptMode("adopt")).toBe(true);
  expect(isValidAcceptMode("fresh")).toBe(true);
  expect(isValidAcceptMode("merge")).toBe(false);
});

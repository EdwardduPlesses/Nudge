import { cookies, headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ensureActiveWorkbook, userIsWorkbookMember } from "@/lib/budget/workbook-access";

/** Resolve caller + their active workbook for a mutation, or return null (→ 401/403). */
export async function resolveMutationContext(): Promise<
  { userId: string; workbookId: string } | null
> {
  const [hdrs, cks] = await Promise.all([headers(), cookies()]);
  const u = await getCurrentUser(hdrs, cks);
  if (!u) return null;
  const workbookId = await ensureActiveWorkbook(u.userId);
  return { userId: u.userId, workbookId };
}

/** Verify the caller may write the given workbook (membership gate). */
export async function assertMember(userId: string, workbookId: string): Promise<boolean> {
  return userIsWorkbookMember(userId, workbookId);
}

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Heading, Text } from "frosted-ui";
import { NudgeApp } from "@/components/nudge/nudge-app";
import { CurrencyPreferenceProvider } from "@/context/currency-context";
import { NudgeBudgetProvider } from "@/context/nudge-budget-context";
import type { BudgetState } from "@/lib/budget/types";
import { fetchBudgetStateFromSupabase } from "@/lib/budget/supabase-persistence";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth/current-user";
import { userHasAnyNudgeMembership } from "@/lib/auth/standalone-gate";

export const dynamic = "force-dynamic";

const STANDALONE_EXPERIENCE_ID = "standalone";
const GATE_REFRESH_SECONDS = 15 * 60;

export default async function StandaloneAppPage() {
  if (!isSupabasePersistenceEnabled()) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center sm:px-6">
        <Heading size="6">Database not configured</Heading>
        <Text size="3" color="gray" className="max-w-md">
          Nudge stores your budget on Supabase. Set the Supabase env vars and redeploy.
        </Text>
      </div>
    );
  }

  const [hdrs, cks] = await Promise.all([headers(), cookies()]);
  const user = await getCurrentUser(hdrs, cks);

  if (!user || user.source === "whop-iframe") {
    redirect("/login?next=/app");
  }

  if (user.source === "standalone-session") {
    // eslint-disable-next-line react-hooks/purity
    const stale = Math.floor(Date.now() / 1000) - user.gateCheckedAt > GATE_REFRESH_SECONDS;
    if (stale) {
      const allowed = await userHasAnyNudgeMembership(user.userId);
      if (!allowed) {
        // We can't clear cookies from an RSC; rely on /login + the next OAuth round-trip
        // to overwrite the session. Surface the gate failure by sending them to /login.
        redirect("/login?next=/app&reason=gate");
      }
    }
  }

  let remoteBudget: { snapshot: BudgetState | null };
  try {
    remoteBudget = { snapshot: await fetchBudgetStateFromSupabase(user.userId) };
  } catch (err) {
    console.error("[Nudge] Failed to load budget from Supabase (standalone)", err);
    remoteBudget = { snapshot: null };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NudgeBudgetProvider
        experienceId={STANDALONE_EXPERIENCE_ID}
        userId={user.userId}
        whopUserToken={null}
        remote={remoteBudget}
      >
        <CurrencyPreferenceProvider experienceId={STANDALONE_EXPERIENCE_ID} userId={user.userId}>
          <NudgeApp devMode={user.source === "dev-preview"} showSignOut />
        </CurrencyPreferenceProvider>
      </NudgeBudgetProvider>
    </div>
  );
}

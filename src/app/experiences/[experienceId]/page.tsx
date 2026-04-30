import { headers } from "next/headers";
import { Heading, Text } from "frosted-ui";
import { NudgeApp } from "@/components/nudge/nudge-app";
import { CurrencyPreferenceProvider } from "@/context/currency-context";
import { NudgeBudgetProvider } from "@/context/nudge-budget-context";
import type { BudgetState } from "@/lib/budget/types";
import { fetchBudgetStateFromSupabase } from "@/lib/budget/supabase-persistence";
import { devStrictWhop, NUDGE_DEV_PREVIEW_USER_ID } from "@/lib/nudge-dev-preview";
import { isSupabasePersistenceEnabled } from "@/lib/supabase/config";
import { whopsdk } from "@/lib/whop-sdk";

export const dynamic = "force-dynamic";

function whopApiKeyMissing(): boolean {
  const k = process.env.WHOP_API_KEY;
  return k == null || k.trim() === "";
}

export default async function ExperiencePage({
  params,
}: {
  params: Promise<{ experienceId: string }>;
}) {
  const { experienceId } = await params;

  if (process.env.NODE_ENV === "production" && whopApiKeyMissing()) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center sm:px-6">
        <Heading size="6">App unavailable</Heading>
        <Text size="3" color="gray" className="max-w-sm">
          This app isn&apos;t fully configured yet. Please try again later.
        </Text>
      </div>
    );
  }

  const hdrs = await headers();
  const whopUserToken = hdrs.get("x-whop-user-token");
  const auth = await whopsdk.verifyUserToken(hdrs, { dontThrow: true });
  const isDev = process.env.NODE_ENV === "development";
  const strict = devStrictWhop();

  let userId = auth?.userId ?? null;
  let devPreview = false;

  if (!userId && isDev && !strict) {
    userId = NUDGE_DEV_PREVIEW_USER_ID;
    devPreview = true;
  }

  if (!userId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center sm:px-6">
        <Heading size="6">Sign in to continue</Heading>
        <Text size="3" color="gray" className="max-w-sm">
          Open <strong>Nudge</strong> from Whop to use your budget.
        </Text>
      </div>
    );
  }

  if (!devPreview) {
    type AccessGate = "ok" | "no_access" | "api_error";
    let gate: AccessGate = "ok";
    let checkAccessFailure: string | null = null;
    try {
      const access = await whopsdk.users.checkAccess(experienceId, { id: userId });
      if (!access.has_access) gate = "no_access";
    } catch (err) {
      gate = "api_error";
      checkAccessFailure = err instanceof Error ? err.message : String(err);
      console.error("[Nudge] users.checkAccess failed", {
        experienceId,
        userId,
        message: checkAccessFailure,
        err,
      });
    }

    if (gate === "api_error") {
      if (isDev && !strict) {
        console.warn(
          "[Nudge] Dev bypass: checkAccess failed; loading app with local preview user. Set NUDGE_STRICT_WHOP=1 to enforce Whop gates locally.",
          checkAccessFailure,
        );
        userId = NUDGE_DEV_PREVIEW_USER_ID;
        devPreview = true;
      } else {
        return (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center sm:px-6">
            <Heading size="6">Something went wrong</Heading>
            <Text size="3" color="gray" className="max-w-sm">
              We couldn&apos;t verify your access right now. Try again in a moment.
            </Text>
            {isDev ? (
              <>
                <Text size="2" color="gray" className="max-w-md text-left">
                  Developer: check <code className="rounded bg-gray-500/10 px-1">WHOP_API_KEY</code> (app key,
                  not company key),{" "}
                  <code className="rounded bg-gray-500/10 px-1">NEXT_PUBLIC_WHOP_APP_ID</code>, and host logs
                  for <code className="rounded bg-gray-500/10 px-1">users.checkAccess</code>.
                </Text>
                {checkAccessFailure ? (
                  <Text
                    as="p"
                    size="2"
                    className="max-w-xl rounded-lg bg-red-500/10 p-3 font-mono text-left text-red-600 dark:text-red-400"
                  >
                    {checkAccessFailure}
                  </Text>
                ) : null}
              </>
            ) : null}
          </div>
        );
      }
    }

    if (gate === "no_access") {
      if (isDev && !strict) {
        console.warn(
          "[Nudge] Dev bypass: no membership for this experience; loading local preview. Set NUDGE_STRICT_WHOP=1 to test the real gate.",
        );
        userId = NUDGE_DEV_PREVIEW_USER_ID;
        devPreview = true;
      } else {
        return (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-center sm:px-6">
            <Heading size="6">No access</Heading>
            <Text size="3" color="gray" className="max-w-sm">
              You need an active membership to use Nudge.
            </Text>
          </div>
        );
      }
    }
  }

  if (!isSupabasePersistenceEnabled()) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center sm:px-6">
        <Heading size="6">Database not configured</Heading>
        <Text size="3" color="gray" className="max-w-md">
          Nudge stores your budget on Supabase. Set <code className="rounded bg-gray-500/10 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-gray-500/10 px-1">SUPABASE_SERVICE_ROLE_KEY</code> in your environment, then redeploy.
        </Text>
      </div>
    );
  }

  let remoteBudget: { snapshot: BudgetState | null };
  try {
    remoteBudget = { snapshot: await fetchBudgetStateFromSupabase(experienceId, userId) };
  } catch (err) {
    console.error("[Nudge] Failed to load budget from Supabase", err);
    remoteBudget = { snapshot: null };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NudgeBudgetProvider
        experienceId={experienceId}
        userId={userId}
        whopUserToken={whopUserToken}
        remote={remoteBudget}
      >
        <CurrencyPreferenceProvider experienceId={experienceId} userId={userId}>
          <NudgeApp devMode={devPreview} />
        </CurrencyPreferenceProvider>
      </NudgeBudgetProvider>
    </div>
  );
}

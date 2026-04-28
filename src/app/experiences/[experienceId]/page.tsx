import { headers } from "next/headers";
import { Heading, Text } from "frosted-ui";
import { NudgeApp } from "@/components/nudge/nudge-app";
import { NudgeBudgetProvider } from "@/context/nudge-budget-context";
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
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <Heading size="6">Server configuration</Heading>
        <Text size="3" color="gray" className="max-w-md">
          Set a real <strong>WHOP_API_KEY</strong> on your host (e.g. Vercel → Environment Variables).
          Redeploy after saving.
        </Text>
      </div>
    );
  }

  const hdrs = await headers();
  const auth = await whopsdk.verifyUserToken(hdrs, { dontThrow: true });
  const isDev = process.env.NODE_ENV === "development";

  let userId = auth?.userId ?? null;
  let devPreview = false;

  if (!userId && isDev) {
    userId = "dev_local_user";
    devPreview = true;
  }

  if (!userId) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <Heading size="6">Sign in with Whop</Heading>
        <Text size="3" color="gray" className="max-w-md">
          Open <strong>Nudge</strong> from an experience inside Whop so your session is available.
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
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
          <Heading size="6">Whop API error</Heading>
          <Text size="3" color="gray" className="max-w-md text-left">
            The server could not call Whop to verify membership. Most often:
          </Text>
          <ul className="max-w-md list-disc space-y-2 pl-5 text-left text-sm text-gray-600 dark:text-gray-400">
            <li>
              Use an <strong>app API key</strong> from your app&apos;s developer page (Environment variables /
              <code className="rounded bg-gray-500/10 px-1">WHOP_API_KEY</code>
              there)—not a company API key from the global dashboard.
            </li>
            <li>
              Set <code className="rounded bg-gray-500/10 px-1">WHOP_API_KEY</code> and{" "}
              <code className="rounded bg-gray-500/10 px-1">NEXT_PUBLIC_WHOP_APP_ID</code> on your host (e.g.
              Vercel → Production) and redeploy.
            </li>
            <li>
              Key value: no surrounding quotes; paste the key as-is (the SDK adds{" "}
              <code className="rounded bg-gray-500/10 px-1">Bearer</code> if needed).
            </li>
          </ul>
          {isDev && checkAccessFailure ? (
            <Text as="p" size="2" className="max-w-xl rounded-lg bg-red-500/10 p-3 font-mono text-left text-red-600 dark:text-red-400">
              {checkAccessFailure}
            </Text>
          ) : null}
          <Text size="2" color="gray" className="max-w-md">
            Check your host logs for <code className="rounded bg-gray-500/10 px-1">[Nudge] users.checkAccess failed</code>{" "}
            for full detail.
          </Text>
        </div>
      );
    }

    if (gate === "no_access") {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-6 text-center">
          <Heading size="6">No access</Heading>
          <Text size="3" color="gray">
            You need an active membership for this experience to use Nudge.
          </Text>
        </div>
      );
    }
  }

  return (
    <NudgeBudgetProvider experienceId={experienceId} userId={userId}>
      <NudgeApp experienceId={experienceId} devMode={devPreview} />
    </NudgeBudgetProvider>
  );
}

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
    try {
      const access = await whopsdk.users.checkAccess(experienceId, { id: userId });
      if (!access.has_access) gate = "no_access";
    } catch {
      gate = "api_error";
    }

    if (gate === "api_error") {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <Heading size="6">Whop API error</Heading>
          <Text size="3" color="gray" className="max-w-md">
            Could not verify access. Confirm <strong>WHOP_API_KEY</strong> is correct for this app in
            production and redeploy.
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

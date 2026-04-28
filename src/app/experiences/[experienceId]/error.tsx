"use client";

import { useEffect } from "react";

export default function ExperienceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Nudge /experiences] ", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-zinc-500">
        Nudge hit an error while loading this experience. If you just deployed, check that{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">WHOP_API_KEY</code> and{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">NEXT_PUBLIC_WHOP_APP_ID</code>{" "}
        are set on your host. Use a production URL (Vercel +{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">next build</code>), not{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">next dev</code>, as the Whop Base
        URL.
      </p>
      <button
        type="button"
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}

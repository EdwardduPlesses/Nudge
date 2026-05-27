"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Nudge /app] ", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center sm:px-6">
      <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
        Please try again. If it keeps happening, refresh the page or sign in again.
      </p>
      <button
        type="button"
        className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}

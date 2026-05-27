import { NudgeDashboardSkeleton } from "@/components/nudge/content-skeleton";

// Shown during the server fetch on a cold navigation to /app, so the route renders a
// structured skeleton dashboard instead of a blank page. Server component (no "use client").
export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NudgeDashboardSkeleton />
    </div>
  );
}

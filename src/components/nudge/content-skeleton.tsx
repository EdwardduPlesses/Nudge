import { Skeleton } from "frosted-ui";

/**
 * Shared loading-state primitives for Nudge.
 *
 * One consistent pattern: frosted-ui `Skeleton` placeholders wrapped in the app's
 * `atelier-card` surfaces, sized to roughly match real content so there's minimal
 * layout shift. These are deliberately client-agnostic (no "use client", no hooks,
 * no context) so they can be used from server components and App Router `loading.tsx`.
 */

/** A single placeholder list row inside the shared card surface. */
function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-600/15 bg-gray-900/3 p-4 dark:bg-white/4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton.Text size="2" style={{ width: "45%" }} />
        <Skeleton.Text size="1" style={{ width: "70%" }} />
      </div>
      <Skeleton.Rect style={{ width: 64, height: 22, borderRadius: 999 }} />
    </div>
  );
}

/**
 * Placeholder list: a stack of card-row skeletons. Use for any region that resolves
 * into a list of items (recurring items, debts, members, activity, …). When `inCard`
 * is true the rows sit inside an `atelier-card` surface; otherwise they render bare so
 * callers that already provide a surface (e.g. a dialog) don't double-nest.
 */
export function NudgeListSkeleton({
  rows = 3,
  inCard = false,
}: {
  rows?: number;
  inCard?: boolean;
}) {
  const list = (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );

  if (!inCard) return list;

  return (
    <div className="atelier-card p-5" aria-hidden>
      {list}
    </div>
  );
}

/**
 * Placeholder stat/hero block: an eyebrow + a large numeral + a few support stats,
 * shaped like the dashboard hero / stat cards. Built on the elevated card surface.
 */
export function NudgeCardSkeleton() {
  return (
    <section
      className="atelier-card-elevated"
      style={{ padding: "clamp(1.25rem, 3vw, 2rem)" }}
      aria-hidden
    >
      <div className="flex flex-col gap-2">
        <Skeleton.Text size="1" style={{ width: 120 }} />
        <Skeleton.Rect style={{ width: "min(60%, 18rem)", height: "3.5rem" }} />
        <Skeleton.Text size="2" style={{ width: 140 }} />
      </div>
      <div
        className="mt-8 grid gap-5 pt-6 sm:grid-cols-3"
        style={{ borderTop: "1px solid var(--hairline)" }}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex min-w-0 flex-col gap-2">
            <Skeleton.Text size="1" style={{ width: "60%" }} />
            <Skeleton.Text size="3" style={{ width: "80%" }} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** A grid of small stat-card placeholders, matching the dashboard "This month" grid. */
export function NudgeStatGridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="atelier-stat">
          <Skeleton.Text size="1" style={{ width: "55%" }} />
          <div className="mt-2">
            <Skeleton.Text size="5" style={{ width: "75%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Full dashboard skeleton: hero block + stat grid + a couple of list rows, sized to
 * roughly match the real dashboard. Used by the App Router `loading.tsx` files so a
 * cold navigation shows structured placeholders instead of a blank page.
 */
export function NudgeDashboardSkeleton() {
  return (
    <div
      className="mx-auto flex min-h-0 w-full max-w-[96rem] flex-1 flex-col gap-7 px-4 py-6 sm:gap-8 sm:px-10 sm:py-8"
      aria-busy
      aria-label="Loading"
    >
      {/* Header eyebrow + title */}
      <header className="flex flex-col gap-3">
        <Skeleton.Text size="1" style={{ width: 160 }} />
        <Skeleton.Rect style={{ width: "min(50%, 16rem)", height: "2.25rem" }} />
        <Skeleton.Text size="2" style={{ width: "min(70%, 22rem)" }} />
      </header>

      <NudgeCardSkeleton />

      <div className="flex flex-col gap-4">
        <Skeleton.Text size="1" style={{ width: 120 }} />
        <NudgeStatGridSkeleton />
      </div>

      <NudgeListSkeleton rows={2} />
    </div>
  );
}

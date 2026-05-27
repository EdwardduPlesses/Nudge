"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { MemberBadge } from "@/components/nudge/member-badge";
import { NudgeListSkeleton } from "@/components/nudge/content-skeleton";
import { nudgeBudgetFetchInit, useNudgeBudget } from "@/context/nudge-budget-context";

interface ActivityItem {
  id: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
}

export function ActivityFeed({ filterUserId }: { filterUserId?: string }) {
  const { whopUserToken } = useNudgeBudget();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  // Bumped to re-run the load effect on a retry.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const url = filterUserId
      ? `/api/activity?actor=${encodeURIComponent(filterUserId)}`
      : "/api/activity";
    void (async () => {
      try {
        const res = await fetch(url, nudgeBudgetFetchInit(whopUserToken, { credentials: "include" }));
        if (!res.ok) {
          if (!cancelled) {
            setError(true);
            setLoaded(true);
          }
          return;
        }
        const data = (await res.json()) as { items: ActivityItem[] };
        if (!cancelled) {
          setItems(data.items ?? []);
          setError(false);
          setLoaded(true);
        }
      } catch (err) {
        console.error("[Nudge] activity feed load failed", err);
        if (!cancelled) {
          setError(true);
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [whopUserToken, filterUserId, reloadKey]);

  if (!loaded) {
    return <NudgeListSkeleton rows={3} />;
  }

  // A failed load looked identical to "empty" before — surface it distinctly with a retry.
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span style={{ color: "var(--tone-overdue)", fontSize: "0.9rem", lineHeight: 1.55 }}>
          Couldn&apos;t load activity.
        </span>
        <button
          type="button"
          className="underline underline-offset-2"
          style={{ color: "var(--ink-soft)", fontSize: "0.9rem", lineHeight: 1.55 }}
          onClick={() => {
            setLoaded(false);
            setError(false);
            setReloadKey((k) => k + 1);
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p style={{ color: "var(--ink-muted)", fontSize: "0.9rem", lineHeight: 1.55 }}>
        No activity yet.
      </p>
    );
  }

  return (
    <ul className="flex list-none flex-col gap-3 p-0">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <MemberBadge userId={item.actorUserId} />
          <span style={{ color: "var(--ink-soft)", fontSize: "0.9rem", lineHeight: 1.5 }}>
            {item.summary}
          </span>
          <span
            className="tabular"
            style={{
              color: "var(--ink-faint)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {formatDistanceToNow(parseISO(item.createdAt), { addSuffix: true })}
          </span>
        </li>
      ))}
    </ul>
  );
}

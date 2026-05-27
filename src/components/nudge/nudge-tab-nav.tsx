"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type NudgeLeafKey =
  | "overview"
  | "activity"
  | "insights"
  | "budgets"
  | "recurring"
  | "goals"
  | "debts"
  | "settings";
export type NudgeTopKey =
  | "overview"
  | "activity"
  | "plan"
  | "money"
  | "insights";

export type NavChild = { key: NudgeLeafKey; label: string };
export type NavTop = {
  key: NudgeTopKey;
  label: string;
  hint: string;
  icon: (props: { className?: string }) => React.JSX.Element;
  children?: NavChild[];
};

const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const iconOverview = ({ className }: { className?: string }) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        <path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 8h6V4h-6zM4 20h6v-4H4z" />
      </svg>
);

const iconActivity = ({ className }: { className?: string }) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        <path d="M3 12h3l2-7 4 14 3-10 2 5h4" />
      </svg>
);

const iconInsights = ({ className }: { className?: string }) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
        <circle cx="12" cy="12" r="3" />
      </svg>
);

const iconBudgets = ({ className }: { className?: string }) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 3.5v8.5l6 6" />
      </svg>
);

const iconGoals = ({ className }: { className?: string }) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
      </svg>
);

export const NAV: NavTop[] = [
  { key: "overview", label: "Overview", hint: "Today", icon: iconOverview },
  { key: "activity", label: "Activity", hint: "Ledger", icon: iconActivity },
  {
    key: "plan",
    label: "Plan",
    hint: "Budget",
    icon: iconBudgets,
    children: [
      { key: "budgets", label: "Budgets" },
      { key: "recurring", label: "Recurring" },
    ],
  },
  {
    key: "money",
    label: "Money goals",
    hint: "Targets",
    icon: iconGoals,
    children: [
      { key: "goals", label: "Goals" },
      { key: "debts", label: "Debts" },
    ],
  },
  { key: "insights", label: "Insights", hint: "Signals", icon: iconInsights },
];

export function defaultLeafFor(top: NudgeTopKey): NudgeLeafKey {
  const item = NAV.find((n) => n.key === top);
  if (item?.children && item.children.length > 0) return item.children[0].key;
  return top as unknown as NudgeLeafKey;
}
export function topKeyForLeaf(leaf: NudgeLeafKey): NudgeTopKey {
  for (const n of NAV) {
    if (n.key === (leaf as unknown as NudgeTopKey)) return n.key;
    if (n.children?.some((c) => c.key === leaf)) return n.key;
  }
  return "overview";
}

/* ─────────────────────────────────────────────────────────────
   NudgeTopBar — full-bleed sticky top app bar (desktop only)
   Brand mark on the left, tab pill in the middle, actions right.
   Hidden below the `sm` breakpoint (mobile uses NudgeMobileTabBar).
   ───────────────────────────────────────────────────────────── */

export function NudgeTopBar(props: {
  value: NudgeTopKey;
  onChange: (next: NudgeTopKey) => void;
  actions?: React.ReactNode;
}) {
  return (
    <header className="nudge-topbar" aria-label="Primary">
      <div className="nudge-topbar__inner">
        <a
          href="/app"
          className="nudge-topbar__brand"
          aria-label="Nudge — home"
        >
          <span className="nudge-topbar__brand-mark" aria-hidden>
            ✦
          </span>
          <span className="nudge-topbar__brand-name">Nudge</span>
        </a>

        <DesktopTabPill value={props.value} onChange={props.onChange} />

        <div className="nudge-topbar__actions">{props.actions}</div>
      </div>
    </header>
  );
}

function DesktopTabPill(props: {
  value: NudgeTopKey;
  onChange: (next: NudgeTopKey) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(
    null,
  );

  const reposition = () => {
    const list = listRef.current;
    const btn = btnRefs.current[props.value];
    if (!list || !btn) return;
    const listRect = list.getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    setIndicator({ x: r.left - listRect.left, w: r.width });
  };

  useIsoLayoutEffect(() => {
    reposition();
  }, [props.value]);

  useEffect(() => {
    const onResize = () => reposition();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);

  return (
    <nav
      ref={listRef}
      className="nudge-topbar__nav"
      role="tablist"
      aria-label="Sections"
    >
      <span
        aria-hidden
        className="nudge-topbar__indicator"
        style={
          indicator
            ? {
                transform: `translateX(${indicator.x}px)`,
                width: indicator.w,
                opacity: 1,
              }
            : { opacity: 0 }
        }
      />
      {NAV.map((t) => {
        const active = props.value === t.key;
        return (
          <button
            key={t.key}
            ref={(el) => {
              btnRefs.current[t.key] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active ? "true" : undefined}
            className="nudge-topbar__tab"
            onClick={() => props.onChange(t.key)}
          >
            <t.icon className="nudge-topbar__tab-icon" />
            <span className="nudge-topbar__tab-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ─────────────────────────────────────────────────────────────
   NudgeMobileTabBar — fixed bottom bar (mobile only)
   ───────────────────────────────────────────────────────────── */

export function NudgeMobileTabBar(props: {
  value: NudgeTopKey;
  onChange: (next: NudgeTopKey) => void;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [underline, setUnderline] = useState<{ x: number; w: number } | null>(
    null,
  );

  const reposition = () => {
    const rail = railRef.current;
    const btn = btnRefs.current[props.value];
    if (!rail || !btn) return;
    const railRect = rail.getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    const inset = r.width * 0.22;
    setUnderline({
      x: r.left - railRect.left + inset,
      w: Math.max(18, r.width - inset * 2),
    });
  };

  useIsoLayoutEffect(() => {
    reposition();
  }, [props.value]);

  useEffect(() => {
    const onResize = () => reposition();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);

  const activeSpec = NAV.find((t) => t.key === props.value) ?? NAV[0];

  return (
    <nav
      aria-label="Sections"
      className="nudge-tabnav-mobile sm:hidden"
      role="tablist"
    >
      <div className="nudge-tabnav-mobile__caption" aria-hidden>
        <span className="nudge-tabnav-mobile__ornament">✦</span>
        <span className="nudge-tabnav-mobile__caption-text">
          {activeSpec.hint}
        </span>
      </div>
      <div ref={railRef} className="nudge-tabnav-mobile__rail">
        <span
          aria-hidden
          className="nudge-tabnav-mobile__underline"
          style={
            underline
              ? {
                  transform: `translateX(${underline.x}px)`,
                  width: underline.w,
                  opacity: 1,
                }
              : { opacity: 0 }
          }
        />
        {NAV.map((t) => {
          const active = props.value === t.key;
          return (
            <button
              key={t.key}
              ref={(el) => {
                btnRefs.current[t.key] = el;
              }}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={t.label}
              data-active={active ? "true" : undefined}
              className="nudge-tabnav-mobile__item"
              onClick={() => props.onChange(t.key)}
            >
              <span className="nudge-tabnav-mobile__icon-wrap">
                <t.icon className="nudge-tabnav-mobile__icon" />
              </span>
              <span className="nudge-tabnav-mobile__label">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ─────────────────────────────────────────────────────────────
   NudgeSubTabs — secondary sub-section strip for grouped tabs
   ───────────────────────────────────────────────────────────── */

export function NudgeSubTabs(props: {
  items: NavChild[];
  value: NudgeLeafKey;
  onChange: (k: NudgeLeafKey) => void;
}) {
  return (
    <nav
      className="flex flex-wrap items-center gap-2"
      role="tablist"
      aria-label="Sub-sections"
    >
      {props.items.map((c) => {
        const active = props.value === c.key;
        return (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active ? "true" : undefined}
            className="nudge-subtab"
            onClick={() => props.onChange(c.key)}
          >
            {c.label}
          </button>
        );
      })}
    </nav>
  );
}

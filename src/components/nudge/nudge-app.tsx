"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import { ActivityTab } from "@/components/nudge/activity-tab";
import { AddTransactionDialog } from "@/components/nudge/add-transaction-dialog";
import { BudgetsTab } from "@/components/nudge/budgets-tab";
import { DashboardTab } from "@/components/nudge/dashboard-tab";
import { DebtsTab } from "@/components/nudge/debts-tab";
import { GoalsTab } from "@/components/nudge/goals-tab";
import { InsightsTab } from "@/components/nudge/insights-tab";
import {
  NudgeMobileTabBar,
  NudgeTopBar,
  NudgeSubTabs,
  NAV,
  defaultLeafFor,
  type NudgeTopKey,
  type NudgeLeafKey,
} from "@/components/nudge/nudge-tab-nav";
import { PeriodSelector } from "@/components/nudge/period-selector";
import { SettingsTab } from "@/components/nudge/settings-tab";
import { RecurringTab } from "@/components/nudge/recurring-tab";

/** Transient toast shown when an optimistic edit was rolled back after a failed save. */
function SyncErrorToast() {
  const { syncError, clearSyncError } = useNudgeBudget();

  useEffect(() => {
    if (!syncError) return;
    const t = setTimeout(clearSyncError, 5000);
    return () => clearTimeout(t);
  }, [syncError, clearSyncError]);

  if (!syncError) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="nudge-sync-toast fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <div className="atelier-card-elevated flex max-w-md items-center gap-3 rounded-full py-2.5 pl-4 pr-2.5 text-sm shadow-lg">
        <span aria-hidden style={{ color: "var(--gold)" }}>
          ⚠
        </span>
        <span style={{ color: "var(--ink)" }}>{syncError}</span>
        <button
          type="button"
          onClick={clearSyncError}
          aria-label="Dismiss"
          className="shrink-0 rounded-full px-2 py-1 text-gray-500 hover:text-gray-900 dark:hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function NudgeApp(props: { devMode: boolean; showSignOut?: boolean }) {
  const { state } = useNudgeBudget();
  const [activeTop, setActiveTop] = useState<NudgeTopKey | "settings">("overview");
  const [activeLeaf, setActiveLeaf] = useState<NudgeLeafKey>("overview");
  const selectTop = (top: NudgeTopKey) => {
    setActiveTop(top);
    setActiveLeaf(defaultLeafFor(top));
  };
  const openSettings = () => {
    setActiveTop("settings");
    setActiveLeaf("settings");
  };
  const today = format(new Date(), "EEEE, MMMM d");
  const edition = format(new Date(), "yy.MM");

  return (
    <>
      {/* ───── Desktop top app bar (full-bleed, sticky) ───── */}
      <NudgeTopBar
        value={activeTop === "settings" ? ("" as NudgeTopKey) : activeTop}
        onChange={selectTop}
        actions={
          <button
            type="button"
            className="nudge-topbar-link"
            aria-label="Settings"
            onClick={openSettings}
          >
            ⚙ Settings
          </button>
        }
      />

      <div className="nudge-app-shell mx-auto flex min-h-0 w-full max-w-[96rem] flex-1 flex-col gap-7 overflow-x-hidden px-4 py-6 sm:gap-8 sm:px-10 sm:py-8">
        {/* ───── Mobile masthead (editorial hero) ───── */}
        <header
          className="flex flex-col gap-5 border-b pb-6 sm:hidden"
          style={{ borderColor: "var(--hairline)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="eyebrow">
                Private Ledger — Edition N°{edition}
              </span>
              <h1
                className="brand-wordmark mt-2"
                style={{ fontSize: "clamp(2.4rem, 7vw, 3.5rem)" }}
              >
                Nudge
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                aria-label="Settings"
                onClick={openSettings}
              >
                ⚙
              </button>
            </div>
          </div>

          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm"
            style={{ color: "var(--ink-muted)" }}
          >
            <span className="inline-flex items-center gap-2">
              <span aria-hidden style={{ color: "var(--gold)" }}>
                ✦
              </span>
              <span className="tabular">{today}</span>
            </span>
            <span
              aria-hidden
              className="inline-block h-3 w-px"
              style={{ background: "var(--hairline-strong)" }}
            />
            <span className="italic" style={{ fontFamily: "var(--font-fraunces), serif" }}>
              Budget clarity, without the spreadsheet.
            </span>
            {props.devMode ? (
              <>
                <span
                  aria-hidden
                  className="inline-block h-3 w-px"
                  style={{ background: "var(--hairline-strong)" }}
                />
                <span className="atelier-chip" data-tone="warm">
                  Dev preview
                </span>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <PeriodSelector />
          </div>
        </header>

        {/* ───── Desktop editorial strip (slim, sits just under top bar) ───── */}
        <div className="hidden items-center gap-x-4 gap-y-1 text-sm sm:flex sm:flex-wrap">
          <span className="eyebrow">Edition N°{edition}</span>
          <span
            aria-hidden
            className="hidden h-3 w-px sm:inline-block"
            style={{ background: "var(--hairline-strong)" }}
          />
          <span
            className="inline-flex items-center gap-2"
            style={{ color: "var(--ink-muted)" }}
          >
            <span aria-hidden style={{ color: "var(--gold)" }}>
              ✦
            </span>
            <span className="tabular">{today}</span>
          </span>
          <span
            aria-hidden
            className="hidden h-3 w-px sm:inline-block"
            style={{ background: "var(--hairline-strong)" }}
          />
          <span
            className="italic"
            style={{
              fontFamily: "var(--font-fraunces), serif",
              color: "var(--ink-muted)",
            }}
          >
            Budget clarity, without the spreadsheet.
          </span>
          <span
            aria-hidden
            className="hidden h-3 w-px sm:inline-block"
            style={{ background: "var(--hairline-strong)" }}
          />
          <PeriodSelector />
          {props.devMode ? (
            <>
              <span
                aria-hidden
                className="hidden h-3 w-px sm:inline-block"
                style={{ background: "var(--hairline-strong)" }}
              />
              <span className="atelier-chip" data-tone="warm">
                Dev preview
              </span>
            </>
          ) : null}
        </div>

        {/* ───── Sub-tab strip ───── */}
        {(() => {
          const item = NAV.find((n) => n.key === activeTop);
          return item?.children ? (
            <div className="-mt-2">
              <NudgeSubTabs
                items={item.children}
                value={activeLeaf}
                onChange={setActiveLeaf}
              />
            </div>
          ) : null;
        })()}

        {/* ───── Content ───── */}
        <div
          role="tabpanel"
          className="min-h-[min(320px,50vh)] min-w-0 flex-1"
        >
          {activeLeaf === "overview" ? <DashboardTab /> : null}
          {activeLeaf === "activity" ? <ActivityTab /> : null}
          {activeLeaf === "insights" ? <InsightsTab /> : null}
          {activeLeaf === "budgets" ? <BudgetsTab /> : null}
          {activeLeaf === "recurring" ? <RecurringTab /> : null}
          {activeLeaf === "goals" ? <GoalsTab /> : null}
          {activeLeaf === "debts" ? <DebtsTab /> : null}
          {activeLeaf === "settings" ? <SettingsTab showSignOut={props.showSignOut} /> : null}
        </div>
      </div>

      {/* ───── Mobile bottom tab bar (fixed) ───── */}
      <NudgeMobileTabBar
        value={activeTop === "settings" ? ("" as NudgeTopKey) : activeTop}
        onChange={selectTop}
      />

      {/* Single add-transaction entry point. The FAB opens the full dialog (expense,
          income, goal, debt payment). Hidden in a read-only past period. */}
      {state.editable ? (
        <AddTransactionDialog
          trigger={
            <button type="button" className="atelier-fab" aria-label="Add transaction">
              <svg
                aria-hidden
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          }
        />
      ) : null}
      <SyncErrorToast />
    </>
  );
}

"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Select, Tabs } from "frosted-ui";
import { ActivityTab } from "@/components/nudge/activity-tab";
import { QuickAddExpenseButton } from "@/components/nudge/quick-add-expense-button";
import { BudgetsTab } from "@/components/nudge/budgets-tab";
import { DashboardTab } from "@/components/nudge/dashboard-tab";
import { GoalsTab } from "@/components/nudge/goals-tab";
import { InsightsTab } from "@/components/nudge/insights-tab";
import { ThemeToggle } from "@/components/nudge/theme-toggle";
import { displayCurrencyItems, useCurrency } from "@/context/currency-context";
import type { DisplayCurrency } from "@/lib/currency-config";

type TabKey = "overview" | "activity" | "insights" | "budgets" | "goals";

function HeaderCurrencySelect() {
  const { currency, setCurrency } = useCurrency();
  const items = displayCurrencyItems();

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="eyebrow">Currency</span>
      <Select.Root value={currency} onValueChange={(v) => setCurrency(v as DisplayCurrency)}>
        <Select.Trigger
          placeholder="Currency"
          className="min-h-10 w-full max-w-[min(100%,16rem)] sm:max-w-[14rem]"
        />
        <Select.Content>
          {items.map((it) => (
            <Select.Item key={it.code} value={it.code}>
              {it.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </div>
  );
}

export function NudgeApp(props: { devMode: boolean }) {
  const [tab, setTab] = useState<TabKey>("overview");
  const today = format(new Date(), "EEEE, MMMM d");

  return (
    <div className="nudge-app-shell mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-7 overflow-x-hidden px-4 py-6 sm:gap-9 sm:px-8 sm:py-8">
      {/* ───── Masthead ───── */}
      <header className="flex flex-col gap-5 border-b pb-6" style={{ borderColor: "var(--hairline)" }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="eyebrow">Private Ledger — Edition N°{format(new Date(), "yy.MM")}</span>
            <h1
              className="brand-wordmark mt-2"
              style={{ fontSize: "clamp(2.4rem, 7vw, 3.5rem)" }}
            >
              Nudge
            </h1>
          </div>
          <ThemeToggle />
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
          <HeaderCurrencySelect />
        </div>
      </header>

      {/* ───── Tabs ───── */}
      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex min-h-0 flex-1 flex-col">
        <div
          className="-mx-1 rounded-xl p-1"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--hairline)",
          }}
        >
          <Tabs.List
            size="2"
            className="w-full min-w-0 max-w-full justify-start gap-0 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] sm:max-w-2xl [&::-webkit-scrollbar]:hidden"
          >
            <Tabs.Trigger value="overview" className="shrink-0">
              Overview
            </Tabs.Trigger>
            <Tabs.Trigger value="activity" className="shrink-0">
              Activity
            </Tabs.Trigger>
            <Tabs.Trigger value="insights" className="shrink-0">
              Insights
            </Tabs.Trigger>
            <Tabs.Trigger value="budgets" className="shrink-0">
              Budgets
            </Tabs.Trigger>
            <Tabs.Trigger value="goals" className="shrink-0">
              Goals
            </Tabs.Trigger>
          </Tabs.List>
        </div>

        <div className="mt-5 min-h-[min(320px,50vh)] min-w-0 flex-1 sm:mt-7">
          <Tabs.Content value="overview">
            <DashboardTab />
          </Tabs.Content>
          <Tabs.Content value="activity">
            <ActivityTab />
          </Tabs.Content>
          <Tabs.Content value="insights">
            <InsightsTab />
          </Tabs.Content>
          <Tabs.Content value="budgets">
            <BudgetsTab />
          </Tabs.Content>
          <Tabs.Content value="goals">
            <GoalsTab />
          </Tabs.Content>
        </div>
      </Tabs.Root>

      <QuickAddExpenseButton variant="fab" />
    </div>
  );
}

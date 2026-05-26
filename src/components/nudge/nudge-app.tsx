"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Select } from "frosted-ui";
import { ActivityTab } from "@/components/nudge/activity-tab";
import { QuickAddExpenseButton } from "@/components/nudge/quick-add-expense-button";
import { BudgetsTab } from "@/components/nudge/budgets-tab";
import { DashboardTab } from "@/components/nudge/dashboard-tab";
import { GoalsTab } from "@/components/nudge/goals-tab";
import { InsightsTab } from "@/components/nudge/insights-tab";
import { NudgeTabNav, type NudgeTabKey } from "@/components/nudge/nudge-tab-nav";
import { ThemeToggle } from "@/components/nudge/theme-toggle";
import { displayCurrencyItems, useCurrency } from "@/context/currency-context";
import type { DisplayCurrency } from "@/lib/currency-config";

type TabKey = NudgeTabKey;

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

function CommandBarCurrencySelect() {
  const { currency, setCurrency } = useCurrency();
  const items = displayCurrencyItems();
  return (
    <Select.Root value={currency} onValueChange={(v) => setCurrency(v as DisplayCurrency)}>
      <Select.Trigger
        placeholder="Currency"
        aria-label="Display currency"
        className="nudge-cmdbar-currency"
      />
      <Select.Content>
        {items.map((it) => (
          <Select.Item key={it.code} value={it.code}>
            {it.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}

function SignOutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <button type="submit" className="nudge-cmdbar-link">
        Sign out
      </button>
    </form>
  );
}

export function NudgeApp(props: { devMode: boolean; showSignOut?: boolean }) {
  const [tab, setTab] = useState<TabKey>("overview");
  const today = format(new Date(), "EEEE, MMMM d");

  return (
    <div className="nudge-app-shell mx-auto flex min-h-0 w-full max-w-[88rem] flex-1 flex-col gap-7 overflow-x-hidden px-4 py-6 sm:gap-8 sm:px-8 sm:py-8">
      {/* ───── Masthead ───── */}
      <header
        className="flex flex-col gap-5 border-b pb-6 sm:gap-4 sm:border-0 sm:pb-0"
        style={{ borderColor: "var(--hairline)" }}
      >
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
          {/* Mobile-only actions; desktop puts these in the command bar */}
          <div className="flex items-center gap-3 sm:hidden">
            {props.showSignOut ? (
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                >
                  Sign out
                </button>
              </form>
            ) : null}
            <ThemeToggle />
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

        {/* Mobile-only currency selector; desktop puts this in the command bar */}
        <div className="flex flex-wrap items-end justify-between gap-4 sm:hidden">
          <HeaderCurrencySelect />
        </div>
      </header>

      {/* ───── Command bar (desktop) + bottom tab bar (mobile) ───── */}
      <NudgeTabNav
        value={tab}
        onChange={setTab}
        desktopRight={
          <>
            <CommandBarCurrencySelect />
            <span
              aria-hidden
              className="nudge-cmdbar-divider"
              style={{ background: "var(--hairline-strong)" }}
            />
            {props.showSignOut ? <SignOutButton /> : null}
            <ThemeToggle />
          </>
        }
      />

      <div
        role="tabpanel"
        className="min-h-[min(320px,50vh)] min-w-0 flex-1"
      >
        {tab === "overview" ? <DashboardTab /> : null}
        {tab === "activity" ? <ActivityTab /> : null}
        {tab === "insights" ? <InsightsTab /> : null}
        {tab === "budgets" ? <BudgetsTab /> : null}
        {tab === "goals" ? <GoalsTab /> : null}
      </div>

      <QuickAddExpenseButton variant="fab" />
    </div>
  );
}

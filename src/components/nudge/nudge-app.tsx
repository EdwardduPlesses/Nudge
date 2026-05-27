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
import {
  NudgeMobileTabBar,
  NudgeTopBar,
  type NudgeTabKey,
} from "@/components/nudge/nudge-tab-nav";
import { SharingDialog } from "@/components/nudge/sharing-dialog";
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
          className="min-h-10 w-full max-w-[min(100%,16rem)]"
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

function TopBarCurrencySelect() {
  const { currency, setCurrency } = useCurrency();
  const items = displayCurrencyItems();
  return (
    <Select.Root value={currency} onValueChange={(v) => setCurrency(v as DisplayCurrency)}>
      <Select.Trigger
        placeholder="Currency"
        aria-label="Display currency"
        className="nudge-topbar-currency"
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
      <button type="submit" className="nudge-topbar-link">
        Sign out
      </button>
    </form>
  );
}

export function NudgeApp(props: { devMode: boolean; showSignOut?: boolean }) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [shareOpen, setShareOpen] = useState(false);
  const today = format(new Date(), "EEEE, MMMM d");
  const edition = format(new Date(), "yy.MM");

  return (
    <>
      <SharingDialog open={shareOpen} onOpenChange={setShareOpen} />

      {/* ───── Desktop top app bar (full-bleed, sticky) ───── */}
      <NudgeTopBar
        value={tab}
        onChange={setTab}
        actions={
          <>
            <TopBarCurrencySelect />
            <button
              type="button"
              className="nudge-topbar-link"
              onClick={() => setShareOpen(true)}
            >
              Share
            </button>
            <span aria-hidden className="nudge-topbar-divider" />
            {props.showSignOut ? <SignOutButton /> : null}
            <ThemeToggle />
          </>
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
                onClick={() => setShareOpen(true)}
              >
                Share
              </button>
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

          <div className="flex flex-wrap items-end justify-between gap-4">
            <HeaderCurrencySelect />
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

        {/* ───── Content ───── */}
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
      </div>

      {/* ───── Mobile bottom tab bar (fixed) ───── */}
      <NudgeMobileTabBar value={tab} onChange={setTab} />

      <QuickAddExpenseButton variant="fab" />
    </>
  );
}

"use client";

import { useState } from "react";
import { Heading, Tabs, Text } from "frosted-ui";
import { ActivityTab } from "@/components/nudge/activity-tab";
import { BudgetsTab } from "@/components/nudge/budgets-tab";
import { DashboardTab } from "@/components/nudge/dashboard-tab";
import { GoalsTab } from "@/components/nudge/goals-tab";

type TabKey = "overview" | "activity" | "budgets" | "goals";

export function NudgeApp(props: { devMode: boolean }) {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-6">
      <header className="flex flex-col gap-1 border-b border-gold-primary/20 pb-4 sm:pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold text-white shadow-sm ring-1 ring-white/25"
              style={{ background: "var(--gold-gradient)" }}
              aria-hidden
            >
              N
            </div>
            <div className="min-w-0">
              <Heading size="6" className="text-gold-primary">
                Nudge
              </Heading>
              <Text size="2" color="gray" className="leading-snug">
                Budget clarity, without the spreadsheet.
              </Text>
            </div>
          </div>
          {props.devMode ? (
            <Text size="1" color="amber" className="max-w-[220px] leading-snug sm:max-w-none">
              Local dev preview — open in Whop for full sign-in.
            </Text>
          ) : null}
        </div>
      </header>

      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex min-h-0 flex-1 flex-col">
        <div className="-mx-1 px-1">
          <Tabs.List
            size="2"
            className="w-full min-w-0 max-w-full justify-start overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:max-w-xl [&::-webkit-scrollbar]:hidden"
          >
            <Tabs.Trigger value="overview" className="shrink-0">
              Overview
            </Tabs.Trigger>
            <Tabs.Trigger value="activity" className="shrink-0">
              Activity
            </Tabs.Trigger>
            <Tabs.Trigger value="budgets" className="shrink-0">
              Budgets
            </Tabs.Trigger>
            <Tabs.Trigger value="goals" className="shrink-0">
              Goals
            </Tabs.Trigger>
          </Tabs.List>
        </div>

        <div className="mt-4 min-h-[min(320px,50vh)] flex-1 sm:mt-6">
          <Tabs.Content value="overview">
            <DashboardTab />
          </Tabs.Content>
          <Tabs.Content value="activity">
            <ActivityTab />
          </Tabs.Content>
          <Tabs.Content value="budgets">
            <BudgetsTab />
          </Tabs.Content>
          <Tabs.Content value="goals">
            <GoalsTab />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}

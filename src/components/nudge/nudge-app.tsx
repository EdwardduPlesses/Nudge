"use client";

import { useState } from "react";
import { Heading, Tabs, Text } from "frosted-ui";
import { ActivityTab } from "@/components/nudge/activity-tab";
import { BudgetsTab } from "@/components/nudge/budgets-tab";
import { DashboardTab } from "@/components/nudge/dashboard-tab";
import { GoalsTab } from "@/components/nudge/goals-tab";

type TabKey = "overview" | "activity" | "budgets" | "goals";

export function NudgeApp(props: { experienceId: string; devMode: boolean }) {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1 border-b border-gray-500/20 pb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg font-semibold text-white shadow-sm"
              style={{ background: "#12a594" }}
              aria-hidden
            >
              N
            </div>
            <div>
              <Heading size="6">Nudge</Heading>
              <Text size="2" color="gray">
                Budget clarity, without the spreadsheet.
              </Text>
            </div>
          </div>
          {props.devMode ? (
            <Text size="1" color="amber">
              Dev preview — open inside Whop for signed-in saves per member.
            </Text>
          ) : null}
        </div>
      </header>

      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <Tabs.List size="2" className="w-full max-w-xl">
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="activity">Activity</Tabs.Trigger>
          <Tabs.Trigger value="budgets">Budgets</Tabs.Trigger>
          <Tabs.Trigger value="goals">Goals</Tabs.Trigger>
        </Tabs.List>

        <div className="mt-6 min-h-[320px]">
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

      <footer className="mt-auto border-t border-gray-500/15 pt-6">
        <Text size="1" color="gray">
          Experience {props.experienceId} · Local-first storage in your browser
        </Text>
      </footer>
    </div>
  );
}

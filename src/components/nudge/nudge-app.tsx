"use client";

import Image from "next/image";
import { useState } from "react";
import { Heading, Select, Tabs, Text } from "frosted-ui";
import nudgeLogo from "@/app/assets/Nuget_logo_nobackfournd.png";
import { ActivityTab } from "@/components/nudge/activity-tab";
import { BudgetsTab } from "@/components/nudge/budgets-tab";
import { DashboardTab } from "@/components/nudge/dashboard-tab";
import { GoalsTab } from "@/components/nudge/goals-tab";
import { displayCurrencyItems, useCurrency } from "@/context/currency-context";
import type { DisplayCurrency } from "@/lib/currency-config";

type TabKey = "overview" | "activity" | "budgets" | "goals";

function HeaderCurrencySelect() {
  const { currency, setCurrency } = useCurrency();
  const items = displayCurrencyItems();

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Text size="1" weight="medium" color="gray" className="tracking-wide uppercase">
        Currency
      </Text>
      <Select.Root value={currency} onValueChange={(v) => setCurrency(v as DisplayCurrency)}>
        <Select.Trigger placeholder="Currency" className="min-h-10 w-full max-w-[min(100%,16rem)] sm:max-w-[18rem]" />
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

  return (
    <div className="nudge-app-shell mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 overflow-x-hidden px-4 py-5 sm:gap-7 sm:px-6 sm:py-6">
      <header className="flex flex-col gap-1 border-b border-gold-primary/20 pb-4 sm:pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-11 w-11 shrink-0">
              <Image
                src={nudgeLogo}
                alt=""
                width={44}
                height={44}
                className="h-full w-full object-contain object-center"
                priority
              />
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
          <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-end sm:justify-end sm:gap-4">
            <HeaderCurrencySelect />
            {props.devMode ? (
              <Text size="1" color="amber" className="max-w-[220px] leading-snug sm:max-w-none sm:pt-6">
                Local dev preview — open in Whop for full sign-in.
              </Text>
            ) : null}
          </div>
        </div>
      </header>

      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex min-h-0 flex-1 flex-col">
        <div className="-mx-1 rounded-2xl border border-gold-primary/15 bg-black/[0.025] p-1 dark:bg-white/[0.04]">
          <Tabs.List
            size="2"
            className="w-full min-w-0 max-w-full justify-start gap-0 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] sm:max-w-xl [&::-webkit-scrollbar]:hidden"
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

        <div className="mt-4 min-h-[min(320px,50vh)] min-w-0 flex-1 sm:mt-6">
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

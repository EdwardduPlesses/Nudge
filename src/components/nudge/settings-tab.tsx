"use client";

import { useState } from "react";
import { Select } from "frosted-ui";
import { SharingDialog } from "@/components/nudge/sharing-dialog";
import { ThemeToggle } from "@/components/nudge/theme-toggle";
import { displayCurrencyItems, useCurrency } from "@/context/currency-context";
import { useNudgeBudget } from "@/context/nudge-budget-context";
import type { DisplayCurrency } from "@/lib/currency-config";

function Row(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b py-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--hairline)" }}>
      <div className="min-w-0">
        <span className="eyebrow block">{props.label}</span>
        {props.hint ? <span style={{ color: "var(--ink-muted)", fontSize: "0.82rem" }}>{props.hint}</span> : null}
      </div>
      <div className="shrink-0">{props.children}</div>
    </div>
  );
}

const ANCHOR_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export function SettingsTab(props: { showSignOut?: boolean }) {
  const { currencyCode, changeCurrency } = useCurrency();
  const { periodAnchorDay, setPeriodAnchorDay } = useNudgeBudget();
  const [shareOpen, setShareOpen] = useState(false);
  const items = displayCurrencyItems();

  return (
    <div className="flex flex-col gap-7">
      <header>
        <span className="eyebrow"><span className="eyebrow-gold">N°00</span>
          <span aria-hidden style={{ margin: "0 0.5em", color: "var(--ink-faint)" }}>—</span>Preferences</span>
        <h2 className="heading-display mt-3" style={{ color: "var(--ink)", fontSize: "clamp(1.6rem, 3.6vw, 2.15rem)", lineHeight: 1.1 }}>Settings</h2>
      </header>

      <section className="atelier-card px-4 py-2 sm:px-6">
        <Row label="Display currency" hint="Changing this converts all amounts at today's rate.">
          <Select.Root value={currencyCode} onValueChange={(v) => void changeCurrency(v as DisplayCurrency)}>
            <Select.Trigger placeholder="Currency" aria-label="Display currency" className="min-h-10 min-w-[12rem]" />
            <Select.Content>
              {items.map((it) => (<Select.Item key={it.code} value={it.code}>{it.label}</Select.Item>))}
            </Select.Content>
          </Select.Root>
        </Row>

        <Row label="Budget cycle" hint="The day each budget period starts.">
          <Select.Root value={String(periodAnchorDay)} onValueChange={(v) => void setPeriodAnchorDay(Number(v))}>
            <Select.Trigger placeholder="Day" aria-label="Budget cycle start day" className="min-h-10 min-w-[12rem]" />
            <Select.Content>
              {ANCHOR_DAYS.map((d) => (<Select.Item key={d} value={String(d)}>{`Day ${d}`}</Select.Item>))}
              <Select.Item value="31">Last day of month</Select.Item>
            </Select.Content>
          </Select.Root>
        </Row>

        <Row label="Sharing" hint="Invite one other person to share this budget.">
          <button type="button" className="nudge-topbar-link" onClick={() => setShareOpen(true)}>Manage →</button>
        </Row>

        <Row label="Appearance" hint="Light or dark theme.">
          <ThemeToggle />
        </Row>

        {props.showSignOut ? (
          <Row label="Account">
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="nudge-topbar-link">Sign out</button>
            </form>
          </Row>
        ) : null}
      </section>

      <SharingDialog open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}

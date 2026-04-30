"use client";

import { Theme } from "frosted-ui";
import type { ReactNode } from "react";
import { WhopIframeSdkProvider } from "@whop/react/iframe";

/**
 * Mirrors {@link import("@whop/react/components").WhopApp} minus `WhopThemeScript`, which renders
 * an inline `<script>` and triggers React’s client warning. Root `layout` already pins `dark` on
 * `<html>` so the theme bootstrap script is redundant for this app.
 */
export function NudgeWhopShell(props: { children: ReactNode }) {
  return (
    <WhopIframeSdkProvider>
      <Theme accentColor="gold" appearance="dark" className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">{props.children}</div>
      </Theme>
    </WhopIframeSdkProvider>
  );
}

import type { Metadata, Viewport } from "next";
import { NudgeWhopShell } from "@/components/nudge-whop-shell";
import "frosted-ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nudge",
  description: "Track spending, budgets, and savings goals inside Whop.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col antialiased">
        <NudgeWhopShell>{children}</NudgeWhopShell>
      </body>
    </html>
  );
}

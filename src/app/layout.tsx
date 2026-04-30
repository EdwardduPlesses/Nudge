import type { Metadata } from "next";
import { WhopApp } from "@whop/react/components";
import "frosted-ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nudge",
  description: "Track spending, budgets, and savings goals inside Whop.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-dvh flex-col antialiased">
        <WhopApp accentColor="gold" appearance="inherit" className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </WhopApp>
      </body>
    </html>
  );
}

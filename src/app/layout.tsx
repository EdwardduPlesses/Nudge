import type { Metadata } from "next";
import { WhopApp } from "@whop/react/components";
import "frosted-ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nudge — budget for Whop",
  description:
    "Nudge helps members track spending, category budgets, and savings goals with a calm dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased">
        <WhopApp accentColor="jade" appearance="inherit">
          {children}
        </WhopApp>
      </body>
    </html>
  );
}

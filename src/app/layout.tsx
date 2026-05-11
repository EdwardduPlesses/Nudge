import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { NudgeWhopShell } from "@/components/nudge-whop-shell";
import "frosted-ui/styles.css";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT"],
});

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Nudge",
  description: "Track spending, budgets, and savings goals inside Whop.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeBootScript = `
(function(){
  try {
    var stored = localStorage.getItem('lm-theme');
    var prefers = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    var theme = stored === 'light' || stored === 'dark' ? stored : (stored ? 'dark' : prefers);
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.remove('light','dark');
    root.classList.add(theme);
    root.style.colorScheme = theme;
  } catch (_) {
    document.documentElement.setAttribute('data-theme','dark');
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }
})();
`.trim();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`h-full dark ${fraunces.variable} ${manrope.variable}`}
      style={{ colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <NudgeWhopShell>{children}</NudgeWhopShell>
      </body>
    </html>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Dialog, Text } from "frosted-ui";

export function AiMoneyPlanModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: string;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  function handleOpenChange(next: boolean) {
    if (!next) {
      setCopied(false);
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
        copiedTimer.current = null;
      }
    }
    props.onOpenChange(next);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(props.prompt);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog.Root open={props.open} onOpenChange={handleOpenChange}>
      <Dialog.Content
        size="4"
        className="flex max-h-[calc(100dvh-1.5rem)] max-w-[min(calc(100vw-1.25rem),40rem)] flex-col gap-4 overflow-y-auto overscroll-contain"
      >
        <Dialog.Title>Your AI Money Plan Prompt</Dialog.Title>
        <Text size="2" color="gray" className="leading-relaxed">
          Copy everything below into ChatGPT, Claude, or another assistant. Your prompt asks for a structured **Markdown** money plan — tables, a health scorecard, ASCII bar breakdown, week-by-week plan, and short bullets — so the reply stays easy to scan.
        </Text>

        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-600/15 bg-gray-900/25 dark:bg-black/35">
          <pre
            tabIndex={0}
            className="max-h-[min(420px,calc(100dvh-14rem))] overflow-y-auto p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap wrap-break-word outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35"
          >
            {props.prompt}
          </pre>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Dialog.Close>
            <Button variant="soft" color="gray" size="3" type="button" className="w-full sm:w-auto">
              Close
            </Button>
          </Dialog.Close>
          <Button
            type="button"
            size="3"
            color="gold"
            className="w-full shadow-sm sm:w-auto"
            onClick={() => void copyPrompt()}
          >
            {copied ? "Copied" : "Copy Prompt"}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

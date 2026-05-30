"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Dialog, Text } from "frosted-ui";

const CHATGPT_PREFILL = "https://chatgpt.com/?q=";
const CLAUDE_PREFILL = "https://claude.ai/new?q=";
// Beyond this encoded length a prefilled URL is unreliable, so we fall back to the
// clipboard and just open the assistant's home so the user can paste.
const URL_PREFILL_MAX = 6000;

export function AiMoneyPlanModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  function resetCopyState() {
    setCopied(false);
    setCopyError(false);
    if (copiedTimer.current) {
      clearTimeout(copiedTimer.current);
      copiedTimer.current = null;
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetCopyState();
    props.onOpenChange(next);
  }

  function selectPromptText() {
    const el = preRef.current;
    if (!el || typeof window === "undefined") return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  async function copyPrompt(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(props.prompt);
      setCopied(true);
      setCopyError(false);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      // Clipboard APIs are flaky in webviews / insecure contexts. Surface the failure
      // and select the text so the user can copy it manually.
      setCopied(false);
      setCopyError(true);
      selectPromptText();
      return false;
    }
  }

  async function openIn(prefillBase: string) {
    await copyPrompt();
    if (typeof window === "undefined") return;
    const encoded = encodeURIComponent(props.prompt);
    const url =
      encoded.length <= URL_PREFILL_MAX
        ? `${prefillBase}${encoded}`
        : prefillBase.split("?")[0];
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog.Root open={props.open} onOpenChange={handleOpenChange}>
      <Dialog.Content
        size="4"
        className="flex max-h-[calc(100dvh-1.5rem)] max-w-[min(calc(100vw-1.25rem),40rem)] flex-col gap-4 overflow-y-auto overscroll-contain"
      >
        <Dialog.Title>Your AI Money Plan Prompt</Dialog.Title>
        <Text size="2" color="gray" className="leading-relaxed">
          Open it in an assistant below, or copy it into ChatGPT, Claude, or another tool. It asks
          for a structured plan — tables, a health summary, a week-by-week plan and short bullets —
          so the reply stays easy to scan.
        </Text>
        <Text size="1" color="gray" className="leading-relaxed opacity-80">
          Heads up: this prompt contains your income, budgets, recent transactions, goals and debts.
          Sending it to an outside assistant shares that data with that provider — review their
          privacy and training settings first.
        </Text>

        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-600/15 bg-gray-900/25 dark:bg-black/35">
          <pre
            ref={preRef}
            tabIndex={0}
            className="max-h-[min(420px,calc(100dvh-16rem))] overflow-y-auto p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap wrap-break-word outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35"
          >
            {props.prompt}
          </pre>
        </div>

        {copyError ? (
          <Text size="1" color="red" className="leading-relaxed">
            Couldn’t copy automatically — the prompt is selected above. Press Ctrl/Cmd + C to copy
            it, then paste it into your assistant.
          </Text>
        ) : null}

        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Dialog.Close>
            <Button variant="soft" color="gray" size="3" type="button" className="w-full sm:w-auto">
              Close
            </Button>
          </Dialog.Close>
          <Button
            type="button"
            variant="soft"
            size="3"
            className="w-full sm:w-auto"
            onClick={() => void openIn(CHATGPT_PREFILL)}
          >
            Open in ChatGPT
          </Button>
          <Button
            type="button"
            variant="soft"
            size="3"
            className="w-full sm:w-auto"
            onClick={() => void openIn(CLAUDE_PREFILL)}
          >
            Open in Claude
          </Button>
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

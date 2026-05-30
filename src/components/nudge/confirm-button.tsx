"use client";

import type { ReactNode } from "react";
import { AlertDialog, Button } from "frosted-ui";

/**
 * Wraps a trigger in a confirmation dialog before running a destructive action.
 * Used for irreversible deletes (transactions, goals, debts, recurring items) so a
 * single mis-tap can't permanently destroy a record.
 */
export function ConfirmButton(props: {
  trigger: ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger>{props.trigger}</AlertDialog.Trigger>
      <AlertDialog.Content size="2" className="max-w-[min(calc(100vw-1.5rem),26rem)]">
        <AlertDialog.Title>{props.title}</AlertDialog.Title>
        {props.description ? (
          <AlertDialog.Description size="2" color="gray">
            {props.description}
          </AlertDialog.Description>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialog.Cancel>
            <Button type="button" variant="soft" color="gray" size="2" className="w-full sm:w-auto">
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button
              type="button"
              color="ruby"
              size="2"
              className="w-full sm:w-auto"
              onClick={props.onConfirm}
            >
              {props.confirmLabel ?? "Delete"}
            </Button>
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}

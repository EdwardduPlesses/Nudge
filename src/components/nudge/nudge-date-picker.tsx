"use client";

import { CalendarDate, parseDate } from "@internationalized/date";
import { Button, DatePicker, Text } from "frosted-ui";
import type { ReactNode } from "react";

function isoToCalendarDate(iso: string): CalendarDate | null {
  const s = iso.trim();
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  try {
    return parseDate(s);
  } catch {
    return null;
  }
}

type NudgeDatePickerProps = {
  label: ReactNode;
  /** Rendered after the label in muted style, e.g. "(optional)" */
  optionalSuffix?: ReactNode;
  /** ISO `yyyy-MM-dd`; empty string = no date */
  value: string;
  onChange: (isoDate: string) => void;
  /** Show a clear control when there is a value (optional deadlines) */
  allowClear?: boolean;
  /** Accessible name when label is not plain text */
  ariaLabel?: string;
  className?: string;
};

export function NudgeDatePicker(props: NudgeDatePickerProps) {
  const cal = isoToCalendarDate(props.value);

  return (
    <div className={props.className}>
      <Text size="2" weight="medium" className="mb-2 block text-foreground/80">
        {props.label}
        {props.optionalSuffix ? (
          <span className="font-normal text-gray-500"> {props.optionalSuffix}</span>
        ) : null}
      </Text>
      <div className="flex w-full min-w-0 items-center gap-2">
        <DatePicker
          aria-label={props.ariaLabel}
          className="nudge-date-picker-root"
          color="gold"
          size="3"
          value={cal}
          onChange={(v) => props.onChange(v ? v.toString() : "")}
        />
        {props.allowClear && props.value.trim() !== "" ? (
          <Button
            type="button"
            variant="ghost"
            color="gray"
            size="2"
            className="shrink-0"
            onClick={() => props.onChange("")}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { TranslationKey } from "@/lib/i18n";
import type { DecryptedCalendar } from "@/types/calendar";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, SegmentedToggle, Switch } from "@aster/ui";

import { calendar_now } from "@/services/calendar/view_zone";

import {
  DateField,
  from_iso_date,
  to_iso_date,
} from "@/components/calendar/date_field";
import { CalendarSelect } from "@/components/calendar/calendar_select";
import {
  TimeField,
  time_value_to_minutes,
} from "@/components/calendar/time_field";
import { event_color_token } from "@/components/calendar/calendar_utils";
import { parse_quick_input } from "@/components/calendar/quick_parse";
import { use_focus_trap } from "@/lib/use_dialog_shell";
import { use_visible_viewport } from "@/components/calendar/use_visible_viewport";

const POPOVER_WIDTH = 440;
const VIEWPORT_MARGIN = 12;
const FOLLOW_FRAMES = 45;
const ANCHOR_GAP = 8;
const MOBILE_QUERY = "(max-width: 639px)";
const TIME_STEP_MINUTES = 15;
const MINUTES_PER_DAY = 1440;
function all_day_span_days(
  range: { start: Date; end: Date; is_all_day: boolean } | null,
): number {
  if (!range || !range.is_all_day) {
    return 1;
  }

  const start = new Date(range.start);
  const end = new Date(range.end);

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

  return Number.isFinite(span) ? Math.min(Math.max(span, 1), 366) : 1;
}

function end_of_all_day_span(day: Date, span_days: number): Date {
  const end = new Date(day);

  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + span_days);

  return new Date(end.getTime() - 1);
}
const PARSE_DELAY_MS = 280;

const TIME_OPTIONS = Array.from(
  { length: MINUTES_PER_DAY / TIME_STEP_MINUTES },
  (_, index) => index * TIME_STEP_MINUTES,
);

export type QuickCreateKind = "default" | "task";

export interface QuickCreateDraft {
  title: string;
  location: string;
  attendees: string[];
  calendar_id: string;
  starts_at: Date;
  ends_at: Date;
  is_all_day: boolean;
  event_kind?: QuickCreateKind;
}

export interface QuickCreatePreview {
  range_key: string;
  title: string;
  color: string | undefined;
  starts_at: Date;
  ends_at: Date;
  is_all_day: boolean;
}

interface QuickCreatePopoverProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  range: { start: Date; end: Date; is_all_day: boolean } | null;
  calendars: DecryptedCalendar[];
  default_calendar_id: string | null;
  time_format: "12h" | "24h";
  language: string;
  week_start_day: number;
  on_dismiss: () => void;
  on_save: (draft: QuickCreateDraft) => void | Promise<void>;
  on_more_options: (draft: QuickCreateDraft) => void;
  on_preview_change?: (preview: QuickCreatePreview | null) => void;
}

interface Placement {
  top: number;
  left: number;
  origin: string;
}

function minutes_of(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function snap_minutes(value: number): number {
  const snapped = Math.round(value / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;

  return Math.min(Math.max(snapped, 0), MINUTES_PER_DAY - TIME_STEP_MINUTES);
}

function minutes_to_time_value(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function with_value(options: number[], value: number): number[] {
  return options.includes(value)
    ? options
    : [...options, value].sort((left, right) => left - right);
}

function apply_minutes(day: Date, minutes: number): Date {
  const result = new Date(day);

  result.setHours(0, minutes, 0, 0);

  return result;
}

function place_card(anchor: DOMRect | null, card_height: number): Placement {
  const max_top = Math.max(
    VIEWPORT_MARGIN,
    window.innerHeight - card_height - VIEWPORT_MARGIN,
  );
  const max_left = Math.max(
    VIEWPORT_MARGIN,
    window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN,
  );
  const clamp_top = (value: number) =>
    Math.min(Math.max(VIEWPORT_MARGIN, value), max_top);
  const clamp_left = (value: number) =>
    Math.min(Math.max(VIEWPORT_MARGIN, value), max_left);

  if (!anchor) {
    return {
      left: clamp_left((window.innerWidth - POPOVER_WIDTH) / 2),
      origin: "center",
      top: clamp_top((window.innerHeight - card_height) / 2),
    };
  }

  const fits_right =
    anchor.right + ANCHOR_GAP + POPOVER_WIDTH + VIEWPORT_MARGIN <=
    window.innerWidth;
  const fits_left = anchor.left - ANCHOR_GAP - POPOVER_WIDTH >= VIEWPORT_MARGIN;

  if (fits_right || fits_left) {
    return {
      left: fits_right
        ? anchor.right + ANCHOR_GAP
        : anchor.left - POPOVER_WIDTH - ANCHOR_GAP,
      origin: fits_right ? "top left" : "top right",
      top: clamp_top(anchor.top - 8),
    };
  }

  const fits_below =
    anchor.bottom + ANCHOR_GAP + card_height + VIEWPORT_MARGIN <=
    window.innerHeight;

  return {
    left: clamp_left(anchor.left),
    origin: fits_below ? "top left" : "bottom left",
    top: fits_below
      ? anchor.bottom + ANCHOR_GAP
      : clamp_top(anchor.top - card_height - ANCHOR_GAP),
  };
}

function keep_card_in_view(
  placement: Placement,
  card_height: number,
): Placement {
  const max_top = Math.max(
    VIEWPORT_MARGIN,
    window.innerHeight - card_height - VIEWPORT_MARGIN,
  );
  const top = Math.min(Math.max(VIEWPORT_MARGIN, placement.top), max_top);

  return top === placement.top ? placement : { ...placement, top };
}

export function QuickCreatePopover({
  t,
  range,
  calendars,
  default_calendar_id,
  time_format,
  language,
  week_start_day,
  on_dismiss,
  on_save,
  on_more_options,
  on_preview_change,
}: QuickCreatePopoverProps) {
  const title_ref = useRef<HTMLInputElement>(null);
  const layer_id = useMemo(() => Symbol("quick_create_popover"), []);

  const [input, set_input] = useState("");
  const [parse_input, set_parse_input] = useState("");
  const [calendar_id, set_calendar_id] = useState("");
  const [event_kind, set_event_kind] = useState<QuickCreateKind>("default");
  const [is_saving, set_is_saving] = useState(false);
  const [placement, set_placement] = useState<Placement | null>(null);
  const placed_key_ref = useRef<string | null>(null);
  const painted_key_ref = useRef<string | null>(null);
  const [is_following, set_is_following] = useState(false);
  const [synced_key, set_synced_key] = useState<string | null>(null);
  const time_row_ref = useRef<HTMLDivElement>(null);
  const calendar_field_ref = useRef<HTMLDivElement>(null);
  const [calendar_menu, set_calendar_menu] = useState<{
    side: "top" | "bottom";
    max_height: number;
  } | null>(null);
  const [day_value, set_day_value] = useState("");
  const [start_minutes, set_start_minutes] = useState(9 * 60);
  const [end_minutes, set_end_minutes] = useState(10 * 60);
  const [is_all_day, set_is_all_day] = useState(false);
  const [has_manual_time, set_has_manual_time] = useState(false);
  const [is_mobile, set_is_mobile] = useState(
    () => window.matchMedia(MOBILE_QUERY).matches,
  );

  const range_key = range
    ? `${range.start.toISOString()}_${range.end.toISOString()}`
    : null;
  const card_ref = use_focus_trap<HTMLDivElement>(range_key !== null, layer_id);
  const visible_viewport = use_visible_viewport(
    range_key !== null && is_mobile,
  );

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const handle = (changed: MediaQueryListEvent) =>
      set_is_mobile(changed.matches);

    media.addEventListener("change", handle);

    return () => media.removeEventListener("change", handle);
  }, []);

  const range_all_day = range?.is_all_day ?? false;
  const span_days = all_day_span_days(range);
  const calendars_ref = useRef(calendars);
  const range_defaults_ref = useRef({
    day: "",
    is_all_day: false,
    start: 9 * 60,
    end: 10 * 60,
  });

  calendars_ref.current = calendars;

  useLayoutEffect(() => {
    if (!range_key) {
      set_synced_key(null);

      return;
    }

    const [start_iso, end_iso] = range_key.split("_");
    const range_start = new Date(start_iso);
    const range_end = new Date(end_iso);
    const start = snap_minutes(minutes_of(range_start));
    const raw_end = minutes_of(range_end);
    const end =
      raw_end > minutes_of(range_start)
        ? snap_minutes(raw_end)
        : Math.min(start + 60, MINUTES_PER_DAY - TIME_STEP_MINUTES);

    const defaults = {
      day: to_iso_date(range_start),
      is_all_day: range_all_day,
      start: range_all_day ? 9 * 60 : start,
      end: range_all_day ? 10 * 60 : end,
    };

    range_defaults_ref.current = defaults;
    set_input("");
    set_parse_input("");
    set_event_kind("default");
    set_has_manual_time(false);
    set_day_value(defaults.day);
    set_is_all_day(defaults.is_all_day);
    set_start_minutes(defaults.start);
    set_end_minutes(defaults.end);
    set_calendar_id(
      calendars_ref.current.find(
        (calendar) => calendar.id === default_calendar_id,
      )?.id ??
        calendars_ref.current.find((calendar) => calendar.is_default)?.id ??
        calendars_ref.current[0]?.id ??
        "",
    );
    set_synced_key(range_key);
  }, [range_key, range_all_day, default_calendar_id]);

  const parse_reference = useMemo(
    () => (range_key ? new Date(range_key.split("_")[0]) : calendar_now()),
    [range_key],
  );

  useEffect(() => {
    const timer = window.setTimeout(
      () => set_parse_input(input),
      PARSE_DELAY_MS,
    );

    return () => window.clearTimeout(timer);
  }, [input]);

  const parsed = useMemo(
    () =>
      parse_quick_input(parse_input, {
        language,
        reference: parse_reference,
      }),
    [parse_input, language, parse_reference],
  );

  useEffect(() => {
    if (has_manual_time || !range_key) {
      return;
    }

    const defaults = range_defaults_ref.current;

    set_day_value(parsed.date ? to_iso_date(parsed.date) : defaults.day);

    if (parsed.start_minutes !== null) {
      set_is_all_day(false);
      set_start_minutes(snap_minutes(parsed.start_minutes));
      set_end_minutes(
        snap_minutes(
          parsed.end_minutes ??
            Math.min(parsed.start_minutes + 60, MINUTES_PER_DAY),
        ),
      );

      return;
    }

    if (parsed.is_all_day) {
      set_is_all_day(true);

      return;
    }

    set_is_all_day(defaults.is_all_day);
    set_start_minutes(defaults.start);
    set_end_minutes(defaults.end);
  }, [parsed, has_manual_time, range_key]);

  const has_hint = parsed.has_match && parsed.title !== parse_input.trim();

  const preview_color = (
    calendars.find((entry) => entry.id === calendar_id) ?? calendars[0]
  )?.color;

  useLayoutEffect(() => {
    if (!on_preview_change) {
      return;
    }

    if (range_key && synced_key !== range_key) {
      return;
    }

    if (!range_key || !day_value) {
      on_preview_change(null);

      return;
    }

    const preview_day = from_iso_date(day_value);

    if (!preview_day) {
      return;
    }

    on_preview_change({
      color: preview_color,
      ends_at: is_all_day
        ? end_of_all_day_span(preview_day, span_days)
        : apply_minutes(
            preview_day,
            Math.min(
              start_minutes + MINUTES_PER_DAY,
              Math.max(end_minutes, start_minutes + TIME_STEP_MINUTES),
            ),
          ),
      is_all_day,
      range_key,
      starts_at: apply_minutes(preview_day, is_all_day ? 0 : start_minutes),
      title: parsed.title,
    });
  }, [
    on_preview_change,
    range_key,
    synced_key,
    day_value,
    start_minutes,
    end_minutes,
    is_all_day,
    span_days,
    preview_color,
    parsed.title,
  ]);

  useLayoutEffect(() => {
    if (!range_key || is_mobile) {
      placed_key_ref.current = null;
      painted_key_ref.current = null;

      if (is_following) {
        set_is_following(false);
      }

      if (placement !== null) {
        set_placement(null);
      }

      return;
    }

    const anchor = document.querySelector("[data-quick-anchor='true']");
    const is_new = placed_key_ref.current !== range_key;
    const card_height = card_ref.current?.offsetHeight ?? 360;

    if (!anchor && !is_new) {
      return;
    }

    const next =
      !is_new && placement && painted_key_ref.current === range_key
        ? keep_card_in_view(placement, card_height)
        : place_card(
            anchor ? anchor.getBoundingClientRect() : null,
            card_height,
          );
    const should_glide = !is_new && painted_key_ref.current === range_key;

    placed_key_ref.current = range_key;

    if (
      placement &&
      placement.left === next.left &&
      placement.top === next.top &&
      placement.origin === next.origin
    ) {
      return;
    }

    if (is_following !== should_glide) {
      set_is_following(should_glide);
    }

    set_placement(next);
  });

  useEffect(() => {
    if (!range_key || is_mobile) {
      return;
    }

    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        painted_key_ref.current = range_key;
      });
    });

    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [range_key, is_mobile]);

  useEffect(() => {
    if (!range_key || is_mobile || placed_key_ref.current !== range_key) {
      return;
    }

    let frame = 0;
    let frames_left = FOLLOW_FRAMES;
    let scrolled = false;

    const follow = () => {
      const anchor = document.querySelector("[data-quick-anchor='true']");

      if (anchor) {
        const rect = anchor.getBoundingClientRect();

        if (
          !scrolled &&
          (rect.top < VIEWPORT_MARGIN ||
            rect.bottom > window.innerHeight - VIEWPORT_MARGIN)
        ) {
          scrolled = true;
          anchor.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        const next = place_card(rect, card_ref.current?.offsetHeight ?? 360);

        if (scrolled) {
          set_is_following(false);
        }

        set_placement((current) =>
          current &&
          current.left === next.left &&
          current.top === next.top &&
          current.origin === next.origin
            ? current
            : next,
        );
      }

      frames_left -= 1;

      if (frames_left > 0) {
        frame = requestAnimationFrame(follow);
      }
    };

    frame = requestAnimationFrame(follow);

    return () => cancelAnimationFrame(frame);
  }, [range_key, is_mobile]);

  useEffect(() => {
    if (!range_key) {
      return;
    }

    const frame = requestAnimationFrame(() =>
      title_ref.current?.focus({ preventScroll: true }),
    );

    return () => cancelAnimationFrame(frame);
  }, [range_key]);

  useEffect(() => {
    if (!range_key) {
      return;
    }

    const handle_key = (pressed: KeyboardEvent) => {
      if (pressed.key === "Escape") {
        pressed.stopPropagation();
        on_dismiss();
      }
    };

    const handle_outside = (clicked: MouseEvent) => {
      const target = clicked.target as HTMLElement | null;

      if (target?.closest("[data-radix-popper-content-wrapper]")) {
        return;
      }

      if (
        card_ref.current &&
        !card_ref.current.contains(clicked.target as Node)
      ) {
        on_dismiss();
      }
    };

    document.addEventListener("keydown", handle_key);
    document.addEventListener("mousedown", handle_outside);

    return () => {
      document.removeEventListener("keydown", handle_key);
      document.removeEventListener("mousedown", handle_outside);
    };
  }, [range_key, on_dismiss]);

  const time_formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        hour: "numeric",
        hour12: time_format === "12h",
        minute: "2-digit",
      }),
    [language, time_format],
  );

  if (!range) {
    return null;
  }

  const format_minutes = (value: number) =>
    time_formatter.format(apply_minutes(new Date(2026, 0, 1), value));
  const format_time_value = (value: string) =>
    format_minutes(time_value_to_minutes(value));

  const latest =
    parse_input === input
      ? parsed
      : parse_quick_input(input, { language, reference: parse_reference });
  const is_pending = latest !== parsed && !has_manual_time;
  const pending_start = is_pending ? latest.start_minutes : null;
  const draft_day_value =
    is_pending && latest.date ? to_iso_date(latest.date) : day_value;
  const draft_all_day =
    pending_start !== null
      ? false
      : is_pending && latest.is_all_day
        ? true
        : is_all_day;
  const draft_start =
    pending_start !== null ? snap_minutes(pending_start) : start_minutes;
  const draft_end =
    pending_start !== null
      ? snap_minutes(
          latest.end_minutes ?? Math.min(pending_start + 60, MINUTES_PER_DAY),
        )
      : end_minutes;

  const day =
    (draft_day_value ? from_iso_date(draft_day_value) : undefined) ??
    range.start;
  const effective_start = draft_all_day
    ? apply_minutes(day, 0)
    : apply_minutes(day, draft_start);
  const effective_end = draft_all_day
    ? end_of_all_day_span(day, span_days)
    : apply_minutes(
        day,
        Math.min(
          draft_start + MINUTES_PER_DAY,
          Math.max(draft_end, draft_start + TIME_STEP_MINUTES),
        ),
      );

  const build_draft = (): QuickCreateDraft => ({
    attendees: [],
    calendar_id:
      calendar_id ||
      calendars.find((calendar) => calendar.is_default)?.id ||
      calendars[0]?.id ||
      "",
    ends_at: effective_end,
    event_kind,
    is_all_day: draft_all_day,
    location: "",
    starts_at: effective_start,
    title: latest.title,
  });

  const active_calendar =
    calendars.find((entry) => entry.id === calendar_id) ?? calendars[0];

  const handle_save = async () => {
    if (is_saving) {
      return;
    }

    set_is_saving(true);

    try {
      await on_save(build_draft());
    } finally {
      set_is_saving(false);
    }
  };

  const handle_title_key = (pressed: ReactKeyboardEvent<HTMLInputElement>) => {
    if (pressed.key === "Enter") {
      pressed.preventDefault();
      void handle_save();
    }
  };

  const handle_start_change = (value: string) => {
    const next = Math.min(time_value_to_minutes(value), MINUTES_PER_DAY - 1);
    const span = Math.max(end_minutes - start_minutes, TIME_STEP_MINUTES);

    set_has_manual_time(true);
    set_start_minutes(next);
    set_end_minutes(next + Math.min(span, MINUTES_PER_DAY));
  };

  const fit_calendar_menu = (open: boolean) => {
    const trigger = calendar_field_ref.current?.getBoundingClientRect();

    if (!open || is_mobile || !trigger) {
      return;
    }

    const needed = calendars.length * 36 + 14;
    const time_row = time_row_ref.current?.getBoundingClientRect();
    const below = window.innerHeight - trigger.bottom - 6 - VIEWPORT_MARGIN;
    const above =
      trigger.top - 6 - (time_row ? time_row.top - 8 : VIEWPORT_MARGIN);
    const side = below >= needed || below >= above ? "bottom" : "top";

    set_calendar_menu({
      max_height: Math.max(72, Math.floor(side === "bottom" ? below : above)),
      side,
    });
  };

  const handle_end_change = (value: string) => {
    const next = time_value_to_minutes(value);

    set_has_manual_time(true);
    set_end_minutes(next > start_minutes ? next : next + MINUTES_PER_DAY);
  };

  const card_style: React.CSSProperties = is_mobile
    ? {
        borderRadius:
          "var(--aster-radius-floating) var(--aster-radius-floating) 0 0",
        bottom: visible_viewport?.bottom_inset ?? 0,
        left: 0,
        maxHeight: visible_viewport
          ? Math.max(0, visible_viewport.height - 24)
          : "calc(100dvh - 24px)",
        overflowY: "auto",
        overscrollBehavior: "contain",
        paddingBottom:
          visible_viewport && visible_viewport.bottom_inset > 0
            ? 16
            : "calc(16px + env(safe-area-inset-bottom))",
        right: 0,
        width: "100%",
      }
    : {
        left: placement?.left ?? -9999,
        top: placement?.top ?? -9999,
        width: POPOVER_WIDTH,
        transition: is_following
          ? "left 320ms cubic-bezier(0.16, 1, 0.3, 1), top 320ms cubic-bezier(0.16, 1, 0.3, 1)"
          : undefined,
        ["--radix-popover-content-transform-origin" as string]:
          placement?.origin ?? "top left",
      };

  const control_class =
    "aster_input aster_input_tonal !h-9 min-w-0 flex-1 cursor-pointer items-center justify-start whitespace-nowrap !px-3 !text-[14px] text-txt-primary data-[state=open]:!bg-[var(--aster-field-hover)]";

  return (
    <>
      {is_mobile && (
        <div
          aria-hidden="true"
          className="aster_scrim aster_floating_anim fixed inset-0 z-40"
          data-state="open"
        />
      )}

      <div
        ref={card_ref}
        aria-label={t("calendar.create_event")}
        aria-modal="true"
        className="aster_floating aster_floating_anim fixed z-50 flex flex-col gap-3 rounded-[var(--aster-radius-floating)] p-4"
        data-calendar-surface=""
        data-state="open"
        role="dialog"
        style={card_style}
      >
        <div>
          <input
            ref={title_ref}
            aria-label={t("calendar.event_title")}
            className="aster_input aster_input_tonal !h-11 w-full !px-3.5 !text-[16px]"
            placeholder={t("calendar.quick_create_title_placeholder")}
            type="text"
            value={input}
            onChange={(changed) => set_input(changed.target.value)}
            onKeyDown={handle_title_key}
          />
          {has_hint && (
            <div className="aster_island mt-2 overflow-hidden">
              <p
                aria-live="polite"
                className="truncate px-4 py-2 text-sm text-txt-muted"
              >
                {t("calendar.quick_create_saves_as", {
                  title: parsed.title || t("calendar.untitled_event"),
                })}
              </p>
            </div>
          )}
        </div>

        <SegmentedToggle
          aria-label={t("calendar.quick_create_kind")}
          name="calendar_quick_create_kind"
          options={[
            { label: t("calendar.event_kind_default"), value: "default" },
            { label: t("calendar.event_kind_task"), value: "task" },
          ]}
          value={event_kind}
          on_change={(value) => set_event_kind(value as QuickCreateKind)}
        />

        <div ref={time_row_ref}>
          <div className="flex items-center gap-2">
            <DateField
              aria_label={t("calendar.starts")}
              trigger_class_name={control_class}
              value={day_value}
              week_start_day={week_start_day}
              on_change={(next) => {
                set_has_manual_time(true);
                set_day_value(next);
              }}
            />
            {!is_all_day && (
              <div className="flex shrink-0 items-center gap-1.5">
                <TimeField
                  aria_label={t("calendar.start_time")}
                  data_testid="calendar-quick-start-time"
                  format_label={format_time_value}
                  invalid_message={t("calendar.time_input_invalid")}
                  list_label={t("calendar.time_suggestions")}
                  options={with_value(TIME_OPTIONS, start_minutes).map(
                    minutes_to_time_value,
                  )}
                  value={minutes_to_time_value(start_minutes)}
                  on_change={handle_start_change}
                />
                <span className="text-[14px] text-txt-muted">
                  {t("calendar.time_range_to")}
                </span>
                <TimeField
                  aria_label={t("calendar.end_time")}
                  data_testid="calendar-quick-end-time"
                  format_label={format_time_value}
                  invalid_message={t("calendar.time_input_invalid")}
                  list_label={t("calendar.time_suggestions")}
                  options={with_value(TIME_OPTIONS, end_minutes)
                    .filter(
                      (value) =>
                        value > start_minutes && value < MINUTES_PER_DAY,
                    )
                    .map(minutes_to_time_value)}
                  value={minutes_to_time_value(end_minutes % MINUTES_PER_DAY)}
                  on_change={handle_end_change}
                />
              </div>
            )}
          </div>
        </div>

        <label className="flex h-9 cursor-pointer items-center justify-between gap-3 px-1 text-sm text-txt-primary">
          {t("calendar.all_day")}
          <Switch
            checked={is_all_day}
            size="md"
            onCheckedChange={(checked) => {
              set_has_manual_time(true);
              set_is_all_day(checked);
            }}
          />
        </label>

        <div ref={calendar_field_ref}>
          <CalendarSelect
            full_width
            aria_label={t("calendar.select_calendar")}
            content_avoid_collisions={is_mobile || !calendar_menu}
            content_side={is_mobile ? undefined : calendar_menu?.side}
            content_style={
              !is_mobile && calendar_menu
                ? { maxHeight: calendar_menu.max_height }
                : undefined
            }
            on_open_change={fit_calendar_menu}
            placeholder={t("calendar.no_calendars_title")}
            options={calendars.map((entry) => ({
              value: entry.id,
              text: entry.name,
              label: (
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: event_color_token(entry.color) }}
                  />
                  <span className="truncate">{entry.name}</span>
                </span>
              ),
            }))}
            render_value={() => (
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: event_color_token(active_calendar?.color),
                  }}
                />
                <span className="truncate">
                  {active_calendar?.name ?? t("calendar.event")}
                </span>
              </span>
            )}
            value={active_calendar?.id ?? ""}
            on_change={set_calendar_id}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-[var(--aster-radius-item)] px-2 py-1.5 text-sm font-medium text-[var(--accent-color)] hover:bg-[var(--aster-island-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            type="button"
            onClick={() => on_more_options(build_draft())}
          >
            {t("calendar.more_options")}
          </button>
          <Button
            disabled={is_saving}
            size="md"
            type="button"
            variant="depth"
            onClick={() => void handle_save()}
          >
            {t("common.save")}
          </Button>
        </div>
      </div>
    </>
  );
}

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
import type { KeyboardEvent } from "react";
import type { PublicSchedule } from "@/services/calendar/appointments";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";
import {
  TurnstileWidget,
  TURNSTILE_SITE_KEY,
  type TurnstileWidgetRef,
} from "@/components/auth/turnstile_widget";

import {
  book_public_slot,
  booked_start_keys,
  booking_slot_start,
  fetch_public_schedule,
} from "@/services/calendar/appointments";
import {
  add_days,
  is_same_day,
  start_of_day,
} from "@/components/calendar/calendar_utils";
import { get_first_week_day } from "@/utils/search_operators/dates";
import { use_i18n } from "@/lib/i18n/context";

const DAYS_SHOWN = 14;
const MAX_GUEST_TEXT_LENGTH = 200;
const MAX_NOTE_LENGTH = 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const FOCUS_RING =
  "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-color)]";

type LoadState = "loading" | "ready" | "not_found" | "error";
type Step = "pick" | "details";

interface Slot {
  starts_at: Date;
  key: string;
}

const MIN_SLOT_MINUTES = 5;
const MAX_SLOT_MINUTES = 480;

function all_slots(schedule: PublicSchedule, booked: Set<string>): Slot[] {
  const result: Slot[] = [];
  const now = Date.now();
  const base = new Date();

  if (
    !Number.isInteger(schedule.duration_minutes) ||
    schedule.duration_minutes < MIN_SLOT_MINUTES ||
    schedule.duration_minutes > MAX_SLOT_MINUTES
  ) {
    return result;
  }

  for (let offset = 0; offset < DAYS_SHOWN; offset += 1) {
    const utc_day = new Date(
      Date.UTC(
        base.getUTCFullYear(),
        base.getUTCMonth(),
        base.getUTCDate() + offset,
      ),
    );

    for (const window of schedule.windows) {
      if (window.day !== utc_day.getUTCDay()) {
        continue;
      }

      for (
        let minute = window.start_minute;
        minute + schedule.duration_minutes <= window.end_minute;
        minute += schedule.duration_minutes
      ) {
        const starts_at = booking_slot_start(
          schedule.timezone,
          schedule.windows_set_at,
          utc_day.getTime() + minute * 60 * 1000,
        );

        if (
          starts_at &&
          starts_at.getTime() > now &&
          !booked.has(starts_at.toISOString())
        ) {
          result.push({ key: starts_at.toISOString(), starts_at });
        }
      }
    }
  }

  return result.sort(
    (left, right) => left.starts_at.getTime() - right.starts_at.getTime(),
  );
}

function StatusScreen({
  message,
  is_busy = false,
}: {
  message: string;
  is_busy?: boolean;
}) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--bg-secondary)] p-6">
      <p
        aria-busy={is_busy}
        className="text-center text-[14px] text-txt-secondary"
        role="status"
      >
        {message}
      </p>
    </div>
  );
}

function BookingBadge() {
  const { t } = use_i18n();

  return (
    <p className="mx-auto mt-4 text-center text-[12px] text-txt-muted">
      {t("calendar.booking_badge_label")}{" "}
      <a
        className="font-medium text-txt-secondary underline-offset-2 hover:underline"
        href="/register"
      >
        {t("calendar.booking_badge_cta")}
      </a>
    </p>
  );
}

function MetaRow({
  icon,
  children,
  is_emphasized = false,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  is_emphasized?: boolean;
}) {
  return (
    <p
      className={`flex items-start gap-2.5 text-[13px] leading-5 ${
        is_emphasized ? "font-medium text-txt-primary" : "text-txt-secondary"
      }`}
    >
      <span className="mt-0.5 h-4 w-4 flex-shrink-0 [&>svg]:h-4 [&>svg]:w-4">
        {icon}
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, language } = use_i18n();

  const [schedule, set_schedule] = useState<PublicSchedule | null>(null);
  const [load_state, set_load_state] = useState<LoadState>("loading");
  const [selected_day, set_selected_day] = useState<Date | null>(null);
  const [selected_slot, set_selected_slot] = useState<Slot | null>(null);
  const [step, set_step] = useState<Step>("pick");
  const [guest_name, set_guest_name] = useState("");
  const [guest_email, set_guest_email] = useState("");
  const [note, set_note] = useState("");
  const [is_submitting, set_is_submitting] = useState(false);
  const [is_booked, set_is_booked] = useState(false);
  const [error, set_error] = useState("");
  const [captcha_token, set_captcha_token] = useState<string | null>(null);
  const turnstile_ref = useRef<TurnstileWidgetRef>(null);
  const turnstile_required = !!TURNSTILE_SITE_KEY;
  const name_input_ref = useRef<HTMLInputElement>(null);
  const day_grid_ref = useRef<HTMLDivElement>(null);

  const load_schedule = useCallback(
    async (is_refresh: boolean) => {
      if (!slug) {
        set_load_state("not_found");

        return;
      }

      const result = await fetch_public_schedule(slug);

      if (result.status === "ok") {
        set_schedule(result.schedule);
        set_load_state("ready");
      } else if (!is_refresh) {
        set_load_state(result.status);
      }
    },
    [slug],
  );

  useEffect(() => {
    void load_schedule(false);
  }, [load_schedule]);

  const slot_groups = useMemo(() => {
    const groups = new Map<string, Slot[]>();

    if (!schedule) {
      return groups;
    }

    const booked_set = booked_start_keys(schedule.booked_starts);

    for (const slot of all_slots(schedule, booked_set)) {
      const group_key = slot.starts_at.toDateString();
      const bucket = groups.get(group_key) ?? [];

      bucket.push(slot);
      groups.set(group_key, bucket);
    }

    return groups;
  }, [schedule]);

  useEffect(() => {
    if (slot_groups.size === 0) {
      set_selected_day(null);

      return;
    }

    set_selected_day((current) => {
      if (current && slot_groups.has(current.toDateString())) {
        return current;
      }

      const first = slot_groups.values().next().value;

      return first ? start_of_day(first[0].starts_at) : null;
    });
  }, [slot_groups]);

  useEffect(() => {
    if (step === "details") {
      name_input_ref.current?.focus();
    }
  }, [step]);

  const week_start_day = useMemo(() => get_first_week_day(), []);

  const grid_days = useMemo(() => {
    const today = start_of_day(new Date());
    const last_day = add_days(today, DAYS_SHOWN - 1);
    const lead = (today.getDay() - week_start_day + 7) % 7;
    const first = add_days(today, -lead);
    const trail = (week_start_day + 6 - last_day.getDay() + 7) % 7;
    const total = lead + DAYS_SHOWN + trail;

    return Array.from({ length: total }, (_, index) => add_days(first, index));
  }, [week_start_day]);

  const weekday_labels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(language, { weekday: "short" });

    return grid_days.slice(0, 7).map((day) => formatter.format(day));
  }, [grid_days, language]);

  const day_formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        day: "numeric",
        month: "short",
        weekday: "short",
      }),
    [language],
  );

  const long_day_formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        day: "numeric",
        month: "long",
        weekday: "long",
      }),
    [language],
  );

  const month_formatter = useMemo(
    () => new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }),
    [language],
  );

  const time_formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        hour: "numeric",
        minute: "2-digit",
      }),
    [language],
  );

  const time_zone = useMemo(() => {
    const zone_part = new Intl.DateTimeFormat(language, {
      timeZoneName: "long",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName");

    return (
      zone_part?.value ??
      Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " ")
    );
  }, [language]);

  const range_label = useMemo(() => {
    if (grid_days.length === 0) {
      return "";
    }

    const first_label = month_formatter.format(grid_days[0]);
    const last_label = month_formatter.format(grid_days[grid_days.length - 1]);

    return first_label === last_label
      ? first_label
      : `${first_label} - ${last_label}`;
  }, [grid_days, month_formatter]);

  const day_slots = selected_day
    ? (slot_groups.get(selected_day.toDateString()) ?? [])
    : [];

  const handle_select_day = (day: Date) => {
    set_selected_day(day);
    set_error("");
  };

  const handle_select_slot = (slot: Slot) => {
    set_selected_slot(slot);
    set_error("");
    set_step("details");
  };

  const handle_back = () => {
    set_step("pick");
    set_error("");
  };

  const handle_grid_keydown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const delta = steps[event.key];
    const grid = day_grid_ref.current;

    if (!delta || !grid) {
      return;
    }

    const buttons = Array.from(
      grid.querySelectorAll<HTMLButtonElement>("button[data-day-index]"),
    );
    const current = buttons.findIndex(
      (button) => button === document.activeElement,
    );

    if (current === -1) {
      return;
    }

    event.preventDefault();

    const direction = delta > 0 ? 1 : -1;

    for (
      let index = current + delta;
      index >= 0 && index < buttons.length;
      index += Math.abs(delta) === 7 ? delta : direction
    ) {
      if (!buttons[index].disabled) {
        buttons[index].focus();

        return;
      }
    }
  };

  const handle_book = async () => {
    if (!slug || !selected_slot || is_submitting) {
      return;
    }

    const trimmed_name = guest_name.trim();
    const trimmed_email = guest_email.trim();

    if (trimmed_name.length === 0 || !EMAIL_PATTERN.test(trimmed_email)) {
      set_error(t("calendar.booking_details_invalid"));

      return;
    }

    if (turnstile_required && !captcha_token) {
      set_error(t("auth.complete_captcha_first"));

      return;
    }

    set_is_submitting(true);
    set_error("");

    const result = await book_public_slot(slug, {
      guest_email: trimmed_email,
      guest_name: trimmed_name,
      note: note.trim(),
      starts_at: selected_slot.starts_at.toISOString(),
      turnstile_token: captcha_token ?? undefined,
    });

    set_is_submitting(false);
    set_captcha_token(null);
    turnstile_ref.current?.reset();

    if (result === "booked") {
      set_is_booked(true);

      return;
    }

    if (result === "slot_taken") {
      set_selected_slot(null);
      set_step("pick");
      set_error(t("calendar.booking_slot_taken"));
      void load_schedule(true);

      return;
    }

    if (result === "verification_failed") {
      set_error(t("auth.complete_captcha_first"));
    } else if (result === "limit_reached") {
      set_error(t("calendar.booking_limit_reached"));
    } else if (result === "rate_limited") {
      set_error(t("calendar.booking_rate_limited"));
    } else {
      set_error(t("calendar.booking_failed"));
    }
  };

  if (load_state === "not_found") {
    return <StatusScreen message={t("calendar.booking_not_found")} />;
  }

  if (load_state === "error") {
    return <StatusScreen message={t("calendar.booking_load_failed")} />;
  }

  if (!schedule) {
    return <StatusScreen is_busy message={t("calendar.booking_loading")} />;
  }

  const slot_label = (slot: Slot) =>
    `${long_day_formatter.format(slot.starts_at)} · ${time_formatter.format(slot.starts_at)}`;

  if (is_booked) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[var(--bg-secondary)] p-4">
        <main className="w-full max-w-[420px] rounded-[14px] border border-edge-primary bg-[var(--bg-primary)] px-6 py-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-success,#16a34a)_14%,transparent)]">
            <CheckCircleIcon
              aria-hidden="true"
              className="h-7 w-7 text-[var(--color-success,#16a34a)]"
            />
          </span>
          <h1
            className="text-[18px] font-semibold text-txt-primary"
            role="status"
          >
            {t("calendar.booking_confirmed")}
          </h1>
          <p className="mt-1.5 break-words text-[14px] text-txt-secondary">
            {schedule.title}
          </p>
          {selected_slot && (
            <div className="mt-5 flex flex-col gap-2 rounded-[10px] border border-edge-primary px-4 py-3 text-start">
              <MetaRow
                is_emphasized
                icon={<CalendarDaysIcon aria-hidden="true" />}
              >
                <span className="tabular-nums">
                  {slot_label(selected_slot)}
                </span>
              </MetaRow>
              <MetaRow icon={<GlobeAltIcon aria-hidden="true" />}>
                {t("calendar.booking_time_zone", { time_zone })}
              </MetaRow>
            </div>
          )}
        </main>
        {schedule.show_branding && <BookingBadge />}
      </div>
    );
  }

  const error_message =
    error.length > 0 ? (
      <p
        className="text-[13px] text-[var(--color-danger,#ef4444)]"
        role="alert"
      >
        {error}
      </p>
    ) : null;

  const has_slots = slot_groups.size > 0;
  const today = start_of_day(new Date());

  return (
    <div className="h-[100dvh] overflow-y-auto bg-[var(--bg-secondary)] px-4 py-6 sm:py-12">
      <main className="mx-auto w-full max-w-[980px] overflow-hidden rounded-[14px] border border-edge-primary bg-[var(--bg-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)_260px]">
          <section className="flex flex-col gap-3 border-b border-edge-primary p-6 md:border-b-0 md:border-e">
            <h1 className="break-words text-[20px] font-semibold leading-tight text-txt-primary">
              {schedule.title}
            </h1>
            <div className="flex flex-col gap-2.5">
              <MetaRow icon={<ClockIcon aria-hidden="true" />}>
                {t("calendar.booking_duration", {
                  minutes: schedule.duration_minutes,
                })}
              </MetaRow>
              <MetaRow icon={<GlobeAltIcon aria-hidden="true" />}>
                {t("calendar.booking_time_zone", { time_zone })}
              </MetaRow>
              {step === "details" && selected_slot && (
                <MetaRow
                  is_emphasized
                  icon={<CalendarDaysIcon aria-hidden="true" />}
                >
                  <span className="tabular-nums">
                    {slot_label(selected_slot)}
                  </span>
                </MetaRow>
              )}
            </div>
          </section>

          {!has_slots ? (
            <section className="flex min-h-[240px] flex-col items-center justify-center gap-3 p-6 text-center lg:col-span-2">
              <CalendarDaysIcon
                aria-hidden="true"
                className="h-7 w-7 text-txt-muted"
              />
              <p className="max-w-[320px] text-[14px] text-txt-secondary">
                {t("calendar.booking_no_slots")}
              </p>
              {error_message}
            </section>
          ) : step === "pick" ? (
            <>
              <section className="p-6 max-md:border-b max-md:border-edge-primary lg:border-e lg:border-edge-primary">
                <div className="mb-4 flex items-baseline justify-between gap-3">
                  <h2 className="text-[15px] font-semibold text-txt-primary">
                    {t("common.select_date")}
                  </h2>
                  <span className="text-[13px] text-txt-muted">
                    {range_label}
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {weekday_labels.map((label, index) => (
                    <span
                      key={`${label}-${index}`}
                      aria-hidden="true"
                      className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-txt-muted"
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <div
                  ref={day_grid_ref}
                  className="grid grid-cols-7 gap-1"
                  onKeyDown={handle_grid_keydown}
                >
                  {grid_days.map((day, index) => {
                    const is_available = slot_groups.has(day.toDateString());
                    const is_selected =
                      !!selected_day && is_same_day(day, selected_day);
                    const is_today = is_same_day(day, today);
                    const state_class = is_selected
                      ? "bg-[var(--accent-color)] font-semibold text-[var(--accent-fg,#ffffff)]"
                      : is_available
                        ? "bg-[color-mix(in_srgb,var(--accent-color)_12%,transparent)] font-semibold text-txt-primary hover:bg-[color-mix(in_srgb,var(--accent-color)_22%,transparent)]"
                        : "text-txt-muted";

                    return (
                      <button
                        key={day.toDateString()}
                        aria-current={is_today ? "date" : undefined}
                        aria-label={long_day_formatter.format(day)}
                        aria-pressed={is_available ? is_selected : undefined}
                        className={`relative flex h-11 w-full items-center justify-center rounded-[8px] text-[13px] tabular-nums transition-colors duration-150 ease-out disabled:cursor-default ${FOCUS_RING} ${state_class}`}
                        data-day-index={index}
                        disabled={!is_available}
                        tabIndex={
                          is_available && (is_selected || !selected_day)
                            ? 0
                            : -1
                        }
                        type="button"
                        onClick={() => handle_select_day(day)}
                      >
                        {day.getDate()}
                        {is_today && (
                          <span
                            aria-hidden="true"
                            className={`absolute bottom-1.5 h-1 w-1 rounded-full ${
                              is_selected
                                ? "bg-[var(--accent-fg,#ffffff)]"
                                : "bg-[var(--accent-color)]"
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="flex min-h-0 flex-col p-6 md:col-span-2 md:border-t md:border-edge-primary lg:col-span-1 lg:border-t-0">
                <h2
                  aria-live="polite"
                  className="mb-3 text-[15px] font-semibold text-txt-primary"
                >
                  {selected_day ? long_day_formatter.format(selected_day) : ""}
                </h2>
                {error_message && <div className="mb-3">{error_message}</div>}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:flex lg:max-h-[420px] lg:flex-col lg:overflow-y-auto lg:pe-1 aster_scrollbar_thin">
                  {day_slots.map((slot) => {
                    const is_selected = selected_slot?.key === slot.key;

                    return (
                      <button
                        key={slot.key}
                        aria-label={slot_label(slot)}
                        aria-pressed={is_selected}
                        className={`flex h-10 w-full flex-shrink-0 items-center justify-center rounded-[8px] border text-[13px] font-medium tabular-nums transition-colors duration-150 ease-out ${FOCUS_RING} ${
                          is_selected
                            ? "border-[var(--accent-color)] bg-[var(--accent-color)] text-[var(--accent-fg,#ffffff)]"
                            : "border-edge-primary text-txt-primary hover:border-[var(--accent-color)] hover:bg-[color-mix(in_srgb,var(--accent-color)_8%,transparent)]"
                        }`}
                        type="button"
                        onClick={() => handle_select_slot(slot)}
                      >
                        {time_formatter.format(slot.starts_at)}
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          ) : (
            <section className="p-6 lg:col-span-2">
              <button
                className={`-ms-2 mb-4 inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[13px] font-medium text-txt-secondary transition-colors duration-150 ease-out hover:bg-[var(--bg-hover)] hover:text-txt-primary ${FOCUS_RING}`}
                type="button"
                onClick={handle_back}
              >
                <ArrowLeftIcon
                  aria-hidden="true"
                  className="h-4 w-4 rtl:-scale-x-100"
                />
                {t("common.back")}
              </button>
              {selected_slot && (
                <h2 className="text-[16px] font-semibold tabular-nums text-txt-primary">
                  {`${day_formatter.format(selected_slot.starts_at)} · ${time_formatter.format(selected_slot.starts_at)}`}
                </h2>
              )}
              <form
                noValidate
                className="mt-5 flex max-w-[520px] flex-col gap-4"
                onSubmit={(submitted) => {
                  submitted.preventDefault();
                  void handle_book();
                }}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-txt-secondary">
                      {t("calendar.booking_your_name")}
                    </span>
                    <input
                      ref={name_input_ref}
                      required
                      autoComplete="name"
                      className="aster_input h-10 w-full min-w-0 text-[14px]"
                      maxLength={MAX_GUEST_TEXT_LENGTH}
                      value={guest_name}
                      onChange={(changed) =>
                        set_guest_name(changed.target.value)
                      }
                    />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-txt-secondary">
                      {t("calendar.booking_your_email")}
                    </span>
                    <input
                      required
                      autoComplete="email"
                      className="aster_input h-10 w-full min-w-0 text-[14px]"
                      inputMode="email"
                      maxLength={MAX_GUEST_TEXT_LENGTH}
                      type="email"
                      value={guest_email}
                      onChange={(changed) =>
                        set_guest_email(changed.target.value)
                      }
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-txt-secondary">
                    {t("calendar.booking_note")}
                  </span>
                  <textarea
                    className="aster_input min-h-[88px] w-full resize-y text-[14px]"
                    maxLength={MAX_NOTE_LENGTH}
                    value={note}
                    onChange={(changed) => set_note(changed.target.value)}
                  />
                </label>
                {turnstile_required && (
                  <TurnstileWidget
                    ref={turnstile_ref}
                    on_expire={() => set_captcha_token(null)}
                    on_verify={set_captcha_token}
                  />
                )}
                {error_message}
                <div className="flex justify-end">
                  <Button
                    disabled={is_submitting}
                    type="submit"
                    variant="depth"
                  >
                    {is_submitting
                      ? t("calendar.booking_submitting")
                      : t("calendar.booking_confirm")}
                  </Button>
                </div>
              </form>
            </section>
          )}
        </div>
      </main>
      {schedule.show_branding && <BookingBadge />}
    </div>
  );
}

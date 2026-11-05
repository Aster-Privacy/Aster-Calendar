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
import type { QuickCreateDraft } from "@/components/calendar/quick_create_popover";
import type {
  CalendarAttendeeResponse,
  CalendarEventDraft,
  CalendarEventKind,
  CalendarViewMode,
  DecryptedCalendar,
  DecryptedCalendarEvent,
  RecurrenceEditScope,
} from "@/types/calendar";

import {
  build_search_index,
  match_indexed_event,
  parse_search_query,
} from "@/components/calendar/search_query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AGENDA_DAY_COUNT,
  AGENDA_MAX_DAY_COUNT,
  add_days,
  add_months,
  add_years,
  build_agenda_groups,
  collect_tags,
  end_of_day,
  event_has_any_tag,
  clamp_custom_view_days,
  get_visible_range,
  next_agenda_day_count,
  is_same_day,
  merge_by_id,
  start_of_day,
  week_start_day_index,
} from "@/components/calendar/calendar_utils";
import {
  read_event_link,
  strip_event_link,
} from "@/components/calendar/event_link";
import {
  create_event,
  delete_event,
  delete_event_occurrence,
  draft_to_optimistic_event,
  event_to_draft,
  generate_temp_id,
  list_calendars,
  list_events,
  list_trashed_events,
  restore_trashed_event,
  set_calendar_visibility,
  set_default_calendar_names,
  subscribe_calendar_changes,
  trash_event,
  update_event,
  update_event_occurrence,
} from "@/services/api/calendar";
import {
  calendar_trash_migration_done,
  mark_calendar_trash_migration_done,
  take_legacy_calendar_trash,
} from "@/services/api/preferences";
import { calendar_store_fully_v3 } from "@/services/calendar/blob_migration";
import {
  calendar_write_key,
  set_calendar_v3_floor,
} from "@/services/calendar/calendar_crypto";
import {
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import {
  expired_trash_ids,
  legacy_entries_to_migrate,
  read_legacy_trash,
  trash_entries_from_events,
} from "@/services/calendar/trash";
import {
  HOLIDAY_CALENDAR_ID,
  HOLIDAY_COLOR,
  HOLIDAY_EVENT_PREFIX,
  holidays_in_range,
  is_holiday_event,
} from "@/services/calendar/holidays";
import {
  BIRTHDAY_CALENDAR_ID,
  BIRTHDAY_COLOR,
  BIRTHDAY_EVENT_PREFIX,
  birthdays_in_range,
  is_birthday_event,
  is_event_shown,
} from "@/services/calendar/birthdays";
import type { BirthdaySource } from "@/services/calendar/birthdays";
import { decrypt_contact, list_contacts } from "@/services/api/contacts";
import {
  fetch_subscription_events,
  is_subscription_event,
  SUBSCRIPTION_EXPANSION_BUDGET,
  with_subscription_colors,
  without_hidden_subscriptions,
} from "@/services/calendar/subscriptions";
import {
  BOOKING_CALENDAR_ID,
  BOOKING_COLOR,
  BOOKING_EVENT_PREFIX,
  delete_booking,
  is_booking_event,
  list_bookings,
} from "@/services/calendar/appointments";
import { calendar_booking_available } from "@/lib/app_kind";
import { expand_events } from "@/services/calendar/recurrence";
import {
  calendar_now,
  from_view_date,
  get_active_view_zone,
  resolve_view_zone,
  set_active_view_zone,
  shift_event_to_view,
  shift_events_to_view,
  stamp_draft_zone,
  unshift_draft_from_view,
  unshift_event_from_view,
} from "@/services/calendar/view_zone";
import { show_toast } from "@/components/toast/simple_toast";
import { register_event_render_alias } from "@/services/calendar/event_render_key";
import { use_calendar_now_tick } from "@/components/calendar/use_calendar_now_tick";
import { send_reply } from "@/services/calendar/invite_mail";
import { set_own_response } from "@/services/calendar/invite_store";
import { event_organizer_email, same_address } from "@/services/calendar/itip";
import { reply_identity } from "@/services/calendar/invite_sender";
import {
  is_own_address,
  use_own_addresses_version,
} from "@/services/calendar/own_addresses";
import { use_invite_senders } from "@/components/calendar/use_invite_senders";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { use_preferences } from "@/contexts/preferences_context";

let booking_feature_unavailable_for: string | null = null;
const SEARCH_WINDOW_DAYS = 730;
const SEARCH_DEBOUNCE_MS = 120;
const VIEW_SWITCH_INPUT_GUARD_MS = 450;
const TRASH_PURGE_DELAY_MS = 6000;

function is_readonly_event(event: DecryptedCalendarEvent): boolean {
  return (
    is_holiday_event(event) ||
    is_birthday_event(event) ||
    is_subscription_event(event) ||
    is_booking_event(event)
  );
}

function has_recurrence(event: DecryptedCalendarEvent): boolean {
  return event.recurrence !== null || event.recurrence_master_id !== null;
}

function is_declined_by(
  event: DecryptedCalendarEvent,
  self_email: string,
): boolean {
  if (self_email.length === 0) {
    return false;
  }

  return event.attendees.some(
    (attendee) =>
      is_own_address(attendee.email, self_email) &&
      attendee.response === "declined",
  );
}

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

export function use_calendar_state() {
  const { t, language } = use_i18n();
  const { user } = use_auth();
  const { preferences, update_preference, has_loaded_from_server, save_now } =
    use_preferences();

  const self_email = (user?.email ?? "").trim().toLowerCase();
  const own_addresses_version = use_own_addresses_version();
  const invite_senders = use_invite_senders();
  const invite_sender_options_ref = useRef(invite_senders.all_options);

  invite_sender_options_ref.current = invite_senders.all_options;

  set_default_calendar_names([
    t("calendar.seed_calendar_personal"),
    t("calendar.seed_calendar_work"),
    t("calendar.seed_calendar_family"),
  ]);
  const show_declined_events = preferences.calendar_show_declined_events;
  const shortcuts_enabled = preferences.calendar_keyboard_shortcuts_enabled;
  const view_mode = (preferences.calendar_default_view ??
    "week") as CalendarViewMode;
  const week_start_day = week_start_day_index(
    preferences.calendar_week_starts_on,
  );
  const custom_view_days = clamp_custom_view_days(
    preferences.calendar_custom_view_days ?? 4,
  );
  const view_zone = resolve_view_zone(preferences.calendar_timezone);

  if (get_active_view_zone() !== view_zone) {
    set_active_view_zone(view_zone);
  }

  useEffect(() => {
    set_active_view_zone(view_zone);
  }, [view_zone]);

  const [anchor_date, set_anchor_date] = useState<Date>(() =>
    calendar_now(view_zone),
  );
  const [selected_date, set_selected_date] = useState<Date>(() =>
    calendar_now(view_zone),
  );
  const [events, set_events] = useState<DecryptedCalendarEvent[]>([]);
  const [trashed_events, set_trashed_events] = useState<
    DecryptedCalendarEvent[]
  >([]);
  const [calendars, set_calendars] = useState<DecryptedCalendar[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [load_failed, set_load_failed] = useState(false);
  const [is_shortcuts_open, set_is_shortcuts_open] = useState(false);
  const [is_go_to_date_open, set_is_go_to_date_open] = useState(false);
  const [is_insights_open, set_is_insights_open_state] = useState(false);
  const [selected_event, set_selected_event] =
    useState<DecryptedCalendarEvent | null>(null);
  const [editing_event, set_editing_event] =
    useState<DecryptedCalendarEvent | null>(null);
  const [is_form_open, set_is_form_open] = useState(false);
  const [form_initial_date, set_form_initial_date] = useState<Date | null>(
    null,
  );
  const [form_initial_kind, set_form_initial_kind] =
    useState<CalendarEventKind | null>(null);
  const [form_initial_draft, set_form_initial_draft] =
    useState<QuickCreateDraft | null>(null);
  const [event_to_delete, set_event_to_delete] =
    useState<DecryptedCalendarEvent | null>(null);
  const [booking_to_cancel, set_booking_to_cancel] =
    useState<DecryptedCalendarEvent | null>(null);
  const [pending_scope_edit, set_pending_scope_edit] = useState<{
    event: DecryptedCalendarEvent;
    draft: CalendarEventDraft;
  } | null>(null);
  const [quick_range, set_quick_range] = useState<{
    start: Date;
    end: Date;
    is_all_day: boolean;
  } | null>(null);
  const [search_query, set_search_query] = useState("");
  const [applied_search_query, set_applied_search_query] = useState("");
  const [search_window_requested, set_search_window_requested] =
    useState(false);
  const [is_search_window_loading, set_is_search_window_loading] =
    useState(false);
  const [search_events, set_search_events] = useState<DecryptedCalendarEvent[]>(
    [],
  );
  const [selected_tags, set_selected_tags] = useState<string[]>([]);
  const [reload_token, set_reload_token] = useState(0);
  const [nav_direction, set_nav_direction] = useState<1 | -1 | 0>(0);
  const [nav_token, set_nav_token] = useState(0);
  const search_input_ref = useRef<HTMLInputElement>(null);
  const scope_edit_origin_ref = useRef<DecryptedCalendarEvent | null>(null);

  const computed_range = useMemo(
    () =>
      get_visible_range(
        anchor_date,
        view_mode,
        week_start_day,
        custom_view_days,
      ),
    [anchor_date, view_mode, week_start_day, custom_view_days],
  );
  const range_start_ms = computed_range.range_start.getTime();
  const period_end_ms = computed_range.range_end.getTime();
  const agenda_key = `${view_mode}:${range_start_ms}`;
  const [agenda_span, set_agenda_span] = useState({
    key: "",
    day_count: AGENDA_DAY_COUNT,
  });
  const [agenda_loaded_end_ms, set_agenda_loaded_end_ms] = useState(0);
  const agenda_day_count =
    view_mode === "agenda" && agenda_span.key === agenda_key
      ? agenda_span.day_count
      : AGENDA_DAY_COUNT;
  const range_end_ms =
    view_mode === "agenda"
      ? end_of_day(
          add_days(computed_range.range_start, agenda_day_count),
        ).getTime()
      : period_end_ms;
  const range_start = useMemo(() => new Date(range_start_ms), [range_start_ms]);
  const range_end = useMemo(() => new Date(range_end_ms), [range_end_ms]);
  const period_end = useMemo(() => new Date(period_end_ms), [period_end_ms]);
  const agenda_has_more = agenda_day_count < AGENDA_MAX_DAY_COUNT;
  const is_agenda_loading_more = agenda_loaded_end_ms !== range_end_ms;

  const load_more_agenda = useCallback(() => {
    if (!agenda_has_more || is_agenda_loading_more) {
      return;
    }

    set_agenda_span({
      key: agenda_key,
      day_count: next_agenda_day_count(agenda_day_count),
    });
  }, [agenda_day_count, agenda_has_more, agenda_key, is_agenda_loading_more]);

  const reload = useCallback(() => {
    set_reload_token((token) => token + 1);
  }, []);

  const load_generation_ref = useRef(0);
  const pending_purges_ref = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const reschedule_sequence_ref = useRef(0);
  const pending_reschedules_ref = useRef(
    new Map<
      string,
      { sequence: number; event: DecryptedCalendarEvent; release_after: number }
    >(),
  );

  const overlay_pending_reschedules = useCallback(
    (fresh: DecryptedCalendarEvent[], generation: number) => {
      const pending = pending_reschedules_ref.current;

      if (pending.size === 0) {
        return fresh;
      }

      for (const [id, entry] of pending) {
        if (entry.release_after <= generation) {
          pending.delete(id);
        }
      }

      if (pending.size === 0) {
        return fresh;
      }

      return fresh.map((item) => pending.get(item.id)?.event ?? item);
    },
    [],
  );

  const apply_saved_event = useCallback(
    (
      saved: DecryptedCalendarEvent,
      patch?: Partial<DecryptedCalendarEvent>,
    ) => {
      set_events((current) => {
        let matched = false;
        const next = current.map((item) => {
          if (item.id === saved.id) {
            matched = true;

            return saved;
          }

          if (patch && item.recurrence_master_id === saved.id) {
            matched = true;

            return { ...item, ...patch };
          }

          return item;
        });

        if (matched || saved.recurrence) {
          return next;
        }

        return [...next, saved];
      });
    },
    [],
  );

  const remove_saved_event = useCallback(
    (event_id: string, include_series: boolean) => {
      set_events((current) =>
        current.filter(
          (item) =>
            item.id !== event_id &&
            !(include_series && item.recurrence_master_id === event_id),
        ),
      );
    },
    [],
  );

  const key_recovery_attempted = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const recover_write_key = async (): Promise<boolean> => {
      if (key_recovery_attempted.current) return false;
      key_recovery_attempted.current = true;

      const vault = get_vault_from_memory();
      const passphrase = get_passphrase_from_memory();

      if (!vault || !passphrase) return false;
      if (await calendar_write_key(vault)) return false;

      try {
        const { load_account_keys_for_session } =
          await import("@/services/crypto/account_key_loader");

        await load_account_keys_for_session(vault, passphrase);
      } catch {
        return false;
      }

      return (await calendar_write_key(vault)) !== null;
    };

    const load = async () => {
      load_generation_ref.current += 1;
      const generation = load_generation_ref.current;

      try {
        const [events_result, calendars_result, trashed_result] =
          await Promise.all([
            list_events(
              from_view_date(range_start, view_zone),
              from_view_date(range_end, view_zone),
            ),
            list_calendars(),
            list_trashed_events(),
          ]);

        if (cancelled) {
          return;
        }

        const fresh_events = overlay_pending_reschedules(
          shift_events_to_view(events_result.data, view_zone),
          generation,
        );

        set_events((current) => merge_by_id(current, fresh_events));
        set_agenda_loaded_end_ms(range_end.getTime());
        set_calendars((current) => merge_by_id(current, calendars_result.data));
        const purging = pending_purges_ref.current;
        const visible_trash =
          purging.size === 0
            ? trashed_result
            : trashed_result.filter((event) => !purging.has(event.id));

        set_trashed_events((current) => merge_by_id(current, visible_trash));
        set_load_failed(false);

        const expired = expired_trash_ids(visible_trash);

        if (expired.length > 0) {
          await Promise.all(expired.map((id) => delete_event(id)));
        }
      } catch {
        if (cancelled) {
          return;
        }

        if (await recover_write_key()) {
          if (!cancelled) reload();

          return;
        }

        if (!cancelled) set_load_failed(true);
      } finally {
        if (!cancelled) {
          set_is_loading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [
    range_start,
    range_end,
    reload_token,
    reload,
    overlay_pending_reschedules,
  ]);

  useEffect(() => subscribe_calendar_changes(reload), [reload]);

  useEffect(() => {
    set_calendar_v3_floor(
      has_loaded_from_server && preferences.calendar_v3_only === true,
      user?.id,
    );
  }, [has_loaded_from_server, preferences.calendar_v3_only, user?.id]);

  useEffect(() => {
    if (
      !has_loaded_from_server ||
      is_loading ||
      load_failed ||
      preferences.calendar_v3_only
    ) {
      return;
    }

    let cancelled = false;

    void calendar_store_fully_v3()
      .then((fully_v3) => {
        if (cancelled || !fully_v3) return;
        update_preference("calendar_v3_only", true);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    has_loaded_from_server,
    is_loading,
    load_failed,
    preferences.calendar_v3_only,
    events,
    calendars,
    update_preference,
  ]);

  useEffect(() => {
    if (!has_loaded_from_server || is_loading || load_failed) {
      return;
    }

    if (calendar_trash_migration_done()) {
      take_legacy_calendar_trash();

      return;
    }

    const entries = legacy_entries_to_migrate(
      read_legacy_trash(take_legacy_calendar_trash()),
      trashed_events,
    );

    if (entries.length === 0) {
      mark_calendar_trash_migration_done();

      return;
    }

    let cancelled = false;

    const migrate = async () => {
      for (const entry of entries) {
        if (cancelled) return;
        await create_event({ ...entry.draft, trashed_at: entry.deleted_at });
      }

      mark_calendar_trash_migration_done();
      await save_now();
      if (!cancelled) reload();
    };

    void migrate().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    has_loaded_from_server,
    is_loading,
    load_failed,
    trashed_events,
    reload,
    save_now,
  ]);

  const trash_entries = useMemo(
    () => trash_entries_from_events(trashed_events),
    [trashed_events],
  );

  const trimmed_search_query = search_query.trim();

  useEffect(() => {
    if (trimmed_search_query.length === 0) {
      set_applied_search_query("");

      return;
    }

    set_search_window_requested(true);

    const timer = window.setTimeout(() => {
      set_applied_search_query(trimmed_search_query);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [trimmed_search_query]);

  const prefetch_search_window = useCallback(() => {
    set_search_window_requested(true);
  }, []);

  const clear_search = useCallback(() => {
    set_search_query("");
    set_applied_search_query("");
  }, []);

  const is_search_active = applied_search_query.length > 0;
  const is_search_pending = trimmed_search_query !== applied_search_query;

  useEffect(() => {
    if (!search_window_requested) {
      return;
    }

    let cancelled = false;
    const today = new Date();

    set_is_search_window_loading(true);

    list_events(
      add_days(today, -SEARCH_WINDOW_DAYS),
      add_days(today, SEARCH_WINDOW_DAYS),
    )
      .then((result) => {
        if (!cancelled) {
          set_search_events(shift_events_to_view(result.data, view_zone));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          set_is_search_window_loading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [search_window_requested, reload_token, view_zone]);

  const searchable_events = useMemo(() => {
    if (!is_search_active || search_events.length === 0) {
      return events;
    }

    const merged = new Map<string, DecryptedCalendarEvent>();

    for (const event of [...search_events, ...events]) {
      merged.set(`${event.id}|${event.starts_at}`, event);
    }

    return [...merged.values()];
  }, [events, is_search_active, search_events]);

  const visible_calendar_ids = useMemo(
    () =>
      new Set(
        calendars.filter((calendar) => calendar.is_visible).map((c) => c.id),
      ),
    [calendars],
  );

  const holiday_region = preferences.calendar_holiday_region ?? "none";
  const show_birthdays = preferences.calendar_birthdays_hidden !== true;
  const [birthday_sources, set_birthday_sources] = useState<BirthdaySource[]>(
    [],
  );

  useEffect(() => {
    if (!show_birthdays) {
      set_birthday_sources([]);

      return;
    }

    let cancelled = false;

    const load_contacts = async () => {
      try {
        const sources: BirthdaySource[] = [];
        let cursor: string | null = null;

        for (let page = 0; page < 20; page += 1) {
          const response = await list_contacts({
            cursor: cursor ?? undefined,
            limit: 200,
          });

          if (!response.data) {
            break;
          }

          for (const contact of response.data.items) {
            try {
              const decrypted = await decrypt_contact(contact);
              const name =
                `${decrypted.first_name} ${decrypted.last_name}`.trim();

              if (decrypted.birthday && name.length > 0) {
                sources.push({
                  birthday: decrypted.birthday,
                  id: decrypted.id,
                  name,
                });
              }
            } catch {
              continue;
            }
          }

          if (!response.data.has_more || !response.data.next_cursor) {
            break;
          }

          cursor = response.data.next_cursor;
        }

        if (!cancelled) {
          set_birthday_sources(sources);
        }
      } catch {
        if (!cancelled) {
          set_birthday_sources([]);
        }
      }
    };

    void load_contacts();

    return () => {
      cancelled = true;
    };
  }, [show_birthdays]);

  const birthday_events = useMemo(() => {
    if (!show_birthdays || birthday_sources.length === 0) {
      return [] as DecryptedCalendarEvent[];
    }

    return birthdays_in_range(birthday_sources, range_start, range_end).map(
      (occurrence) => {
        const day_start = start_of_day(occurrence.date);
        const day_end = end_of_day(occurrence.date);

        return {
          attendees: [],
          availability: "free",
          calendar_id: BIRTHDAY_CALENDAR_ID,
          color: BIRTHDAY_COLOR,
          conference_url: "",
          created_at: day_start.toISOString(),
          description: "",
          ends_at: day_end.toISOString(),
          event_kind: "default",
          guests_can_invite: false,
          guests_can_modify: false,
          guests_can_see_guests: false,
          id: `${BIRTHDAY_EVENT_PREFIX}${occurrence.contact_id}-${day_start.toISOString().slice(0, 10)}`,
          is_all_day: true,
          is_completed: false,
          location: "",
          occurrence_start: null,
          recurrence: null,
          recurrence_exceptions: [],
          recurrence_master_id: null,
          reminder_minutes: null,
          starts_at: day_start.toISOString(),
          status: "confirmed",
          tags: [],
          title: t("calendar.birthday_title", { name: occurrence.name }),
          updated_at: day_start.toISOString(),
          visibility: "default",
          working_location: null,
        } as DecryptedCalendarEvent;
      },
    );
  }, [show_birthdays, birthday_sources, range_start, range_end, t]);

  const ics_subscriptions = preferences.calendar_ics_subscriptions ?? [];
  const subscriptions_key = JSON.stringify(
    ics_subscriptions.map((subscription) => subscription.id + subscription.url),
  );
  const [subscription_events, set_subscription_events] = useState<
    DecryptedCalendarEvent[]
  >([]);

  useEffect(() => {
    if (ics_subscriptions.length === 0) {
      set_subscription_events([]);

      return;
    }

    let cancelled = false;

    const load_subscriptions = async () => {
      const collected: DecryptedCalendarEvent[] = [];

      for (const subscription of ics_subscriptions) {
        try {
          collected.push(...(await fetch_subscription_events(subscription)));
        } catch {
          continue;
        }
      }

      if (!cancelled) {
        set_subscription_events(collected);
      }
    };

    void load_subscriptions();

    return () => {
      cancelled = true;
    };
  }, [subscriptions_key]);

  const subscription_colors_key = JSON.stringify(
    ics_subscriptions.map((subscription) => [
      subscription.id,
      subscription.color,
      subscription.hidden === true,
    ]),
  );
  const colored_subscription_events = useMemo(
    () =>
      with_subscription_colors(
        without_hidden_subscriptions(subscription_events, ics_subscriptions),
        ics_subscriptions,
      ),
    [subscription_events, subscription_colors_key],
  );

  const visible_subscription_events = useMemo(() => {
    if (colored_subscription_events.length === 0) {
      return [] as DecryptedCalendarEvent[];
    }

    const real_start = from_view_date(range_start, view_zone);
    const real_end = from_view_date(range_end, view_zone);
    const from = real_start.getTime();
    const to = real_end.getTime();

    return shift_events_to_view(
      expand_events(colored_subscription_events, real_start, real_end, {
        candidate_budget: SUBSCRIPTION_EXPANSION_BUDGET,
      }).filter(
        (event) => {
          const start = new Date(event.starts_at).getTime();
          const end = new Date(event.ends_at).getTime();

          return !Number.isNaN(start) && end >= from && start <= to;
        },
      ),
      view_zone,
    );
  }, [colored_subscription_events, range_start, range_end, view_zone]);

  const [booking_events, set_booking_events] = useState<
    DecryptedCalendarEvent[]
  >([]);

  const booking_account_id = user?.id ?? null;

  useEffect(() => {
    let cancelled = false;

    const load_bookings = async () => {
      if (!booking_account_id || !calendar_booking_available()) {
        set_booking_events([]);

        return;
      }
      if (booking_feature_unavailable_for === booking_account_id) return;

      try {
        const response = await list_bookings(range_start, range_end);

        if (response.status === 404) {
          booking_feature_unavailable_for = booking_account_id;

          return;
        }

        if (cancelled || !response.data) {
          return;
        }

        const seen_key = `calendar_seen_booking_ids:${booking_account_id}`;
        const seen_raw = window.localStorage.getItem(seen_key);
        let seen: string[] = [];

        if (seen_raw) {
          try {
            const parsed: unknown = JSON.parse(seen_raw);

            seen = Array.isArray(parsed)
              ? parsed.filter(
                  (entry): entry is string => typeof entry === "string",
                )
              : [];
          } catch {
            seen = [];
          }
        }
        const fresh = response.data.filter(
          (booking) => !seen.includes(booking.id),
        );

        if (seen_raw !== null && fresh.length > 0) {
          for (const booking of fresh
            .filter((entry) => entry.guest_name)
            .slice(0, 3)) {
            show_toast(
              t("calendar.booking_received", {
                guest: booking.guest_name,
                schedule: booking.schedule_title,
              }),
              "info",
              6000,
            );
          }
        }

        window.localStorage.setItem(
          seen_key,
          JSON.stringify(
            [...new Set([...seen, ...response.data.map((b) => b.id)])].slice(
              -500,
            ),
          ),
        );

        set_booking_events(
          shift_events_to_view(
            response.data.map((booking) => ({
              attendees: booking.guest_email
                ? [
                    {
                      display_name: booking.guest_name,
                      email: booking.guest_email,
                      is_organizer: false,
                      response: "accepted",
                    },
                  ]
                : [],
              availability: "busy",
              calendar_id: BOOKING_CALENDAR_ID,
              color: BOOKING_COLOR,
              conference_url: "",
              created_at: booking.starts_at,
              description: booking.note,
              ends_at: booking.ends_at,
              event_kind: "default",
              guests_can_invite: false,
              guests_can_modify: false,
              guests_can_see_guests: false,
              id: `${BOOKING_EVENT_PREFIX}${booking.id}`,
              is_all_day: false,
              is_completed: false,
              location: "",
              occurrence_start: null,
              recurrence: null,
              recurrence_exceptions: [],
              recurrence_master_id: null,
              reminder_minutes: null,
              starts_at: booking.starts_at,
              status: "confirmed",
              tags: [],
              title: booking.guest_name
                ? `${booking.schedule_title}: ${booking.guest_name}`
                : booking.schedule_title,
              updated_at: booking.starts_at,
              visibility: "default",
              working_location: null,
            })),
            view_zone,
          ),
        );
      } catch {
        if (!cancelled) {
          set_booking_events([]);
        }
      }
    };

    void load_bookings();

    return () => {
      cancelled = true;
    };
  }, [booking_account_id, range_start, range_end, reload_token, t, view_zone]);

  const holiday_events = useMemo(() => {
    if (holiday_region === "none") {
      return [] as DecryptedCalendarEvent[];
    }

    return holidays_in_range(holiday_region, range_start, range_end).map(
      (holiday) => {
        const day_start = start_of_day(holiday.date);
        const day_end = end_of_day(holiday.date);

        return {
          attendees: [],
          availability: "free",
          calendar_id: HOLIDAY_CALENDAR_ID,
          color: HOLIDAY_COLOR,
          conference_url: "",
          created_at: day_start.toISOString(),
          description: "",
          ends_at: day_end.toISOString(),
          event_kind: "default",
          guests_can_invite: false,
          guests_can_modify: false,
          guests_can_see_guests: false,
          id: `${HOLIDAY_EVENT_PREFIX}${holiday_region}-${day_start.toISOString().slice(0, 10)}-${holiday.title}`,
          is_all_day: true,
          is_completed: false,
          location: "",
          occurrence_start: null,
          recurrence: null,
          recurrence_exceptions: [],
          recurrence_master_id: null,
          reminder_minutes: null,
          starts_at: day_start.toISOString(),
          status: "confirmed",
          tags: [],
          title: holiday.title,
          updated_at: day_start.toISOString(),
          visibility: "default",
          working_location: null,
        } as DecryptedCalendarEvent;
      },
    );
  }, [holiday_region, range_start, range_end]);

  const calendar_filtered_events = useMemo(
    () =>
      searchable_events
        .filter((event) =>
          is_event_shown(event, visible_calendar_ids, show_birthdays),
        )
        .filter((event) => event_has_any_tag(event, selected_tags))
        .filter(
          (event) => show_declined_events || !is_declined_by(event, self_email),
        )
        .concat(holiday_events)
        .concat(birthday_events)
        .concat(visible_subscription_events)
        .concat(booking_events),
    [
      holiday_events,
      birthday_events,
      visible_subscription_events,
      booking_events,
      searchable_events,
      visible_calendar_ids,
      show_birthdays,
      selected_tags,
      show_declined_events,
      self_email,
      own_addresses_version,
    ],
  );

  const available_tags = useMemo(
    () =>
      collect_tags(
        events.filter((event) =>
          is_event_shown(event, visible_calendar_ids, show_birthdays),
        ),
      ),
    [events, visible_calendar_ids, show_birthdays],
  );

  const handle_toggle_tag = useCallback((tag: string) => {
    set_selected_tags((current) =>
      current.some((value) => value.toLowerCase() === tag.toLowerCase())
        ? current.filter((value) => value.toLowerCase() !== tag.toLowerCase())
        : [...current, tag],
    );
  }, []);

  const calendar_by_id = useMemo(() => {
    const map = new Map<string, DecryptedCalendar>();

    for (const calendar of calendars) {
      map.set(calendar.id, calendar);
    }

    return map;
  }, [calendars]);

  const search_index = useMemo(
    () =>
      is_search_active
        ? build_search_index(
            calendar_filtered_events,
            (calendar_id) => calendar_by_id.get(calendar_id)?.name ?? "",
          )
        : null,
    [calendar_by_id, calendar_filtered_events, is_search_active],
  );

  const visible_events = useMemo(() => {
    const parsed = parse_search_query(applied_search_query);

    if (parsed.is_empty || search_index === null) {
      return calendar_filtered_events;
    }

    const matched: DecryptedCalendarEvent[] = [];

    for (const entry of search_index) {
      if (match_indexed_event(entry, parsed)) {
        matched.push(entry.event);
      }
    }

    return matched;
  }, [applied_search_query, calendar_filtered_events, search_index]);

  const agenda_groups = useMemo(
    () => build_agenda_groups(visible_events, range_start, range_end),
    [visible_events, range_start, range_end],
  );

  const view_switch_guard_until_ref = useRef(0);

  const is_view_switch_guarded = useCallback(
    () => performance.now() < view_switch_guard_until_ref.current,
    [],
  );

  const set_view_mode = useCallback(
    (next: CalendarViewMode) => {
      view_switch_guard_until_ref.current =
        performance.now() + VIEW_SWITCH_INPUT_GUARD_MS;
      clear_search();
      update_preference("calendar_default_view", next);
    },
    [clear_search, update_preference],
  );

  const go_to_today = useCallback(() => {
    const today = calendar_now();

    clear_search();
    set_nav_direction(0);
    set_nav_token((token) => token + 1);
    set_anchor_date(today);
    set_selected_date(today);
  }, [clear_search]);

  const go_to_previous = useCallback(() => {
    set_nav_direction(-1);
    set_nav_token((token) => token + 1);
    set_anchor_date((current) => {
      if (view_mode === "month") {
        return add_months(current, -1);
      }

      if (view_mode === "week") {
        return add_days(current, -7);
      }

      if (view_mode === "day") {
        return add_days(current, -1);
      }

      if (view_mode === "year") {
        return add_years(current, -1);
      }

      if (view_mode === "custom") {
        return add_days(current, -custom_view_days);
      }

      return add_days(current, -AGENDA_DAY_COUNT);
    });
  }, [view_mode, custom_view_days]);

  const go_to_next = useCallback(() => {
    set_nav_direction(1);
    set_nav_token((token) => token + 1);
    set_anchor_date((current) => {
      if (view_mode === "month") {
        return add_months(current, 1);
      }

      if (view_mode === "week") {
        return add_days(current, 7);
      }

      if (view_mode === "day") {
        return add_days(current, 1);
      }

      if (view_mode === "year") {
        return add_years(current, 1);
      }

      if (view_mode === "custom") {
        return add_days(current, custom_view_days);
      }

      return add_days(current, AGENDA_DAY_COUNT);
    });
  }, [view_mode, custom_view_days]);

  const handle_page_to_day = useCallback((day: Date) => {
    set_selected_date(day);
    set_anchor_date(day);
  }, []);

  const handle_day_click = useCallback(
    (day: Date) => {
      clear_search();
      set_selected_date(day);
      set_anchor_date(day);
    },
    [clear_search],
  );

  const handle_year_day_click = useCallback(
    (day: Date) => {
      set_selected_date(day);
      set_anchor_date(day);
      set_view_mode("day");
    },
    [set_view_mode],
  );

  const handle_year_month_click = useCallback(
    (month: Date) => {
      set_anchor_date(new Date(month.getFullYear(), month.getMonth(), 1));
      set_view_mode("month");
    },
    [set_view_mode],
  );

  const dismiss_quick_range = useCallback(() => {
    set_quick_range(null);
  }, []);

  const handle_range_select = useCallback(
    (start: Date, end: Date, is_all_day = false) => {
      if (is_view_switch_guarded()) {
        return;
      }

      set_selected_event(null);
      set_selected_date(start);
      set_quick_range({ start, end, is_all_day });
    },
    [is_view_switch_guarded],
  );

  const handle_quick_save = useCallback(
    async (draft: QuickCreateDraft) => {
      const temp_id = generate_temp_id();
      const event_draft = unshift_draft_from_view({
        attendees: draft.attendees.map((email) => ({
          display_name: null,
          email,
          is_organizer: false,
          response: "needs_action",
        })),
        availability: preferences.calendar_default_event_availability,
        calendar_id: draft.calendar_id,
        color: preferences.calendar_default_event_color || null,
        conference_url: preferences.calendar_default_conference_url,
        guests_can_invite: preferences.calendar_default_guests_can_invite,
        guests_can_modify: preferences.calendar_default_guests_can_modify,
        guests_can_see_guests:
          preferences.calendar_default_guests_can_see_guests,
        description: "",
        ends_at: draft.ends_at.toISOString(),
        is_all_day: draft.is_all_day,
        location: draft.location || preferences.calendar_default_event_location,
        recurrence: null,
        recurrence_exceptions: [],
        reminder_minutes:
          (draft.is_all_day
            ? preferences.calendar_default_all_day_reminder_minutes
            : preferences.calendar_default_reminder_minutes) ?? null,
        starts_at: draft.starts_at.toISOString(),
        status: "confirmed",
        tags: [],
        title: draft.title,
        visibility: preferences.calendar_default_event_visibility,
        event_kind: draft.event_kind ?? "default",
        is_completed: false,
        working_location: null,
      });
      const optimistic = shift_event_to_view(
        draft_to_optimistic_event(event_draft, temp_id),
      );

      set_events((current) => [...current, optimistic]);
      set_quick_range(null);
      set_selected_event(optimistic);

      let result: Awaited<ReturnType<typeof create_event>>;

      try {
        result = await create_event(event_draft, { temp_id });
      } catch (error) {
        remove_saved_event(temp_id, false);
        set_selected_event((current) =>
          current?.id === temp_id ? null : current,
        );
        throw error;
      }

      if (!result.data) {
        remove_saved_event(temp_id, false);
        set_selected_event((current) =>
          current?.id === temp_id ? null : current,
        );
        throw new Error("quick_create_failed");
      }

      const created = shift_event_to_view(result.data);

      register_event_render_alias(created.id, temp_id);
      set_events((current) => {
        const next = current.filter(
          (entry) => entry.id !== created.id || entry.id === temp_id,
        );
        const index = next.findIndex((entry) => entry.id === temp_id);

        if (index === -1) {
          return [...next, created];
        }

        next[index] = created;

        return next;
      });
      set_selected_event((current) =>
        current?.id === temp_id ? created : current,
      );
    },
    [
      preferences.calendar_default_conference_url,
      preferences.calendar_default_event_availability,
      preferences.calendar_default_event_color,
      preferences.calendar_default_event_location,
      preferences.calendar_default_event_visibility,
      preferences.calendar_default_guests_can_invite,
      preferences.calendar_default_guests_can_modify,
      preferences.calendar_default_guests_can_see_guests,
      preferences.calendar_default_all_day_reminder_minutes,
      preferences.calendar_default_reminder_minutes,
      remove_saved_event,
    ],
  );

  const set_is_insights_open = useCallback((open: boolean) => {
    set_is_insights_open_state(open);

    if (open) {
      set_selected_event(null);
    }
  }, []);

  const load_events_in_range = useCallback(
    async (start: Date, end: Date): Promise<DecryptedCalendarEvent[]> => {
      const result = await list_events(
        from_view_date(start, view_zone),
        from_view_date(end, view_zone),
      );

      return shift_events_to_view(result.data, view_zone);
    },
    [view_zone],
  );

  const handle_quick_more_options = useCallback((draft: QuickCreateDraft) => {
    set_quick_range(null);
    set_editing_event(null);
    set_form_initial_date(draft.starts_at);
    set_form_initial_kind(draft.event_kind ?? null);
    set_form_initial_draft(draft);
    set_is_form_open(true);
  }, []);

  const handle_event_reschedule = useCallback(
    async (
      event: DecryptedCalendarEvent,
      start: Date,
      end: Date,
    ): Promise<DecryptedCalendarEvent | null> => {
      if (is_readonly_event(event)) {
        return null;
      }

      const pending = pending_reschedules_ref.current;
      const previous = pending.get(event.id)?.event ?? event;
      const next: DecryptedCalendarEvent = {
        ...previous,
        ends_at: end.toISOString(),
        starts_at: start.toISOString(),
      };

      reschedule_sequence_ref.current += 1;
      const sequence = reschedule_sequence_ref.current;
      const is_latest = () => pending.get(event.id)?.sequence === sequence;

      pending.set(event.id, {
        event: next,
        release_after: Number.POSITIVE_INFINITY,
        sequence,
      });
      set_events((current) =>
        current.map((item) => (item.id === event.id ? next : item)),
      );
      set_selected_event((current) =>
        current && current.id === event.id ? next : current,
      );

      let saved: DecryptedCalendarEvent | null = null;

      try {
        const result = await update_event_occurrence(
          unshift_event_from_view(previous),
          unshift_draft_from_view({
            ...event_to_draft(previous),
            ends_at: next.ends_at,
            starts_at: next.starts_at,
          }),
          "single",
        );

        saved = result.data ? shift_event_to_view(result.data) : null;
      } catch {
        saved = null;
      }

      if (!saved) {
        if (is_latest()) {
          pending.delete(event.id);
          set_events((current) =>
            current.map((item) => (item.id === event.id ? previous : item)),
          );
          set_selected_event((current) =>
            current && current.id === event.id ? previous : current,
          );
          reload();
        }

        throw new Error("reschedule_failed");
      }

      if (is_latest()) {
        const settled = saved;

        if (settled.id !== event.id) {
          register_event_render_alias(settled.id, event.id);
          pending.delete(event.id);
          set_events((current) => {
            const next_events = current.filter(
              (item) => item.id !== settled.id,
            );
            const index = next_events.findIndex((item) => item.id === event.id);

            if (index === -1) {
              return [...next_events, settled];
            }

            next_events[index] = settled;

            return next_events;
          });
          set_selected_event((current) =>
            current && current.id === event.id ? settled : current,
          );
        } else {
          pending.set(event.id, {
            event: next,
            release_after: load_generation_ref.current + 1,
            sequence,
          });
        }
      }

      reload();

      return saved;
    },
    [reload],
  );

  const handle_restore_event = useCallback(
    async (event: DecryptedCalendarEvent) => {
      const result = await restore_trashed_event(
        event.recurrence_master_id ?? event.id,
      );

      if (!result.data) {
        throw new Error("restore_failed");
      }

      reload();
    },
    [reload],
  );

  const handle_day_double_click = useCallback(
    (day: Date) => {
      if (is_view_switch_guarded()) {
        return;
      }

      set_quick_range(null);
      set_editing_event(null);
      set_form_initial_date(day);
      set_is_form_open(true);
    },
    [is_view_switch_guarded],
  );

  const handle_slot_double_click = useCallback(
    (start: Date) => {
      if (is_view_switch_guarded()) {
        return;
      }

      set_quick_range(null);
      set_editing_event(null);
      set_form_initial_date(start);
      set_is_form_open(true);
    },
    [is_view_switch_guarded],
  );

  const handle_week_number_click = useCallback(
    (day: Date) => {
      set_selected_date(day);
      set_anchor_date(day);
      set_view_mode("week");
    },
    [set_view_mode],
  );

  const handle_create_click = useCallback(() => {
    set_editing_event(null);
    set_form_initial_date(selected_date);
    set_is_form_open(true);
  }, [selected_date]);

  const handle_create_in_calendar = useCallback(
    (calendar_id: string) => {
      const now = calendar_now();
      const starts_at = new Date(selected_date);

      if (is_same_day(selected_date, now)) {
        starts_at.setHours(now.getHours(), 0, 0, 0);
        starts_at.setMinutes(Math.ceil(now.getMinutes() / 15) * 15);
      } else {
        starts_at.setHours(9, 0, 0, 0);
      }

      const base_minutes = preferences.calendar_default_event_duration;
      const trimmed_minutes =
        base_minutes <= 30 ? base_minutes - 5 : base_minutes - 10;
      const duration_minutes =
        preferences.calendar_speedy_meetings && trimmed_minutes >= 5
          ? trimmed_minutes
          : base_minutes;

      set_quick_range(null);
      set_editing_event(null);
      set_form_initial_date(starts_at);
      set_form_initial_kind(null);
      set_form_initial_draft({
        attendees: [],
        calendar_id,
        ends_at: new Date(
          starts_at.getTime() + Math.max(duration_minutes, 1) * 60_000,
        ),
        is_all_day: false,
        location: "",
        starts_at,
        title: "",
      });
      set_is_form_open(true);
    },
    [
      selected_date,
      preferences.calendar_default_event_duration,
      preferences.calendar_speedy_meetings,
    ],
  );

  const handle_create_task_click = useCallback(() => {
    set_editing_event(null);
    set_form_initial_date(selected_date);
    set_form_initial_kind("task");
    set_is_form_open(true);
  }, [selected_date]);

  const handle_create_all_day_click = useCallback(() => {
    handle_range_select(
      start_of_day(selected_date),
      end_of_day(selected_date),
      true,
    );
  }, [handle_range_select, selected_date]);

  const handle_event_click = useCallback(
    (event: DecryptedCalendarEvent) => {
      const start = new Date(event.starts_at);

      if (
        !Number.isNaN(start.getTime()) &&
        (start < range_start || start > range_end)
      ) {
        set_anchor_date(start);
        set_selected_date(start);
      }

      set_selected_event(event);
    },
    [range_start, range_end],
  );

  const pending_event_link_ref = useRef(
    read_event_link(window.location.search),
  );

  useEffect(() => {
    const target = pending_event_link_ref.current;

    if (target?.date) {
      set_anchor_date(target.date);
      set_selected_date(target.date);
    }
  }, []);

  useEffect(() => {
    const target = pending_event_link_ref.current;

    if (!target) {
      return;
    }

    const linked_event = events.find((event) => event.id === target.event_id);

    if (!linked_event) {
      return;
    }

    pending_event_link_ref.current = null;
    handle_event_click(linked_event);
    window.history.replaceState(
      window.history.state,
      "",
      strip_event_link(window.location.href),
    );
  }, [events, handle_event_click]);

  const handle_event_respond = useCallback(
    async (
      event: DecryptedCalendarEvent,
      response: CalendarAttendeeResponse,
    ) => {
      if (self_email.length === 0) {
        return;
      }

      const identity = reply_identity(
        invite_sender_options_ref.current,
        event.attendees
          .filter((attendee) => !attendee.is_organizer)
          .map((attendee) => attendee.email),
        self_email,
        user?.display_name,
      );

      try {
        const updated = await set_own_response(
          event,
          identity.attendee_email,
          response,
        );

        if (!updated) {
          show_toast(t("calendar.invite_save_failed"), "error");

          return;
        }

        apply_saved_event(updated);
        set_selected_event(updated);
        reload();

        const organizer = event_organizer_email(updated);

        if (!organizer || is_own_address(organizer, self_email)) {
          show_toast(t("calendar.event_updated"), "success");

          return;
        }

        if (!identity.resolved) {
          show_toast(t("calendar.invite_reply_needs_address"), "error");

          return;
        }

        const organizer_party = updated.attendees.find((attendee) =>
          same_address(attendee.email, organizer),
        );
        const sent = await send_reply({
          event: updated,
          organizer: {
            email: organizer,
            display_name: organizer_party?.display_name ?? null,
          },
          attendee: {
            email: identity.reply_email,
            display_name: identity.display_name,
          },
          sender: identity.sender,
          response,
          t,
          language,
        });

        show_toast(
          t(
            sent
              ? "calendar.invite_card_reply_sent"
              : "calendar.invite_card_reply_send_failed",
          ),
          sent ? "success" : "error",
        );
      } catch {
        show_toast(t("calendar.invite_save_failed"), "error");
      }
    },
    [apply_saved_event, language, reload, self_email, t, user?.display_name],
  );

  const handle_edit_event = useCallback((event: DecryptedCalendarEvent) => {
    if (is_readonly_event(event)) {
      return;
    }

    set_editing_event(event);
    set_form_initial_date(new Date(event.starts_at));
    set_is_form_open(true);
  }, []);

  const request_event_delete = useCallback(
    (event: DecryptedCalendarEvent | null) => {
      if (event && is_booking_event(event)) {
        set_booking_to_cancel(event);

        return;
      }

      if (event && is_readonly_event(event)) {
        return;
      }

      set_event_to_delete(event);
    },
    [],
  );

  const handle_confirm_cancel_booking = useCallback(async () => {
    if (!booking_to_cancel) {
      return;
    }

    const booking_id = booking_to_cancel.id.slice(BOOKING_EVENT_PREFIX.length);
    const result = await delete_booking(booking_id);

    if (!result.data?.success) {
      throw new Error("booking_cancel_failed");
    }

    const canceled_id = booking_to_cancel.id;
    set_booking_events((current) =>
      current.filter((item) => item.id !== canceled_id),
    );
    set_selected_event((current) =>
      current?.id === canceled_id ? null : current,
    );
    set_booking_to_cancel(null);
  }, [booking_to_cancel]);

  const handle_form_close = useCallback(() => {
    set_is_form_open(false);
    set_editing_event(null);
    set_form_initial_date(null);
    set_form_initial_draft(null);
    set_form_initial_kind(null);
    scope_edit_origin_ref.current = null;
  }, []);

  const handle_form_submit = useCallback(
    async (draft: CalendarEventDraft) => {
      if (editing_event) {
        if (has_recurrence(editing_event)) {
          set_pending_scope_edit({
            draft,
            event: scope_edit_origin_ref.current ?? editing_event,
          });
          handle_form_close();

          return;
        }

        const result = await update_event(
          editing_event.id,
          unshift_draft_from_view(draft),
        );

        if (!result.data) {
          throw new Error("event_update_failed");
        }

        const updated = shift_event_to_view(result.data);

        apply_saved_event(updated);
        set_selected_event(updated);
      } else {
        const result = await create_event(
          stamp_draft_zone(unshift_draft_from_view(draft)),
        );

        if (!result.data) {
          throw new Error("event_create_failed");
        }

        apply_saved_event(shift_event_to_view(result.data));
      }

      if (draft.event_kind === "birthday" && !show_birthdays) {
        update_preference("calendar_birthdays_hidden", false);
      }

      handle_form_close();
      reload();
    },
    [
      apply_saved_event,
      editing_event,
      handle_form_close,
      reload,
      show_birthdays,
      update_preference,
    ],
  );

  const handle_duplicate_event = useCallback(
    async (event: DecryptedCalendarEvent) => {
      const draft: CalendarEventDraft = {
        ...event_to_draft(event),
        title: t("calendar.duplicate_title_prefix", { title: event.title }),
        recurrence: null,
        recurrence_exceptions: [],
      };

      const result = await create_event(
        stamp_draft_zone(unshift_draft_from_view(draft)),
      );

      if (!result.data) {
        throw new Error("event_create_failed");
      }

      const created = shift_event_to_view(result.data);

      apply_saved_event(created);
      set_selected_event(created);
      reload();
    },
    [apply_saved_event, reload, t],
  );

  const handle_set_event_color = useCallback(
    async (event: DecryptedCalendarEvent, color: string | null) => {
      if (event.color === color) {
        return event;
      }

      const result = await update_event_occurrence(
        unshift_event_from_view(event),
        unshift_draft_from_view({ ...event_to_draft(event), color }),
        "series",
      );

      if (!result.data) {
        throw new Error("event_update_failed");
      }

      const updated = shift_event_to_view(result.data);

      apply_saved_event(updated, { color: updated.color });
      set_selected_event((current) =>
        current && current.id === event.id ? updated : current,
      );
      reload();

      return updated;
    },
    [apply_saved_event, reload],
  );

  const handle_toggle_task_done = useCallback(
    async (event: DecryptedCalendarEvent) => {
      const result = await update_event_occurrence(
        unshift_event_from_view(event),
        unshift_draft_from_view({
          ...event_to_draft(event),
          is_completed: !event.is_completed,
        }),
        "single",
      );

      if (!result.data) {
        throw new Error("event_update_failed");
      }

      const updated = shift_event_to_view(result.data);

      apply_saved_event(updated);
      set_selected_event((current) =>
        current && current.id === event.id ? updated : current,
      );
      reload();

      return updated;
    },
    [apply_saved_event, reload],
  );

  const handle_move_event_to_calendar = useCallback(
    async (event: DecryptedCalendarEvent, calendar_id: string) => {
      if (event.calendar_id === calendar_id) {
        return event;
      }

      const result = await update_event_occurrence(
        unshift_event_from_view(event),
        unshift_draft_from_view({ ...event_to_draft(event), calendar_id }),
        "series",
      );

      if (!result.data) {
        throw new Error("event_update_failed");
      }

      const updated = shift_event_to_view(result.data);

      apply_saved_event(updated, { calendar_id: updated.calendar_id });
      set_selected_event((current) =>
        current && current.id === event.id ? updated : current,
      );
      reload();

      return updated;
    },
    [apply_saved_event, reload],
  );

  const handle_confirm_delete = useCallback(
    async (scope: RecurrenceEditScope = "series") => {
      if (!event_to_delete) {
        return;
      }

      const to_trash = !has_recurrence(event_to_delete) || scope === "series";

      remove_saved_event(
        to_trash
          ? (event_to_delete.recurrence_master_id ?? event_to_delete.id)
          : event_to_delete.id,
        to_trash,
      );
      set_event_to_delete(null);
      set_selected_event(null);

      let succeeded = false;

      try {
        succeeded = to_trash
          ? Boolean(
              (
                await trash_event(
                  event_to_delete.recurrence_master_id ?? event_to_delete.id,
                )
              ).data,
            )
          : (await delete_event_occurrence(event_to_delete, scope)).success;
      } finally {
        if (!succeeded) {
          reload();
        }
      }

      if (!succeeded) {
        throw new Error("event_delete_failed");
      }
    },
    [event_to_delete, reload, remove_saved_event],
  );

  const handle_restore_trash_entry = useCallback(
    async (entry_id: string) => {
      const result = await restore_trashed_event(entry_id);

      if (!result.data) {
        throw new Error("event_create_failed");
      }

      reload();
    },
    [reload],
  );

  const handle_delete_trash_entry = useCallback(
    (entry_id: string) => {
      void delete_event(entry_id)
        .then((result) => {
          if (!result.success) {
            show_toast(t("calendar.event_delete_failed"), "error");
          }
        })
        .catch(() => {
          show_toast(t("calendar.event_delete_failed"), "error");
        })
        .finally(reload);
    },
    [reload, t],
  );

  const handle_empty_trash = useCallback(() => {
    void Promise.all(trash_entries.map((entry) => delete_event(entry.id)))
      .then((results) => {
        if (results.some((result) => !result.success)) {
          show_toast(t("calendar.event_delete_failed"), "error");
        }
      })
      .catch(() => {
        show_toast(t("calendar.event_delete_failed"), "error");
      })
      .finally(reload);
  }, [reload, t, trash_entries]);

  const handle_restore_trash_entries = useCallback(
    async (entry_ids: string[]) => {
      const results = await Promise.all(
        entry_ids.map((entry_id) =>
          restore_trashed_event(entry_id).catch(() => ({ data: null })),
        ),
      );

      reload();

      return results.filter((result) => Boolean(result.data)).length;
    },
    [reload],
  );

  const handle_delete_trash_entries = useCallback(
    async (entry_ids: string[]) => {
      const purging = pending_purges_ref.current;
      const ids = entry_ids.filter((entry_id) => !purging.has(entry_id));

      for (const entry_id of ids) {
        purging.set(
          entry_id,
          setTimeout(() => {
            void delete_event(entry_id)
              .then((result) => {
                if (!result.success) {
                  show_toast(t("calendar.event_delete_failed"), "error");
                }
              })
              .catch(() => {
                show_toast(t("calendar.event_delete_failed"), "error");
              })
              .finally(() => {
                purging.delete(entry_id);
                reload();
              });
          }, TRASH_PURGE_DELAY_MS),
        );
      }

      const hidden = new Set(ids);

      set_trashed_events((current) =>
        current.filter((event) => !hidden.has(event.id)),
      );

      return entry_ids.length;
    },
    [reload, t],
  );

  const handle_undo_delete_trash_entries = useCallback(
    (entry_ids: string[]) => {
      const purging = pending_purges_ref.current;

      for (const entry_id of entry_ids) {
        const timer = purging.get(entry_id);

        if (timer !== undefined) {
          clearTimeout(timer);
          purging.delete(entry_id);
        }
      }

      reload();
    },
    [reload],
  );

  const handle_scope_edit_cancel = useCallback(() => {
    const pending = pending_scope_edit;

    set_pending_scope_edit(null);

    if (!pending) {
      return;
    }

    const { uid, recurrence_id, sequence, organizer_email, ...edited } =
      pending.draft;

    scope_edit_origin_ref.current = pending.event;
    set_editing_event({
      ...pending.event,
      ...edited,
      uid: uid ?? pending.event.uid,
      recurrence_id: recurrence_id ?? pending.event.recurrence_id,
      sequence: sequence ?? pending.event.sequence,
      organizer_email: organizer_email ?? pending.event.organizer_email,
    });
    set_form_initial_date(new Date(pending.draft.starts_at));
    set_is_form_open(true);
  }, [pending_scope_edit]);

  const handle_scope_edit_confirm = useCallback(
    async (scope: RecurrenceEditScope) => {
      if (!pending_scope_edit) {
        return;
      }

      const result = await update_event_occurrence(
        unshift_event_from_view(pending_scope_edit.event),
        unshift_draft_from_view(pending_scope_edit.draft),
        scope,
      );

      if (!result.data) {
        throw new Error("event_update_failed");
      }

      apply_saved_event(shift_event_to_view(result.data));
      set_pending_scope_edit(null);
      set_selected_event(null);
      reload();
    },
    [apply_saved_event, pending_scope_edit, reload],
  );

  const handle_toggle_calendar = useCallback(
    async (calendar_id: string, is_visible: boolean) => {
      const revert = () => {
        set_calendars((current) =>
          current.map((calendar) =>
            calendar.id === calendar_id
              ? { ...calendar, is_visible: !is_visible }
              : calendar,
          ),
        );
      };

      set_calendars((current) =>
        current.map((calendar) =>
          calendar.id === calendar_id ? { ...calendar, is_visible } : calendar,
        ),
      );

      try {
        const result = await set_calendar_visibility(calendar_id, is_visible);

        if (!result.success) {
          revert();
          show_toast(t("calendar.calendar_update_failed"), "error");

          return;
        }
      } catch {
        revert();
        show_toast(t("calendar.calendar_update_failed"), "error");

        return;
      }

      reload();
    },
    [reload, t],
  );

  const now_tick = use_calendar_now_tick();
  const is_today_visible = useMemo(
    () => now_tick >= range_start && now_tick <= range_end,
    [now_tick, range_start, range_end],
  );

  const is_modal_open =
    is_form_open ||
    event_to_delete !== null ||
    pending_scope_edit !== null ||
    quick_range !== null ||
    is_shortcuts_open ||
    is_go_to_date_open;

  const dismiss_popover = useCallback(() => {
    set_selected_event(null);
    set_quick_range(null);
  }, []);

  const focus_search = useCallback(() => {
    const target =
      search_input_ref.current ??
      document.querySelector<HTMLInputElement>("[data-calendar-search-input]");

    window.dispatchEvent(new CustomEvent("aster-calendar-focus-search"));

    if (target) {
      target.focus();
      target.select();
    }
  }, []);

  useEffect(() => {
    const is_typing_target = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      if (target.isContentEditable) {
        return true;
      }

      const tag = target.tagName.toLowerCase();

      if (tag === "input") {
        return !NON_TEXT_INPUT_TYPES.has((target as HTMLInputElement).type);
      }

      if (tag === "textarea" || tag === "select") {
        return true;
      }

      return target.getAttribute("role") === "textbox";
    };

    const handle_keydown = (event: KeyboardEvent) => {
      const has_modifier = event.ctrlKey || event.metaKey || event.altKey;

      if (event.defaultPrevented || has_modifier) {
        return;
      }

      if (is_typing_target(event.target)) {
        return;
      }

      if (
        event.key.startsWith("Arrow") &&
        event.target instanceof HTMLInputElement &&
        event.target.type === "radio"
      ) {
        return;
      }

      if (event.key === "Escape") {
        if (is_go_to_date_open) {
          set_is_go_to_date_open(false);

          return;
        }

        if (pending_scope_edit !== null) {
          handle_scope_edit_cancel();

          return;
        }

        if (!is_form_open && event_to_delete === null && !is_shortcuts_open) {
          dismiss_popover();
        }

        return;
      }

      if (is_modal_open || !shortcuts_enabled) {
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        set_is_shortcuts_open(true);

        return;
      }

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      if (key === "d" || key === "1") {
        event.preventDefault();
        set_view_mode("day");

        return;
      }

      if (key === "w" || key === "2") {
        event.preventDefault();
        set_view_mode("week");

        return;
      }

      if (key === "m" || key === "3") {
        event.preventDefault();
        set_view_mode("month");

        return;
      }

      if (key === "y" || key === "6") {
        event.preventDefault();
        set_view_mode("year");

        return;
      }

      if (key === "x" || key === "4") {
        event.preventDefault();
        set_view_mode("custom");

        return;
      }

      if (key === "a" || key === "5") {
        event.preventDefault();
        set_view_mode("agenda");

        return;
      }

      if (key === "t") {
        event.preventDefault();
        go_to_today();

        return;
      }

      if (key === "g") {
        event.preventDefault();
        set_is_go_to_date_open(true);

        return;
      }

      const is_rtl = document.documentElement.dir === "rtl";
      const forward_arrow = is_rtl ? "ArrowLeft" : "ArrowRight";
      const backward_arrow = is_rtl ? "ArrowRight" : "ArrowLeft";

      if (key === "j" || key === "n" || key === forward_arrow) {
        event.preventDefault();
        go_to_next();

        return;
      }

      if (key === "k" || key === "p" || key === backward_arrow) {
        event.preventDefault();
        go_to_previous();

        return;
      }

      if (key === "c") {
        event.preventDefault();
        handle_create_click();

        return;
      }

      if (key === "e") {
        if (selected_event) {
          event.preventDefault();
          handle_edit_event(selected_event);
        }

        return;
      }

      if (key === "Delete" || key === "Backspace") {
        if (selected_event) {
          event.preventDefault();
          request_event_delete(selected_event);
        }

        return;
      }

      if (key === "r") {
        event.preventDefault();
        reload();

        return;
      }

      if (key === "s") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("aster-calendar-open-settings"));

        return;
      }

      if (key === "/") {
        event.preventDefault();
        focus_search();
      }
    };

    window.addEventListener("keydown", handle_keydown);

    return () => {
      window.removeEventListener("keydown", handle_keydown);
    };
  }, [
    dismiss_popover,
    event_to_delete,
    focus_search,
    go_to_next,
    go_to_previous,
    go_to_today,
    handle_create_click,
    handle_edit_event,
    handle_scope_edit_cancel,
    is_form_open,
    is_go_to_date_open,
    is_modal_open,
    is_shortcuts_open,
    pending_scope_edit,
    reload,
    request_event_delete,
    selected_event,
    set_view_mode,
    shortcuts_enabled,
  ]);

  return {
    t,
    preferences,
    anchor_date,
    selected_date,
    view_mode,
    custom_view_days,
    week_start_day,
    events: visible_events,
    trash_entries,
    agenda_groups,
    calendars,
    calendar_by_id,
    is_loading,
    load_failed,
    reload,
    is_today_visible,
    selected_event,
    editing_event,
    is_form_open,
    form_initial_date,
    event_to_delete,
    booking_to_cancel,
    set_booking_to_cancel,
    handle_confirm_cancel_booking,
    search_query,
    applied_search_query,
    is_search_pending,
    is_search_window_loading,
    prefetch_search_window,
    available_tags,
    selected_tags,
    handle_toggle_tag,
    handle_year_day_click,
    handle_year_month_click,
    range_start,
    range_end,
    period_end,
    agenda_day_count,
    agenda_has_more,
    is_agenda_loading_more,
    load_more_agenda,
    set_search_query,
    set_selected_event,
    set_event_to_delete: request_event_delete,
    set_view_mode,
    clear_search,
    handle_page_to_day,
    go_to_today,
    go_to_previous,
    go_to_next,
    quick_range,
    dismiss_quick_range,
    handle_range_select,
    handle_quick_save,
    handle_quick_more_options,
    handle_event_reschedule,
    handle_restore_event,
    handle_day_click,
    handle_day_double_click,
    handle_slot_double_click,
    handle_week_number_click,
    handle_create_click,
    handle_create_in_calendar,
    handle_create_task_click,
    handle_create_all_day_click,
    handle_event_click,
    handle_event_respond,
    handle_edit_event,
    form_initial_draft,
    form_initial_kind,
    handle_form_close,
    handle_form_submit,
    handle_duplicate_event,
    handle_toggle_task_done,
    handle_move_event_to_calendar,
    handle_set_event_color,
    handle_confirm_delete,
    pending_scope_edit,
    handle_scope_edit_cancel,
    handle_scope_edit_confirm,
    handle_toggle_calendar,
    handle_restore_trash_entry,
    handle_delete_trash_entry,
    handle_empty_trash,
    handle_restore_trash_entries,
    handle_delete_trash_entries,
    handle_undo_delete_trash_entries,
    is_same_day,
    is_modal_open,
    is_shortcuts_open,
    set_is_shortcuts_open,
    is_go_to_date_open,
    set_is_go_to_date_open,
    is_insights_open,
    set_is_insights_open,
    load_events_in_range,
    search_input_ref,
    nav_direction,
    nav_token,
    self_email,
    focus_search,
    dismiss_popover,
  };
}

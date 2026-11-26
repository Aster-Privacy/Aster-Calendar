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
import type { DecryptedCalendar } from "@/types/calendar";
import type { BusyFeedSummary } from "@/services/calendar/busy_feed";

import { useCallback, useEffect, useState } from "react";
import { IslandRow, IslandSection, show_toast } from "@aster/ui";
import {
  ClipboardDocumentIcon,
  EllipsisHorizontalIcon,
  ShareIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { copy_text_or_throw } from "@/utils/copy_text";
import {
  create_busy_feed_link,
  list_busy_feeds,
  publish_busy_calendar,
  revoke_busy_feed,
} from "@/services/calendar/busy_feed";

export interface BusyFeedsState {
  feeds: Map<string, BusyFeedSummary>;
  is_available: boolean | null;
  reload: () => Promise<void>;
}

interface BusyFeedsSnapshot {
  feeds: Map<string, BusyFeedSummary>;
  is_available: boolean | null;
}

const busy_feeds_cache = new Map<string, BusyFeedsSnapshot>();

const EMPTY_BUSY_FEEDS: BusyFeedsSnapshot = {
  feeds: new Map(),
  is_available: null,
};

export function busy_feeds_settled(is_available: boolean | null): boolean {
  return is_available !== null;
}

export function forget_busy_feeds_cache(): void {
  busy_feeds_cache.clear();
}

export function use_busy_feeds(): BusyFeedsState {
  const { user } = use_auth();
  const cache_key = user?.id ?? "";
  const [snapshot, set_snapshot] = useState<BusyFeedsSnapshot>(
    () => busy_feeds_cache.get(cache_key) ?? EMPTY_BUSY_FEEDS,
  );

  const store = useCallback(
    (next: BusyFeedsSnapshot) => {
      if (cache_key) busy_feeds_cache.set(cache_key, next);
      set_snapshot(next);
    },
    [cache_key],
  );

  const reload = useCallback(async () => {
    try {
      const result = await list_busy_feeds();

      if (!result.data) {
        store({ feeds: new Map(), is_available: false });

        return;
      }

      store({
        feeds: new Map(
          result.data.feeds.map((feed) => [feed.calendar_id, feed]),
        ),
        is_available: true,
      });
    } catch {
      store({ feeds: new Map(), is_available: false });
    }
  }, [store]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...snapshot, reload };
}

interface CalendarBusyFeedSectionProps {
  calendars: DecryptedCalendar[];
  busy_feeds: BusyFeedsState;
}

interface LinkDialogState {
  calendar_name: string;
  feed_url: string;
}

export function CalendarBusyFeedSection({
  calendars,
  busy_feeds,
}: CalendarBusyFeedSectionProps) {
  const { t, language } = use_i18n();
  const { user } = use_auth();
  const { preferences, update_preference } = use_preferences();
  const opt_ins = preferences.calendar_busy_feed_calendars ?? [];
  const { feeds, is_available, reload } = busy_feeds;
  const [working_id, set_working_id] = useState<string | null>(null);
  const [link_dialog, set_link_dialog] = useState<LinkDialogState | null>(null);
  const [stop_target, set_stop_target] = useState<DecryptedCalendar | null>(
    null,
  );
  const [renew_target, set_renew_target] = useState<DecryptedCalendar | null>(
    null,
  );

  const format_updated = (value: string | null) => {
    if (!value) return t("calendar.busy_feed_waiting");

    try {
      return t("calendar.busy_feed_updated", {
        time: new Intl.DateTimeFormat(language, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: preferences.time_format === "12h",
        }).format(new Date(value)),
      });
    } catch {
      return t("calendar.busy_feed_waiting");
    }
  };

  const opt_in = (calendar_id: string): readonly string[] => {
    if (opt_ins.includes(calendar_id)) return opt_ins;

    const next = [...opt_ins, calendar_id];

    update_preference("calendar_busy_feed_calendars", next, true);

    return next;
  };

  const opt_out = (calendar_id: string) => {
    if (!opt_ins.includes(calendar_id)) return;

    update_preference(
      "calendar_busy_feed_calendars",
      opt_ins.filter((id) => id !== calendar_id),
      true,
    );
  };

  const publish_now = async (
    calendar_id: string,
    allowed: readonly string[],
  ): Promise<boolean> => {
    try {
      return (
        (await publish_busy_calendar(
          calendar_id,
          user?.email ?? null,
          () => allowed,
          { force: true },
        )) !== null
      );
    } catch {
      return false;
    }
  };

  const issue_link = async (calendar: DecryptedCalendar) => {
    if (working_id) return;

    set_working_id(calendar.id);

    try {
      const created = await create_busy_feed_link(calendar.id);

      if (!created.data) {
        show_toast(t("calendar.busy_feed_error"), "error");

        return;
      }

      const allowed = opt_in(calendar.id);

      if (!(await publish_now(calendar.id, allowed))) {
        show_toast(t("calendar.busy_feed_publish_later"), "info");
      }

      set_link_dialog({
        calendar_name: calendar.name,
        feed_url: created.data.feed_url,
      });
      await reload();
    } catch {
      show_toast(t("calendar.busy_feed_error"), "error");
    } finally {
      set_working_id(null);
    }
  };

  const resume_sharing = async (calendar: DecryptedCalendar) => {
    if (working_id) return;

    set_working_id(calendar.id);

    try {
      const allowed = opt_in(calendar.id);

      if (await publish_now(calendar.id, allowed)) {
        show_toast(t("calendar.busy_feed_resumed"), "success");
      } else {
        show_toast(t("calendar.busy_feed_resumed_later"), "info");
      }

      await reload();
    } finally {
      set_working_id(null);
    }
  };

  const stop_sharing = async () => {
    const calendar = stop_target;

    if (!calendar || working_id) return;

    set_working_id(calendar.id);
    const previous_opt_ins = opt_ins;
    const restore_opt_in = () => {
      if (previous_opt_ins.includes(calendar.id)) {
        update_preference(
          "calendar_busy_feed_calendars",
          previous_opt_ins,
          true,
        );
      }
    };

    opt_out(calendar.id);

    try {
      const result = await revoke_busy_feed(calendar.id);

      if (result.error && result.status !== 404) {
        restore_opt_in();
        show_toast(t("calendar.busy_feed_error"), "error");

        return;
      }

      show_toast(t("calendar.busy_feed_stopped"), "success");
      set_stop_target(null);
      await reload();
    } catch {
      restore_opt_in();
      show_toast(t("calendar.busy_feed_error"), "error");
    } finally {
      set_working_id(null);
    }
  };

  const copy_link = async () => {
    if (!link_dialog) return;

    try {
      await copy_text_or_throw(link_dialog.feed_url);
      show_toast(t("calendar.busy_feed_copied"), "success");
    } catch {
      show_toast(t("common.failed_to_copy_to_clipboard"), "error");
    }
  };

  if (is_available !== true || calendars.length === 0) {
    return null;
  }

  return (
    <>
      <IslandSection
        divided
        description={t("calendar.busy_feed_section_desc")}
        icon={<ShareIcon />}
        title={t("calendar.busy_feed_section_title")}
      >
        {calendars.map((calendar) => {
          const feed = feeds.get(calendar.id);
          const has_link = feed !== undefined;
          const is_shared = has_link && opt_ins.includes(calendar.id);
          const is_paused = has_link && !is_shared;

          return (
            <IslandRow
              key={calendar.id}
              description={
                is_shared
                  ? format_updated(feed.published_at)
                  : is_paused
                    ? t("calendar.busy_feed_paused")
                    : t("calendar.busy_feed_not_shared")
              }
              icon={
                <span
                  className="block h-3 w-3 rounded-[4px]"
                  style={{ backgroundColor: calendar.color }}
                />
              }
              label={<span className="min-w-0 truncate">{calendar.name}</span>}
              toggle={{
                aria_label: t("calendar.busy_feed_toggle_label", {
                  name: calendar.name,
                }),
                checked: is_shared,
                disabled: working_id !== null,
                on_change: (next) => {
                  if (next && is_paused) {
                    void resume_sharing(calendar);
                  } else if (next) {
                    void issue_link(calendar);
                  } else {
                    set_stop_target(calendar);
                  }
                },
              }}
              trailing={
                has_link ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={t("calendar.busy_feed_options", {
                          name: calendar.name,
                        })}
                        className="h-8 w-8 rounded-full"
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <EllipsisHorizontalIcon className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[190px]">
                      {is_shared && (
                        <DropdownMenuItem
                          onSelect={() => set_renew_target(calendar)}
                        >
                          {t("calendar.busy_feed_new_link")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-danger focus:text-danger"
                        onSelect={() => set_stop_target(calendar)}
                      >
                        {t("calendar.busy_feed_stop")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : undefined
              }
            />
          );
        })}
      </IslandSection>

      <Modal
        is_open={link_dialog !== null}
        size="md"
        on_close={() => set_link_dialog(null)}
      >
        <ModalHeader>
          <ModalTitle>{t("calendar.busy_feed_link_title")}</ModalTitle>
          <ModalDescription>
            {t("calendar.busy_feed_link_desc", {
              name: link_dialog?.calendar_name ?? "",
            })}
          </ModalDescription>
        </ModalHeader>
        <ModalBody>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              aria-label={t("calendar.busy_feed_link_title")}
              className="font-mono text-[12px]"
              data-busy-feed-url=""
              value={link_dialog?.feed_url ?? ""}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button
              className="shrink-0 whitespace-nowrap"
              size="md"
              variant="secondary"
              onClick={() => void copy_link()}
            >
              <ClipboardDocumentIcon className="w-4 h-4 me-1.5" />
              {t("calendar.busy_feed_copy")}
            </Button>
          </div>
          <p className="mt-4 text-[13px] leading-5 text-txt-secondary">
            {t("calendar.busy_feed_shared_detail")}
          </p>
          <p className="mt-2 text-[13px] leading-5 text-txt-secondary">
            {t("calendar.busy_feed_keep_private")}
          </p>
        </ModalBody>
        <ModalFooter>
          <Button onClick={() => set_link_dialog(null)}>
            {t("common.done")}
          </Button>
        </ModalFooter>
      </Modal>

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("calendar.busy_feed_stop")}
        is_loading={working_id !== null}
        is_open={stop_target !== null}
        message={t("calendar.busy_feed_stop_message")}
        on_cancel={() => set_stop_target(null)}
        on_confirm={() => void stop_sharing()}
        title={t("calendar.busy_feed_stop_title")}
        variant="danger"
      />

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("calendar.busy_feed_new_link")}
        is_loading={working_id !== null}
        is_open={renew_target !== null}
        message={t("calendar.busy_feed_new_link_message")}
        on_cancel={() => set_renew_target(null)}
        on_confirm={() => {
          const target = renew_target;

          set_renew_target(null);

          if (target) void issue_link(target);
        }}
        title={t("calendar.busy_feed_new_link_title")}
      />
    </>
  );
}

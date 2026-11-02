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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Switch } from "@aster/ui";

import { is_mac_platform } from "@/lib/utils";
import { use_preferences } from "@/contexts/preferences_context";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface CalendarShortcutsModalProps {
  is_open: boolean;
  on_close: () => void;
}

interface CalendarShortcut {
  keys: string[];
  label: string;
}

interface CalendarShortcutSection {
  title: string;
  shortcuts: CalendarShortcut[];
}

function render_keys(keys: string[]) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((key, index) => (
        <kbd
          key={`${key}-${index}`}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-[7px] bg-[var(--aster-dialog-bg,var(--modal-bg))] px-1.5 font-sans text-[12px] font-semibold text-txt-primary shadow-[inset_0_-1px_0_var(--aster-floating-divider),0_0_0_1px_var(--aster-floating-divider)]"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

export function CalendarShortcutsModal({
  is_open,
  on_close,
}: CalendarShortcutsModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { preferences, update_preference } = use_preferences();
  const shortcuts_enabled = preferences.calendar_keyboard_shortcuts_enabled;
  const [is_mac, set_is_mac] = useState(false);
  const modal_ref = useRef<HTMLDivElement>(null);
  const close_button_ref = useRef<HTMLButtonElement>(null);
  const previous_active_element = useRef<Element | null>(null);

  useEffect(() => {
    set_is_mac(is_mac_platform());
  }, []);

  useEffect(() => {
    if (is_open) {
      previous_active_element.current = document.activeElement;
      close_button_ref.current?.focus();
    } else if (previous_active_element.current instanceof HTMLElement) {
      previous_active_element.current.focus();
    }
  }, [is_open]);

  const handle_keydown = useCallback(
    (e: KeyboardEvent) => {
      if (!is_open) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        on_close();

        return;
      }

      if (e.key === "Tab" && modal_ref.current) {
        const focusable = modal_ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [is_open, on_close],
  );

  useEffect(() => {
    if (!is_open) return;
    document.addEventListener("keydown", handle_keydown, { capture: true });

    return () => {
      document.removeEventListener("keydown", handle_keydown, {
        capture: true,
      });
    };
  }, [is_open, handle_keydown]);

  const sections = useMemo<CalendarShortcutSection[]>(() => {
    const modifier_key = is_mac ? "⌘" : "Ctrl";

    return [
      {
        title: t("calendar.shortcuts_group_navigation"),
        shortcuts: [
          { keys: ["T"], label: t("calendar.shortcuts_today") },
          { keys: ["J"], label: t("calendar.shortcuts_next") },
          { keys: ["K"], label: t("calendar.shortcuts_previous") },
          { keys: ["G"], label: t("calendar.go_to_date_title") },
          { keys: ["/"], label: t("calendar.shortcuts_search") },
          { keys: ["?"], label: t("calendar.shortcuts_help") },
        ],
      },
      {
        title: t("calendar.shortcuts_group_views"),
        shortcuts: [
          { keys: ["D"], label: t("calendar.shortcuts_day_view") },
          { keys: ["W"], label: t("calendar.shortcuts_week_view") },
          { keys: ["M"], label: t("calendar.shortcuts_month_view") },
          { keys: ["Y"], label: t("calendar.shortcuts_year_view") },
          { keys: ["A"], label: t("calendar.shortcuts_agenda_view") },
          { keys: ["X"], label: t("calendar.custom_view") },
        ],
      },
      {
        title: t("calendar.shortcuts_group_actions"),
        shortcuts: [
          { keys: ["C"], label: t("calendar.shortcuts_create") },
          { keys: ["E"], label: t("calendar.shortcuts_edit_selected") },
          { keys: ["Del"], label: t("calendar.shortcuts_delete_selected") },
          { keys: [modifier_key, "Z"], label: t("calendar.shortcuts_undo") },
          { keys: ["R"], label: t("calendar.shortcuts_refresh") },
          { keys: ["S"], label: t("calendar.shortcuts_settings") },
          { keys: ["Esc"], label: t("calendar.shortcuts_dismiss") },
        ],
      },
    ];
  }, [is_mac, t]);

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          aria-labelledby="calendar-shortcuts-title"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          role="dialog"
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
        >
          <div
            aria-hidden="true"
            className="aster_scrim absolute inset-0"
            onClick={on_close}
          />
          <motion.div
            ref={modal_ref}
            animate={{ opacity: 1, scale: 1 }}
            className="relative flex max-h-[min(85dvh,calc(100dvh-32px))] w-full max-w-4xl flex-col overflow-hidden rounded-[var(--aster-radius-floating,16px)] bg-[var(--aster-dialog-bg,var(--modal-bg))] shadow-[var(--aster-floating-shadow)]"
            exit={{ opacity: 0, scale: 0.97 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.97 }}
            transition={{ duration: reduce_motion ? 0 : 0.15, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between gap-4 px-6 pb-4 pt-5">
              <h2
                className="text-[17px] font-semibold text-txt-primary"
                id="calendar-shortcuts-title"
              >
                {t("calendar.shortcuts_title")}
              </h2>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-txt-secondary">
                  {t("common.enable_shortcuts")}
                  <Switch
                    aria-label={t("common.enable_shortcuts")}
                    checked={shortcuts_enabled}
                    size="sm"
                    onCheckedChange={() =>
                      update_preference(
                        "calendar_keyboard_shortcuts_enabled",
                        !shortcuts_enabled,
                        true,
                      )
                    }
                  />
                </label>
                <button
                  ref={close_button_ref}
                  aria-label={t("common.close")}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-txt-muted transition-colors hover:bg-[var(--aster-hover)] hover:text-txt-primary"
                  type="button"
                  onClick={on_close}
                >
                  <XMarkIcon aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div
              className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-2"
              style={{ scrollbarWidth: "thin" }}
            >
              {!shortcuts_enabled && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--aster-dialog-bg,var(--modal-bg))]/90">
                  <span className="rounded-[var(--aster-radius-control)] bg-[var(--aster-field-bg)] px-4 py-2 text-[13px] font-medium text-txt-secondary">
                    {t("common.shortcuts_disabled_message")}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2">
                {sections.map((section) => (
                  <section key={section.title}>
                    <h3 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wider text-txt-muted">
                      {section.title}
                    </h3>
                    <div className="overflow-hidden rounded-[var(--aster-radius-control,16px)] bg-[var(--aster-field-bg)]">
                      {section.shortcuts.map((shortcut, index) => (
                        <div
                          key={shortcut.label}
                          className={`flex h-11 items-center justify-between gap-4 px-4 ${index > 0 ? "border-t border-[var(--aster-floating-divider)]" : ""}`}
                        >
                          <span className="truncate text-[14px] text-txt-primary">
                            {shortcut.label}
                          </span>
                          <span className="flex flex-shrink-0 items-center">
                            {render_keys(shortcut.keys)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 px-6 py-4 text-[13px] text-txt-muted">
              <span className="flex items-center gap-2">
                {t("common.press_label")}
                {render_keys(["?"])}
                {t("common.anywhere_to_open_shortcuts")}
              </span>
              <span className="flex items-center gap-2">
                {t("common.showing_shortcuts_for")}
                <span className="rounded-full bg-[var(--aster-field-bg)] px-2.5 py-1 font-medium text-txt-secondary">
                  {is_mac ? t("settings.macos") : t("settings.windows_linux")}
                </span>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

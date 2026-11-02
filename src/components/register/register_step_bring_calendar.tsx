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
import type { UseRegistrationReturn } from "@/components/register/hooks/use_registration";

import {
  ChevronRightIcon,
  DocumentArrowUpIcon,
} from "@heroicons/react/24/outline";
import { useRef, useState } from "react";

import { SkipLink, StepShell } from "@/components/register/register_shared";
import { set_pending_onboarding_import } from "@/lib/calendar_onboarding_import";

interface RegisterStepBringCalendarProps {
  reg: UseRegistrationReturn;
}

const ICS_ACCEPT = ".ics,.ical,text/calendar";

const LockIcon = () => (
  <svg
    className="h-3.5 w-3.5 flex-shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
  >
    <path
      d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const RegisterStepBringCalendar = ({
  reg,
}: RegisterStepBringCalendarProps) => {
  const [is_busy, set_is_busy] = useState(false);
  const input_ref = useRef<HTMLInputElement>(null);

  const finish = async (files: File[]) => {
    if (is_busy) return;
    set_is_busy(true);
    try {
      if (files.length > 0) set_pending_onboarding_import(files);
      await reg.finalize_registration("/");
    } catch {
      set_is_busy(false);
    }
  };

  const handle_files = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    event.target.value = "";
    if (files.length === 0) return;
    void finish(files);
  };

  return (
    <StepShell
      step_key="bring_calendar"
      subtitle={reg.t("auth.bring_calendar_desc")}
      title={reg.t("auth.bring_calendar_title")}
    >
      <input
        ref={input_ref}
        multiple
        accept={ICS_ACCEPT}
        className="hidden"
        type="file"
        onChange={handle_files}
      />
      <div className="w-full overflow-hidden rounded-2xl bg-black/[0.05] dark:bg-white/[0.08]">
        <button
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--aster-hover)] disabled:cursor-default disabled:opacity-50"
          disabled={is_busy}
          type="button"
          onClick={() => input_ref.current?.click()}
        >
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-white/[0.08]">
            <DocumentArrowUpIcon className="h-6 w-6 text-txt-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-txt-primary">
              {reg.t("auth.bring_calendar_import_label")}
            </span>
            <span className="block truncate text-xs text-txt-tertiary">
              {reg.t("auth.bring_calendar_import_hint")}
            </span>
          </span>
          <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-txt-muted rtl:-scale-x-100" />
        </button>
      </div>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-txt-muted">
        <LockIcon />
        <span>{reg.t("auth.bring_calendar_privacy_note")}</span>
      </p>

      <SkipLink
        disabled={is_busy}
        label={reg.t("auth.skip_for_now")}
        on_click={() => void finish([])}
      />
    </StepShell>
  );
};

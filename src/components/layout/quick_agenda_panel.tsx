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
import type { DecryptedCalendarEvent } from "@/types/calendar";

import { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

import { DatedCalendarImage } from "@/components/icons/dated_calendar_image";
import { request_open_calendar_event } from "@/components/calendar/up_next_card";
import { use_panel_transition } from "@/components/layout/use_panel_transition";
import { use_panel_inset } from "@/hooks/use_panel_inset";
import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { PanelBody } from "@/pages/mail_panel/mail_panel_page";

interface QuickAgendaPanelProps {
  is_open: boolean;
  is_swapping: boolean;
  on_close: () => void;
}

export function QuickAgendaPanel({
  is_open,
  is_swapping,
  on_close,
}: QuickAgendaPanelProps) {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const panel_ref = useRef<HTMLElement | null>(null);
  const { is_visible, is_closing } = use_panel_transition(is_open, is_swapping);

  use_escape_layer(is_open, on_close, "quick_agenda_panel", false);
  use_panel_inset(is_visible, panel_ref);

  const open_in_calendar = useCallback(
    (event: DecryptedCalendarEvent) => {
      navigate("/");
      request_open_calendar_event(event);
    },
    [navigate],
  );

  return (
    <aside
      ref={panel_ref}
      aria-label={t("common.app_name_calendar")}
      className={`quick_agenda_panel absolute inset-y-0 start-0 end-1.5 flex-col overflow-hidden rounded-lg bg-surf-primary md:end-2.5 md:rounded-xl ${
        is_visible ? "flex" : "hidden"
      } ${is_closing ? "quick_panel_closing" : "z-10"}`}
    >
      <div className="flex h-12 flex-shrink-0 items-center gap-2 ps-3 pe-2">
        <DatedCalendarImage
          className="h-[18px] w-[18px] flex-shrink-0"
          kind="app"
        />
        <h2 className="flex-1 truncate text-[15px] font-medium text-txt-primary">
          {t("common.app_name_calendar")}
        </h2>
        <Tooltip position="bottom" tip={t("common.close")}>
          <Button
            aria-label={t("common.close")}
            className="h-8 w-8 flex-shrink-0 text-[var(--icon-muted)]"
            size="icon"
            variant="ghost"
            onClick={on_close}
          >
            <XMarkIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>
      {is_visible && <PanelBody on_open_in_calendar={open_in_calendar} />}
    </aside>
  );
}

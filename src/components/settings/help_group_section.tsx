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
import { useMemo } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { SettingsTabBar } from "@/components/settings/settings_tab_bar";
import { use_settings_tabs } from "@/components/settings/use_settings_tabs";
import { FeedbackSection } from "@/components/settings/feedback_section";
import { UpdatesSection } from "@/components/settings/updates_section";

type HelpTab = "feedback" | "updates";

interface HelpGroupSectionProps {
  show_updates: boolean;
}

export function HelpGroupSection({
  show_updates,
}: HelpGroupSectionProps) {
  const { t } = use_i18n();
  const tab_keys = useMemo<readonly HelpTab[]>(() => {
    const keys: HelpTab[] = ["feedback"];

    if (show_updates) keys.push("updates");

    return keys;
  }, [show_updates]);
  const { active_tab, handle_tab_change, render_tab } = use_settings_tabs(
    tab_keys,
    "feedback",
  );

  return (
    <div className="space-y-6">
      {tab_keys.length > 1 && (
        <SettingsTabBar
          active={active_tab}
          layout_id="help-group"
          on_change={handle_tab_change}
          tabs={tab_keys.map((key) => ({
            key,
            label:
              key === "feedback"
                ? t("settings.feedback")
                : t("settings.updates"),
          }))}
        />
      )}

      {render_tab("feedback", <FeedbackSection />)}
      {show_updates && render_tab("updates", <UpdatesSection />)}
    </div>
  );
}

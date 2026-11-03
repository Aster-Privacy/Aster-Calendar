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
import { useLayoutEffect } from "react";

import { use_auth_safe } from "@/contexts/auth_context";

export function format_app_title(
  custom_title: string,
  user_name: string,
  app_name: string,
): string {
  const trimmed = user_name.trim();
  const workspace = trimmed
    ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)} | ${app_name}`
    : app_name;

  return custom_title ? `${custom_title} | ${workspace}` : workspace;
}

export function use_app_document_title(
  custom_title: string,
  app_name: string,
): void {
  const auth = use_auth_safe();
  const user = auth?.user ?? null;
  const user_name = user?.display_name || user?.username || "";
  const title = format_app_title(custom_title, user_name, app_name);

  useLayoutEffect(() => {
    if (document.title !== title) {
      document.title = title;
    }
  }, [title]);
}

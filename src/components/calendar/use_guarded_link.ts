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
import type { MouseEvent } from "react";

import { useCallback } from "react";

import { use_external_link } from "@/contexts/external_link_context";

export function use_guarded_link() {
  const { handle_external_link } = use_external_link();

  const guard_link_click = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.type === "auxclick" && event.button !== 1) {
        return;
      }

      event.preventDefault();
      handle_external_link(event.currentTarget.href);
    },
    [handle_external_link],
  );

  return { guard_link_click, open_guarded_link: handle_external_link };
}

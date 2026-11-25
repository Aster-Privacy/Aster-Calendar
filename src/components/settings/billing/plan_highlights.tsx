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
import type { ReactNode } from "react";

import { CheckCircleIcon } from "@heroicons/react/24/outline";

export function PlanCheckList({ rows }: { rows: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row, index) => (
        <li
          key={index}
          className="flex items-start gap-2.5 text-[13.5px] leading-snug text-txt-primary"
        >
          <CheckCircleIcon
            aria-hidden="true"
            className="mt-[1px] h-[18px] w-[18px] shrink-0"
            strokeWidth={2}
            style={{ color: "var(--accent-blue)" }}
          />
          <span className="flex-1">{row}</span>
        </li>
      ))}
    </ul>
  );
}

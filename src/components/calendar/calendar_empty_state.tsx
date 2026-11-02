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

import { motion, useReducedMotion } from "framer-motion";

interface CalendarEmptyStateProps {
  illustration: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
  "data-testid"?: string;
}

export function CalendarEmptyState({
  illustration,
  title,
  body,
  action,
  className = "",
  compact = false,
  "data-testid": test_id,
}: CalendarEmptyStateProps) {
  const reduced_motion = useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className={`flex flex-col items-center justify-center text-center ${compact ? "px-4 py-8" : "px-6 py-16"} ${className}`}
      data-testid={test_id}
      initial={reduced_motion ? false : { opacity: 0 }}
      transition={{ duration: reduced_motion ? 0 : 0.12, ease: [0.2, 0, 0, 1] }}
    >
      <div
        aria-hidden="true"
        className={`mb-4 text-txt-muted ${compact ? "[&>svg]:h-10 [&>svg]:w-10" : ""}`}
      >
        {illustration}
      </div>
      <h3
        className={`font-semibold text-txt-primary ${compact ? "text-[14px]" : "text-base"}`}
      >
        {title}
      </h3>
      <p
        className={`mt-1.5 max-w-sm text-txt-secondary ${compact ? "text-[12.5px]" : "text-sm"}`}
      >
        {body}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}

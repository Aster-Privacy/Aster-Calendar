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

import { XMarkIcon } from "@heroicons/react/24/outline";
import { motion, useReducedMotion } from "framer-motion";

interface CalendarEmptyStateProps {
  illustration: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
  "data-testid"?: string;
  on_close?: () => void;
  close_label?: string;
}

export function CalendarEmptyState({
  illustration,
  title,
  body,
  action,
  className = "",
  compact = false,
  "data-testid": test_id,
  on_close,
  close_label,
}: CalendarEmptyStateProps) {
  const reduced_motion = useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className={`relative flex flex-col items-center justify-center text-center ${compact ? "px-4 py-8" : "px-6 py-16"} ${className}`}
      data-testid={test_id}
      initial={reduced_motion ? false : { opacity: 0 }}
      transition={{ duration: reduced_motion ? 0 : 0.12, ease: [0.2, 0, 0, 1] }}
    >
      {on_close && (
        <button
          aria-label={close_label}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-txt-muted transition-colors hover:bg-[var(--aster-hover)] hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
          data-testid="calendar-empty-state-close"
          type="button"
          onClick={on_close}
        >
          <XMarkIcon aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
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

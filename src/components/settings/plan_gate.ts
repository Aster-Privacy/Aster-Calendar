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
export interface PlanSettledInput {
  has_limits: boolean;
  plan_code: string | null;
  is_loading: boolean;
}

export function plan_settled(input: PlanSettledInput): boolean {
  return input.has_limits || input.plan_code !== null || !input.is_loading;
}

export function is_paid_plan_code(
  plan_code: string | null,
  load_failed: boolean,
): boolean {
  if (plan_code) return plan_code !== "free";

  return load_failed;
}

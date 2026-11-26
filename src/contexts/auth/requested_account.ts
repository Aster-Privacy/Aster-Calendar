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
import { is_handoff_user_id } from "@/lib/session_handoff/session_handoff_protocol";

export const REQUESTED_ACCOUNT_PARAM = "account";

export interface BootAccountCandidate {
  id: string;
  kind?: "personal" | "shared";
}

export type BootAccountPlan =
  | { kind: "use_current" }
  | { kind: "switch"; account_id: string }
  | { kind: "sign_in"; account_id: string };

export function read_requested_account(search: string): string | null {
  try {
    const value = new URLSearchParams(search).get(REQUESTED_ACCOUNT_PARAM);

    return is_handoff_user_id(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function requested_account(): string | null {
  if (typeof window === "undefined") return null;

  return read_requested_account(window.location.search);
}

export function needs_requested_handoff(
  requested: string | null,
  current_id: string | null,
): boolean {
  return requested !== null && requested !== current_id;
}

export function plan_boot_account(
  requested: string | null,
  current_id: string | null,
  accounts: readonly BootAccountCandidate[],
): BootAccountPlan {
  if (requested === null || requested === current_id) {
    return { kind: "use_current" };
  }

  const match = accounts.find(
    (account) => account.id === requested && account.kind !== "shared",
  );

  if (match) return { kind: "switch", account_id: match.id };

  return { kind: "sign_in", account_id: requested };
}

export function allows_account_adoption(
  requested: string | null,
  account_id: string,
): boolean {
  return requested === null || requested === account_id;
}

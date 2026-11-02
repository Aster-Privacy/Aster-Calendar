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
let pending_files: File[] = [];

export function set_pending_onboarding_import(files: File[]): void {
  pending_files = files.slice();
}

export function has_pending_onboarding_import(): boolean {
  return pending_files.length > 0;
}

export function take_pending_onboarding_import(): File[] {
  const files = pending_files;

  pending_files = [];

  return files;
}

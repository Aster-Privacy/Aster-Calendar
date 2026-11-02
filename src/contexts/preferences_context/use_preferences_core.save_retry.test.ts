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

import { describe, expect, it, vi } from "vitest";

import {
  can_rewrite_unusable_blob,
  compute_save_retry_delay,
} from "./use_preferences_core";

describe("compute_save_retry_delay", () => {
  it("backs off exponentially from the base delay", () => {
    expect(compute_save_retry_delay(0)).toBe(3000);
    expect(compute_save_retry_delay(1)).toBe(6000);
    expect(compute_save_retry_delay(2)).toBe(12000);
  });

  it("caps the delay so a long outage does not push retries out forever", () => {
    expect(compute_save_retry_delay(5)).toBe(60000);
  });

  it("stops retrying once the attempt budget is spent", () => {
    expect(compute_save_retry_delay(6)).toBeNull();
    expect(compute_save_retry_delay(40)).toBeNull();
  });
});

describe("can_rewrite_unusable_blob", () => {
  it("never rewrites an undecryptable blob while the account key is still loading", async () => {
    const confirm = vi.fn(async () => true);

    await expect(
      can_rewrite_unusable_blob(true, () => true, confirm),
    ).resolves.toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("refuses when the session cannot be confirmed as the same account", async () => {
    await expect(
      can_rewrite_unusable_blob(true, () => false, async () => false),
    ).resolves.toBe(false);
    await expect(
      can_rewrite_unusable_blob(false, () => false, async () => false),
    ).resolves.toBe(false);
  });

  it("refuses when the identity check throws", async () => {
    await expect(
      can_rewrite_unusable_blob(false, () => false, async () => {
        throw new Error("offline");
      }),
    ).resolves.toBe(false);
  });

  it("allows the recovery rewrite once the key is loaded and the account is confirmed", async () => {
    await expect(
      can_rewrite_unusable_blob(true, () => false, async () => true),
    ).resolves.toBe(true);
    await expect(
      can_rewrite_unusable_blob(false, () => true, async () => true),
    ).resolves.toBe(true);
  });
});

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
import { describe, it, expect, afterEach } from "vitest";

import {
  REQUESTED_ACCOUNT_PARAM,
  allows_account_adoption,
  needs_requested_handoff,
  plan_boot_account,
  read_requested_account,
  requested_account,
} from "./requested_account";

const FINDLEY_ID = "0b6f1c2e-4a3d-4c8e-9f10-2a3b4c5d6e7f";
const HELLO_ID = "7e6d5c4b-3a2b-4c1d-8e0f-9a8b7c6d5e4f";

const original_location = window.location;

function set_location(url: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(url),
  });
}

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: original_location,
  });
});

describe("requested account with two accounts on this device", () => {
  it("reads the account the launcher link names on any page", () => {
    expect(REQUESTED_ACCOUNT_PARAM).toBe("account");
    expect(read_requested_account(`?account=${FINDLEY_ID}`)).toBe(FINDLEY_ID);
    expect(read_requested_account(`?account=${FINDLEY_ID.toUpperCase()}`)).toBe(
      FINDLEY_ID,
    );
    expect(read_requested_account("?account=not-a-user")).toBeNull();
    expect(read_requested_account("")).toBeNull();

    set_location(
      `https://calendar.astermail.org/?account=${FINDLEY_ID}#handoff=x`,
    );
    expect(requested_account()).toBe(FINDLEY_ID);
    set_location(`https://calendar.astermail.org/week?account=${HELLO_ID}`);
    expect(requested_account()).toBe(HELLO_ID);
  });

  it("switches to the requested account when it is stored", () => {
    expect(
      plan_boot_account(FINDLEY_ID, HELLO_ID, [
        { id: HELLO_ID, kind: "personal" },
        { id: FINDLEY_ID, kind: "personal" },
      ]),
    ).toEqual({ kind: "switch", account_id: FINDLEY_ID });
  });

  it("asks for a sign-in instead of restoring the stored other account", () => {
    expect(
      plan_boot_account(FINDLEY_ID, HELLO_ID, [{ id: HELLO_ID, kind: "personal" }]),
    ).toEqual({ kind: "sign_in", account_id: FINDLEY_ID });
    expect(
      plan_boot_account(FINDLEY_ID, HELLO_ID, [
        { id: HELLO_ID },
        { id: FINDLEY_ID, kind: "shared" },
      ]),
    ).toEqual({ kind: "sign_in", account_id: FINDLEY_ID });
    expect(plan_boot_account(FINDLEY_ID, null, [])).toEqual({
      kind: "sign_in",
      account_id: FINDLEY_ID,
    });
  });

  it("keeps the current account when it is the requested one or none is named", () => {
    const accounts = [{ id: HELLO_ID }, { id: FINDLEY_ID }];

    expect(plan_boot_account(FINDLEY_ID, FINDLEY_ID, accounts)).toEqual({
      kind: "use_current",
    });
    expect(plan_boot_account(null, HELLO_ID, accounts)).toEqual({
      kind: "use_current",
    });
  });

  it("redeems the grant whenever the stored account differs from the requested one", () => {
    expect(needs_requested_handoff(FINDLEY_ID, HELLO_ID)).toBe(true);
    expect(needs_requested_handoff(FINDLEY_ID, null)).toBe(true);
    expect(needs_requested_handoff(FINDLEY_ID, FINDLEY_ID)).toBe(false);
    expect(needs_requested_handoff(null, HELLO_ID)).toBe(false);
  });

  it("never adopts the shared cookie's account over the requested one", () => {
    expect(allows_account_adoption(FINDLEY_ID, HELLO_ID)).toBe(false);
    expect(allows_account_adoption(FINDLEY_ID, FINDLEY_ID)).toBe(true);
    expect(allows_account_adoption(null, HELLO_ID)).toBe(true);
  });
});

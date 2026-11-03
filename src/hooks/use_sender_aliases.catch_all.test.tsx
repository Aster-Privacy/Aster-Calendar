//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/services/api/aliases", () => ({
  list_aliases: vi.fn(async () => ({ data: { aliases: [] } })),
  list_all_aliases: vi.fn(async () => ({
    aliases: [],
    max_aliases: -1,
    total: 0,
  })),
  decrypt_aliases: vi.fn(async () => []),
  compute_alias_hash: vi.fn(
    async (local: string, domain: string) => `H:${local}@${domain}`,
  ),
}));

vi.mock("@/services/api/domains", () => ({
  list_domains: vi.fn(async () => ({ data: { domains: [] } })),
  list_domain_addresses: vi.fn(async () => ({ data: { addresses: [] } })),
  decrypt_domain_addresses: vi.fn(async () => []),
  compute_address_hash: vi.fn(
    async (local: string, domain: string) => `A:${local}@${domain}`,
  ),
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: vi.fn(async () => ({
    user: { email: "real@astermail.org", display_name: "Real User" },
  })),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  has_passphrase_in_memory: vi.fn(() => true),
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32)),
  on_keys_ready: vi.fn(() => () => {}),
}));

import {
  use_sender_aliases,
  clear_sender_aliases_cache,
  type SenderOption,
} from "./use_sender_aliases";

import { catch_all_reply_address } from "@/services/catch_all_sender";

let container: HTMLDivElement;
let root: Root;
let latest_options: SenderOption[] = [];

function Probe({ candidates = [] }: { candidates?: string[] }) {
  const { sender_options } = use_sender_aliases(candidates);

  latest_options = sender_options;

  return null;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  clear_sender_aliases_cache();
  latest_options = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  vi.unstubAllEnvs();
  act(() => root.unmount());
  container.remove();
});

describe("catch-all reply identities", () => {
  it.each([undefined, "false"])(
    "keeps wildcard choices off unless enabled: %s",
    async (flag) => {
      vi.stubEnv("VITE_CATCH_ALL_SENDING", flag);
      const { list_domains } = await import("@/services/api/domains");

      vi.mocked(list_domains).mockResolvedValueOnce({
        data: {
          domains: [
            {
              id: "d1",
              domain_name: "my.example",
              status: "active",
              catch_all_enabled: true,
            } as import("@/services/api/domains").CustomDomain,
          ],
          total: 1,
          max_domains: 1,
        },
      });
      await act(async () =>
        root.render(<Probe candidates={["shopping@my.example"]} />),
      );
      await flush();
      expect(latest_options.some((s) => s.is_catch_all)).toBe(false);
    },
  );

  it("offers an unregistered reply address without creating it when enabled", async () => {
    vi.stubEnv("VITE_CATCH_ALL_SENDING", "true");
    const { list_domains, list_domain_addresses } =
      await import("@/services/api/domains");

    vi.mocked(list_domains).mockResolvedValueOnce({
      data: {
        domains: [
          {
            id: "d1",
            domain_name: "my.example",
            status: "active",
            catch_all_enabled: true,
          } as import("@/services/api/domains").CustomDomain,
        ],
        total: 1,
        max_domains: 1,
      },
    });
    await act(async () =>
      root.render(<Probe candidates={["shopping@my.example"]} />),
    );
    await flush();
    expect(
      latest_options.find((s) => s.email === "shopping@my.example"),
    ).toEqual(expect.objectContaining({ type: "domain", is_catch_all: true }));
    expect(list_domain_addresses).toHaveBeenCalledWith("d1");
    await act(async () =>
      root.render(<Probe candidates={["draft@my.example"]} />),
    );
    expect(latest_options.some((s) => s.email === "draft@my.example")).toBe(
      true,
    );
    expect(latest_options.some((s) => s.email === "shopping@my.example")).toBe(
      false,
    );
  });

  it("never revives a disabled alias or address and shares what is registered", async () => {
    vi.stubEnv("VITE_CATCH_ALL_SENDING", "true");
    const aliases = await import("@/services/api/aliases");
    const domains = await import("@/services/api/domains");

    vi.mocked(aliases.decrypt_aliases).mockResolvedValueOnce([
      {
        id: "a1",
        full_address: "old@my.example",
        is_enabled: false,
      } as import("@/services/api/aliases").DecryptedEmailAlias,
    ]);
    vi.mocked(domains.list_domains).mockResolvedValueOnce({
      data: {
        domains: [
          {
            id: "d1",
            domain_name: "my.example",
            status: "active",
            catch_all_enabled: true,
          } as import("@/services/api/domains").CustomDomain,
        ],
        total: 1,
        max_domains: 1,
      },
    });
    vi.mocked(domains.list_domain_addresses).mockResolvedValueOnce({
      data: { addresses: [] },
    } as never);
    vi.mocked(domains.decrypt_domain_addresses).mockResolvedValueOnce([
      { id: "x1", local_part: "off", is_enabled: false },
      { id: "x2", local_part: "support", is_enabled: true },
    ] as never);
    await act(async () =>
      root.render(
        <Probe
          candidates={["old@my.example", "o.ff@my.example", "new@my.example"]}
        />,
      ),
    );
    await flush();
    expect(
      latest_options.filter((s) => s.is_catch_all).map((s) => s.email),
    ).toEqual(["new@my.example"]);

    const delivered = (value: string) =>
      catch_all_reply_address([{ name: "Delivered-To", value }], []);

    expect(delivered("new@my.example")).toBe("new@my.example");
    expect(delivered("support@my.example")).toBeUndefined();
    expect(delivered("old@my.example")).toBeUndefined();
    expect(delivered("off@my.example")).toBeUndefined();
    act(() => clear_sender_aliases_cache());
    expect(delivered("new@my.example")).toBeUndefined();
  });
});

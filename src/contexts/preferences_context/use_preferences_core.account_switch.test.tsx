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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const auth_state = vi.hoisted(() => ({
  vault: { identity_key: "identity-a" } as { identity_key: string } | null,
}));
const live_vault = vi.hoisted(() => ({
  current: { identity_key: "identity-a" } as { identity_key: string } | null,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    vault: auth_state.vault,
    is_completing_registration: false,
  }),
}));

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({ theme: "light", set_theme_preference: () => {} }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ set_language: () => {} }),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => live_vault.current,
  is_account_key_load_pending: () => false,
}));

vi.mock("@/services/api/client", () => ({
  api_client: { confirm_session_identity: async () => true },
}));

vi.mock("@/services/notification_service", () => ({
  load_notification_preferences: async () => undefined,
}));

vi.mock("@/services/api/preferences", async (import_original) => ({
  ...(await import_original<typeof import("@/services/api/preferences")>()),
  get_cached_preferences: () => null,
  get_cached_text_size: () => null,
  get_preferences: vi.fn(),
  save_preferences: vi.fn(),
  cache_preferences_locally: vi.fn(),
}));

const preferences_api = await import("@/services/api/preferences");
const { use_preferences_core } = await import("./use_preferences_core");

type CoreHook = ReturnType<typeof use_preferences_core>;

function Probe({ on_render }: { on_render: (hook: CoreHook) => void }) {
  on_render(use_preferences_core());

  return null;
}

describe("use_preferences_core account switch", () => {
  let container: HTMLDivElement;
  let root: Root;
  const result: { current: CoreHook } = { current: null as unknown as CoreHook };

  const render = async () => {
    await act(async () => {
      root.render(
        <Probe
          on_render={(hook) => {
            result.current = hook;
          }}
        />,
      );
    });
  };

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.mocked(preferences_api.save_preferences).mockReset();
    vi.mocked(preferences_api.cache_preferences_locally).mockReset();
    auth_state.vault = { identity_key: "identity-a" };
    live_vault.current = { identity_key: "identity-a" };
  });

  it("drops a save that was still in flight when the account changed", async () => {
    let fail_save: (reason: Error) => void = () => {};

    vi.mocked(preferences_api.save_preferences).mockImplementation(
      () =>
        new Promise((_, reject) => {
          fail_save = reject;
        }),
    );

    await render();
    const account_a_prefs = {
      ...preferences_api.DEFAULT_PREFERENCES,
      time_format: "12h" as const,
    };

    result.current.has_loaded_ref.current = true;
    result.current.latest_prefs_ref.current = account_a_prefs;

    let flushing: Promise<void> = Promise.resolve();

    act(() => {
      flushing = result.current.flush_save();
    });

    auth_state.vault = { identity_key: "identity-b" };
    live_vault.current = { identity_key: "identity-b" };
    await render();

    await act(async () => {
      fail_save(new Error("network"));
      await flushing;
    });

    expect(preferences_api.cache_preferences_locally).not.toHaveBeenCalled();
    expect(result.current.latest_prefs_ref.current).toBeNull();
    expect(result.current.save_retry_timer.current).toBeNull();
    expect(result.current.is_saving_ref.current).toBe(false);
  });

  it("keeps retrying a failed save for the same account", async () => {
    vi.mocked(preferences_api.save_preferences).mockRejectedValue(
      new Error("network"),
    );

    await render();
    const prefs = {
      ...preferences_api.DEFAULT_PREFERENCES,
      time_format: "12h" as const,
    };

    result.current.has_loaded_ref.current = true;
    result.current.latest_prefs_ref.current = prefs;

    await act(async () => {
      await result.current.flush_save();
    });

    expect(preferences_api.cache_preferences_locally).toHaveBeenCalledWith(
      prefs,
    );
    expect(result.current.latest_prefs_ref.current).toBe(prefs);
    expect(result.current.save_retry_timer.current).not.toBeNull();

    window.clearTimeout(result.current.save_retry_timer.current ?? undefined);
  });
});

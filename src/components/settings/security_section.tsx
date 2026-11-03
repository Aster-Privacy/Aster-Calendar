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
import type { ApiResponse } from "@/services/api/client";
import type { HardwareKeysListResponse } from "@/services/api/webauthn";

import { useState } from "react";
import { Button, IslandRow, IslandSection, IslandSections } from "@aster/ui";
import { CpuChipIcon } from "@heroicons/react/24/outline";

import { TotpDisableModal } from "./totp_disable_modal";
import { RegenerateBackupCodesModal } from "./regenerate_backup_codes_modal";

import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import {
  use_settings_panel_data,
} from "@/components/settings/hooks/use_settings_prefetch";
import { DeleteAccountModal } from "@/components/modals/delete_account_modal";
import { ConnectionSection } from "@/components/settings/connection_section";
import { PasskeySection } from "@/components/settings/security/passkey_section";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  LoginAlertsSessionsGroup,
} from "@/components/settings/security/two_factor_section";
import { BasicsSection } from "@/components/settings/security/basics_section";
import {
  VanguardSection,
} from "@/components/settings/security/vanguard_section";
import { SessionSection } from "@/components/settings/security/session_section";
import {
  TrustedDevicesSection,
} from "@/components/settings/security/trusted_devices_section";
import {
  AccountRecoverySection,
} from "@/components/settings/security/account_recovery_section";
import {
  AccountProtectionScore,
} from "@/components/settings/security/account_protection_score";
import { use_security } from "@/components/settings/hooks/use_security";
import { use_recovery_status } from "@/hooks/use_recovery_status";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import {
  SECURITY_CRITERION_IDS,
  SECURITY_CRITERION_TARGETS,
} from "@/lib/security_criteria";
import { open_settings_target, SETTINGS_ANCHORS } from "@/lib/settings_links";

interface SecuritySectionProps {
  on_account_deleted?: () => void;
  show_inline_totp_setup?: boolean;
  set_show_inline_totp_setup?: (
    value: boolean | ((prev: boolean) => boolean),
  ) => void;
}

export function SecuritySection({
  on_account_deleted,
  show_inline_totp_setup: show_inline_totp_setup_prop,
  set_show_inline_totp_setup: set_show_inline_totp_setup_prop,
}: SecuritySectionProps) {
  const security = use_security();
  const recovery = use_recovery_status(true);
  const { t } = use_i18n();
  const [show_delete_modal, set_show_delete_modal] = useState(false);
  const [show_regenerate_modal, set_show_regenerate_modal] = useState(false);
  const [pending_disable, set_pending_disable] = useState<
    "login_alerts" | null
  >(null);
  const [show_inline_totp_setup_local, set_show_inline_totp_setup_local] =
    useState(false);
  const show_inline_totp_setup =
    show_inline_totp_setup_prop ?? show_inline_totp_setup_local;
  const set_show_inline_totp_setup =
    set_show_inline_totp_setup_prop ?? set_show_inline_totp_setup_local;
  const {
    data: passkey_data,
    error: passkey_error,
    is_loading: passkey_is_loading,
    revalidate: revalidate_passkeys,
  } = use_settings_panel_data<ApiResponse<HardwareKeysListResponse>>(
    "passkey_list",
  );
  const passkey_registered = (passkey_data?.data?.keys?.length ?? 0) > 0;
  const passkey_loaded = !passkey_is_loading;

  const confirm_disable_copy = {
    login_alerts: {
      title: t("settings.login_alerts_disable_title"),
      message: t("settings.login_alerts_disable_message"),
    },
  };

  const handle_confirmed_disable = () => {
    const target = pending_disable;

    set_pending_disable(null);
    if (target === "login_alerts") void security.handle_login_alerts_toggle();
  };

  const on_login_alerts_toggle = () => {
    if (security.login_alerts_enabled) {
      set_pending_disable("login_alerts");

      return;
    }
    void security.handle_login_alerts_toggle();
  };

  const on_two_factor_toggle = () => {
    if (!security.totp_status) {
      show_toast(t("settings.failed_load_security_status"), "error");
      void security.fetch_totp_status();

      return;
    }
    if (security.totp_status.enabled) {
      security.set_show_totp_disable_modal(true);
    } else {
      set_show_inline_totp_setup((prev) => !prev);
    }
  };

  return (
    <IslandSections>
      {passkey_error && (
        <LoadFailedNotice on_retry={() => void revalidate_passkeys()} />
      )}
      {!passkey_error && (
        <AccountProtectionScore
          login_alerts_enabled={security.login_alerts_enabled}
          on_criterion_click={SECURITY_CRITERION_IDS.map(
            (id) => () => open_settings_target(SECURITY_CRITERION_TARGETS[id]),
          )}
          passkey_registered={passkey_registered}
          recovery_codes_saved={recovery.has_codes}
          recovery_email_verified={security.recovery_email_verified}
          security_loaded={
            security.security_score_loaded &&
            recovery.is_loaded &&
            passkey_loaded &&
            !security.totp_status_failed
          }
          totp_enabled={security.totp_status?.enabled ?? false}
        />
      )}

      <div id={SETTINGS_ANCHORS.two_factor}>
        <BasicsSection
          on_inline_totp_setup_success={() => {
            set_show_inline_totp_setup(false);
            security.handle_totp_setup_success();
          }}
          on_regenerate_backup_codes={() => set_show_regenerate_modal(true)}
          on_totp_status_retry={() => void security.fetch_totp_status()}
          on_two_factor_toggle={on_two_factor_toggle}
          password_props={{
            confirm_password: security.confirm_password,
            current_password: security.current_password,
            last_password_change: security.last_password_change,
            password_strength_tier: security.password_strength_tier,
            new_password: security.new_password,
            on_cancel: security.handle_password_cancel,
            on_change_password: security.handle_change_password,
            on_new_password_blur: security.handle_new_password_blur,
            password_breach_warning: security.password_breach_warning,
            password_error: security.password_error,
            password_loading: security.password_loading,
            password_success: security.password_success,
            password_unreadable_notice: security.password_unreadable_notice,
            set_confirm_password: security.set_confirm_password,
            set_current_password: security.set_current_password,
            set_new_password: security.set_new_password,
            set_show_current_password: security.set_show_current_password,
            set_show_new_password: security.set_show_new_password,
            set_show_password_section: security.set_show_password_section,
            show_current_password: security.show_current_password,
            show_new_password: security.show_new_password,
            show_password_section: security.show_password_section,
          }}
          show_inline_totp_setup={show_inline_totp_setup}
          totp_backup_codes_remaining={
            security.totp_status?.backup_codes_remaining
          }
          totp_enabled={security.totp_status?.enabled ?? false}
          totp_status_failed={security.totp_status_failed}
        />
      </div>

      <div id={SETTINGS_ANCHORS.passkeys}>
        <PasskeySection />
      </div>

      <div id={SETTINGS_ANCHORS.sessions}>
        <SessionSection
          logout_others_loading={security.logout_others_loading}
          logout_others_result={security.logout_others_result}
          on_revoke_all_sessions={security.handle_revoke_all_sessions}
          on_revoke_session={security.handle_revoke_session}
          sessions={security.sessions}
          sessions_error={security.sessions_error}
          sessions_loading={security.sessions_loading}
        />
      </div>

      <div id={SETTINGS_ANCHORS.trusted_devices}>
        <TrustedDevicesSection />
      </div>

      <div id={SETTINGS_ANCHORS.login_alerts}>
        <LoginAlertsSessionsGroup
          login_alerts_enabled={security.login_alerts_enabled}
          login_alerts_failed={security.login_alerts_failed}
          login_alerts_loaded={security.login_alerts_loaded}
          login_events={security.login_events}
          login_events_failed={security.login_events_failed}
          login_events_loading={security.login_events_loading}
          on_login_alerts_toggle={on_login_alerts_toggle}
          on_reload_login_alerts={() =>
            void security.fetch_login_alerts_status()
          }
          on_reload_login_events={security.fetch_login_events}
          on_timeout_change={security.handle_timeout_change}
          on_timeout_toggle={security.handle_timeout_toggle}
          session_timeout_enabled={security.preferences.session_timeout_enabled}
          session_timeout_minutes={security.preferences.session_timeout_minutes}
          timeout_description={security.get_timeout_description()}
        />
      </div>

      <AccountRecoverySection on_changed={recovery.reload} />

      <IslandSection
        icon={<CpuChipIcon />}
        id={SETTINGS_ANCHORS.vanguard}
        title={t("settings.vanguard_title")}
      >
        <VanguardSection />
      </IslandSection>

      <div>
        <ConnectionSection />
      </div>

      <IslandSection tone="danger">
        <IslandRow
          destructive
          description={t("common.erase_all_data")}
          label={t("common.delete_account")}
          layout="stacked"
          trailing={
            <Button
              variant="destructive"
              onClick={() => set_show_delete_modal(true)}
            >
              {t("common.delete")}
            </Button>
          }
        />
      </IslandSection>

      <TotpDisableModal
        is_open={security.show_totp_disable_modal}
        on_close={() => security.set_show_totp_disable_modal(false)}
        on_success={security.handle_totp_disable_success}
      />

      <RegenerateBackupCodesModal
        is_open={show_regenerate_modal}
        on_close={() => set_show_regenerate_modal(false)}
        on_success={security.fetch_totp_status}
      />

      <DeleteAccountModal
        is_open={show_delete_modal}
        on_close={() => set_show_delete_modal(false)}
        on_deleted={() => {
          set_show_delete_modal(false);
          on_account_deleted?.();
        }}
      />

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("settings.turn_off_action")}
        is_open={pending_disable !== null}
        message={
          pending_disable ? confirm_disable_copy[pending_disable].message : ""
        }
        on_cancel={() => set_pending_disable(null)}
        on_confirm={handle_confirmed_disable}
        title={
          pending_disable ? confirm_disable_copy[pending_disable].title : ""
        }
        variant="danger"
      />
    </IslandSections>
  );
}

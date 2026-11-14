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
#![cfg_attr(not(all(unix, not(target_os = "macos"))), allow(dead_code))]

use serde::Serialize;
use std::sync::OnceLock;

const WEBKIT_DISABLE_VAR: &str = "WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS";

static STATUS: OnceLock<SandboxStatus> = OnceLock::new();

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SandboxReason {
    PlatformDefault,
    DisabledByEnvironment,
    FlatpakPortal,
    ProbePassed,
    ProbeFailed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SandboxStatus {
    pub enabled: bool,
    pub reason: SandboxReason,
}

pub fn decide(
    webkit_disable_preset: bool,
    inside_flatpak: bool,
    probe: impl FnOnce() -> bool,
) -> SandboxStatus {
    let (enabled, reason) = if webkit_disable_preset {
        (false, SandboxReason::DisabledByEnvironment)
    } else if inside_flatpak {
        (true, SandboxReason::FlatpakPortal)
    } else if probe() {
        (true, SandboxReason::ProbePassed)
    } else {
        (false, SandboxReason::ProbeFailed)
    };

    SandboxStatus { enabled, reason }
}

pub fn describe(status: &SandboxStatus) -> String {
    if status.enabled {
        return format!("webkit sandbox: on ({:?})", status.reason);
    }
    if status.reason == SandboxReason::DisabledByEnvironment {
        return format!("webkit sandbox: OFF ({WEBKIT_DISABLE_VAR} is set in the environment)");
    }

    format!(
        "webkit sandbox: OFF ({:?}); bubblewrap could not start, so web content runs without the system sandbox. Install bubblewrap and allow unprivileged user namespaces to turn it back on",
        status.reason
    )
}

fn default_status() -> SandboxStatus {
    if std::env::var_os(WEBKIT_DISABLE_VAR).is_some() {
        return SandboxStatus {
            enabled: false,
            reason: SandboxReason::DisabledByEnvironment,
        };
    }

    SandboxStatus {
        enabled: true,
        reason: SandboxReason::PlatformDefault,
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
mod linux {
    use std::path::Path;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    const PROBE_TIMEOUT: Duration = Duration::from_secs(3);
    const PROBE_POLL: Duration = Duration::from_millis(20);

    pub fn inside_flatpak() -> bool {
        Path::new("/.flatpak-info").exists()
    }

    pub fn bwrap_probe_succeeds() -> bool {
        let child = Command::new("bwrap")
            .args([
                "--die-with-parent",
                "--unshare-user",
                "--unshare-pid",
                "--ro-bind",
                "/",
                "/",
                "--dev",
                "/dev",
                "--proc",
                "/proc",
                "true",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();

        let Ok(mut child) = child else {
            return false;
        };

        let started = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(status)) => return status.success(),
                Ok(None) if started.elapsed() < PROBE_TIMEOUT => std::thread::sleep(PROBE_POLL),
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return false;
                }
            }
        }
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn apply_policy() {
    let status = decide(
        std::env::var_os(WEBKIT_DISABLE_VAR).is_some(),
        linux::inside_flatpak(),
        linux::bwrap_probe_succeeds,
    );

    if !status.enabled && std::env::var_os(WEBKIT_DISABLE_VAR).is_none() {
        std::env::set_var(WEBKIT_DISABLE_VAR, "1");
    }

    eprintln!("aster: {}", describe(&status));
    let _ = STATUS.set(status);
}

pub fn current_status() -> SandboxStatus {
    STATUS.get().cloned().unwrap_or_else(default_status)
}

#[tauri::command]
pub fn webkit_sandbox_status() -> SandboxStatus {
    current_status()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn probe_not_expected() -> bool {
        panic!("the bwrap probe must not run for this decision")
    }

    #[test]
    fn keeps_sandbox_when_probe_passes() {
        let status = decide(false, false, || true);
        assert!(status.enabled);
        assert_eq!(status.reason, SandboxReason::ProbePassed);
    }

    #[test]
    fn turns_sandbox_off_when_probe_fails() {
        let status = decide(false, false, || false);
        assert!(!status.enabled);
        assert_eq!(status.reason, SandboxReason::ProbeFailed);
    }

    #[test]
    fn keeps_sandbox_in_flatpak_without_probing() {
        let status = decide(false, true, probe_not_expected);
        assert!(status.enabled);
        assert_eq!(status.reason, SandboxReason::FlatpakPortal);
    }

    #[test]
    fn respects_a_preset_environment_without_probing() {
        let status = decide(true, false, probe_not_expected);
        assert!(!status.enabled);
        assert_eq!(status.reason, SandboxReason::DisabledByEnvironment);
    }

    #[test]
    fn describes_a_probe_failure_with_the_fix() {
        let line = describe(&decide(false, false, || false));
        assert!(line.starts_with("webkit sandbox: OFF (ProbeFailed)"));
        assert!(line.contains("Install bubblewrap"));
    }

    #[test]
    fn describes_an_enabled_sandbox() {
        let line = describe(&decide(false, false, || true));
        assert_eq!(line, "webkit sandbox: on (ProbePassed)");
    }

    #[test]
    fn serializes_for_the_frontend() {
        let json = serde_json::to_string(&decide(false, false, || false)).unwrap();
        assert_eq!(json, r#"{"enabled":false,"reason":"probe_failed"}"#);
    }
}

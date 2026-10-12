//! Start with Windows: a value under the current user's `Run` key that launches the shell with
//! `--hidden`. Written here rather than through the Tauri autostart plugin, which leaves the exe
//! path unquoted (a profile path with spaces then relies on Windows guessing) and tries the
//! machine-wide key first when it can.

use std::io;

use windows_registry::CURRENT_USER;

const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
/// Where Task Manager's Startup tab records an entry the user turned off.
const STARTUP_APPROVED: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
/// The argument the entry passes; the shell then starts in the tray.
pub const HIDDEN_ARG: &str = "--hidden";
/// HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND): the entry is already gone.
const FILE_NOT_FOUND: i32 = 0x8007_0002_u32 as i32;

/// The `Run` value name: `DevPanel`, or `DevPanel-<suffix>` for an instance with its own app data
/// folder (see `instance`).
pub fn entry_name(instance_suffix: Option<&str>) -> String {
    match instance_suffix {
        Some(suffix) => format!("DevPanel-{suffix}"),
        None => "DevPanel".into(),
    }
}

/// On when the entry exists and Task Manager has not turned it off.
pub fn is_enabled(name: &str) -> bool {
    let registered = CURRENT_USER
        .open(RUN)
        .and_then(|key| key.get_string(name))
        .is_ok();
    // Task Manager writes 12 bytes; an odd first byte means "disabled".
    let disabled = CURRENT_USER
        .open(STARTUP_APPROVED)
        .and_then(|key| key.get_value(name))
        .is_ok_and(|value| value.first().is_some_and(|flags| flags & 1 == 1));
    registered && !disabled
}

/// Turns the entry on (for the running exe, quoted) or off.
pub fn set(name: &str, enabled: bool) -> io::Result<()> {
    // A Task Manager "disabled" mark would outlive the entry and hide a later one: drop it too.
    if let Ok(key) = CURRENT_USER.options().write().open(STARTUP_APPROVED) {
        let _ = key.remove_value(name);
    }
    if enabled {
        let exe = std::env::current_exe()?;
        let command = format!("\"{}\" {HIDDEN_ARG}", exe.display());
        CURRENT_USER.create(RUN)?.set_string(name, command)?;
    } else if let Ok(key) = CURRENT_USER.options().write().open(RUN) {
        match key.remove_value(name) {
            Err(error) if error.code().0 != FILE_NOT_FOUND => return Err(error.into()),
            _ => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_installed_app_owns_the_plain_entry_name() {
        assert_eq!(entry_name(None), "DevPanel");
        assert_eq!(entry_name(Some("00ab")), "DevPanel-00ab");
    }
}

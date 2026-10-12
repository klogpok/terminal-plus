//! Which DevPanel this process is. The single-instance lock and the Start with Windows entry are
//! keyed on the app data folder: a dev or test instance with its own
//! `DEVPANEL_APP_DATA` never focuses, nor turns off the autostart of, the installed app.

use std::path::Path;

/// The suffix that sets an overridden app data folder apart, or `None` for the default folder.
/// Windows paths ignore case, so the same folder spelled differently is the same instance.
pub fn suffix(app_data_override: Option<&Path>) -> Option<String> {
    let folder = app_data_override?.to_string_lossy().to_lowercase();
    let folder = folder.trim_end_matches(['\\', '/']);
    // FNV-1a: stable across builds and processes, unlike `DefaultHasher`.
    let hash = folder
        .bytes()
        .fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
            (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
        });
    Some(format!("{hash:016x}"))
}

/// This process's suffix, from `DEVPANEL_APP_DATA`.
pub fn current_suffix() -> Option<String> {
    suffix(
        std::env::var_os("DEVPANEL_APP_DATA")
            .as_deref()
            .map(Path::new),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_app_data_folder_has_no_suffix() {
        assert_eq!(suffix(None), None);
    }

    #[test]
    fn the_same_folder_spelled_differently_is_the_same_instance() {
        let a = suffix(Some(Path::new(r"C:\Temp\DevPanel-Test")));
        assert_eq!(a, suffix(Some(Path::new(r"c:\temp\devpanel-test\"))));
        assert_eq!(a.as_deref().map(str::len), Some(16));
    }

    #[test]
    fn different_folders_are_different_instances() {
        assert_ne!(
            suffix(Some(Path::new(r"C:\Temp\a"))),
            suffix(Some(Path::new(r"C:\Temp\b")))
        );
    }
}

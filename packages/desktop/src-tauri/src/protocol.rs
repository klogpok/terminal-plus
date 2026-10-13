//! The shell–sidecar protocol, mirrored from its one definition in `src/protocol.ts` (see there
//! for what each message means). `test/fixtures/protocol.jsonl` keeps both sides in step.

use serde::{Deserialize, Serialize};

/// shell → sidecar
#[derive(Debug, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ShellMessage {
    Start {
        start_hidden: bool,
        autostart_enabled: bool,
    },
    TrayClicked,
    TrayItemClicked {
        item_id: String,
    },
    WindowCloseRequested,
    QuitRequested,
    AutostartChanged {
        enabled: bool,
    },
    ErrorDismissed {
        dialog_id: i64,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TrayItemKind {
    Normal,
    Checkbox,
    Separator,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TrayItem {
    pub id: String,
    pub label: String,
    pub kind: TrayItemKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checked: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorButtons {
    pub ok: String,
    pub details: String,
    pub details_title: String,
}

/// What `showError` asks the shell to show.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorBox {
    pub dialog_id: i64,
    pub title: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    pub language: String,
    pub buttons: ErrorButtons,
}

/// sidecar → shell
#[derive(Debug, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SidecarMessage {
    OpenWindow {
        url: String,
        show: bool,
    },
    ShowWindow,
    HideWindow,
    SetTray {
        tooltip: String,
        items: Vec<TrayItem>,
    },
    ShowError(ErrorBox),
    SetAutostart {
        enabled: bool,
    },
    SetCrashTexts {
        title: String,
        message: String,
    },
    OpenUrl {
        url: String,
    },
    OpenFolder {
        path: String,
    },
    Exit {
        code: i32,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const FIXTURE: &str = include_str!("../../test/fixtures/protocol.jsonl");

    /// Parses a fixture line as either direction and writes it back out.
    fn round_trip(line: &str) -> Option<Value> {
        if let Ok(message) = serde_json::from_str::<ShellMessage>(line) {
            return Some(serde_json::to_value(message).unwrap());
        }
        if let Ok(message) = serde_json::from_str::<SidecarMessage>(line) {
            return Some(serde_json::to_value(message).unwrap());
        }
        None
    }

    #[test]
    fn every_fixture_line_round_trips_through_the_rust_types_unchanged() {
        let lines: Vec<&str> = FIXTURE
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .collect();
        assert!(lines.len() >= 17, "the fixture has one line per message");
        for line in lines {
            let original: Value = serde_json::from_str(line).unwrap();
            assert_eq!(round_trip(line), Some(original), "fixture line: {line}");
        }
    }
}

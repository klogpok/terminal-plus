//! The tray icon. Its tooltip and menu are whatever the sidecar's last `setTray` said; the shell
//! only reports clicks back (`trayClicked`, `trayItemClicked`).

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Wry};

use crate::protocol::{ShellMessage, TrayItem, TrayItemKind};

const TRAY: &str = "main";

/// Creates the tray icon with a placeholder tooltip and no menu until the first `setTray`. The menu
/// opens on a right click only; a left click is `trayClicked`.
pub fn create(app: &AppHandle, send: fn(&AppHandle, &ShellMessage)) -> tauri::Result<()> {
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::Io(std::io::Error::other("The app has no icon")))?;
    TrayIconBuilder::with_id(TRAY)
        .icon(icon)
        .tooltip("DevPanel")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(move |tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                send(tray.app_handle(), &ShellMessage::TrayClicked);
            }
        })
        .on_menu_event(move |app, event| {
            let item_id = event.id().as_ref().to_string();
            send(app, &ShellMessage::TrayItemClicked { item_id });
        })
        .build(app)?;
    Ok(())
}

/// Replaces the tooltip and rebuilds the whole menu (`setTray`), e.g. after a UI Language change.
pub fn set(app: &AppHandle, tooltip: &str, items: &[TrayItem]) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id(TRAY) else {
        return Ok(());
    };
    tray.set_menu(Some(menu(app, items)?))?;
    tray.set_tooltip(Some(tooltip))
}

fn menu(app: &AppHandle, items: &[TrayItem]) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    for item in items {
        match item.kind {
            TrayItemKind::Separator => menu.append(&PredefinedMenuItem::separator(app)?)?,
            // A clicked checkbox flips its own mark; the sidecar's next `setTray` sets the truth.
            TrayItemKind::Checkbox => menu.append(&CheckMenuItem::with_id(
                app,
                &item.id,
                &item.label,
                true,
                item.checked.unwrap_or(false),
                None::<&str>,
            )?)?,
            TrayItemKind::Normal => menu.append(&MenuItem::with_id(
                app,
                &item.id,
                &item.label,
                true,
                None::<&str>,
            )?)?,
        }
    }
    Ok(menu)
}

//! The DevPanel window and what it may navigate to: only the Server's own origin; every other link
//! goes to the default browser.

use std::path::Path;

use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_opener::OpenerExt;

const WINDOW: &str = "main";

/// Opens an http(s) URL in the default browser; anything else is refused.
pub fn open_externally(app: &AppHandle, url: &Url) {
    if !matches!(url.scheme(), "http" | "https") {
        eprintln!("[shell] Not opening {url}: only http(s) links go to the browser.");
        return;
    }
    if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("[shell] Could not open {url}: {error}");
    }
}

/// Creates the window on `url`, visible if `show`. The WebView2 profile lives under `app_data`, so
/// a test instance never shares it. Closing the window only calls `on_close_requested`: the window
/// stays until the sidecar answers.
pub fn open(
    app: &AppHandle,
    url: &str,
    show: bool,
    app_data: &Path,
    on_close_requested: fn(&AppHandle),
) -> tauri::Result<()> {
    let url: Url = url
        .parse()
        .map_err(|error| tauri::Error::Io(std::io::Error::other(format!("{url}: {error}"))))?;
    let origin = url.origin();
    let (navigation_app, new_window_app) = (app.clone(), app.clone());
    let window = WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::External(url))
        .title("DevPanel")
        .inner_size(1400.0, 900.0)
        .center()
        .visible(show)
        .data_directory(app_data.join("desktop"))
        .on_navigation(move |target| {
            if target.origin() == origin {
                return true;
            }
            open_externally(&navigation_app, target);
            false
        })
        .on_new_window(move |target, _features| {
            open_externally(&new_window_app, &target);
            NewWindowResponse::Deny
        })
        .build()?;
    let close_app = app.clone();
    window.on_window_event(move |event| {
        // Closing is not Exit.
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            on_close_requested(&close_app);
        }
    });
    if show {
        let _ = window.set_focus();
    }
    Ok(())
}

/// Shows (restoring if minimized) and focuses the window, if it exists yet.
pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW) {
        let _ = window.hide();
    }
}

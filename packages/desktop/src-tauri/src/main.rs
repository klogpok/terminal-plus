//! The DevPanel desktop shell (ADR-0003). The sidecar decides, the shell executes: it starts the
//! Node sidecar in a Job Object, renders the window and the tray, and does what the sidecar's
//! protocol messages say. It holds no decisions of its own.

// No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod protocol;
mod sidecar;

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, ChildStdout};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_opener::OpenerExt;

use protocol::{ShellMessage, SidecarMessage};
use sidecar::{Launch, Sidecar};

const WINDOW: &str = "main";

/// What the shell shows if the sidecar ends without `exit`, until the first `setCrashTexts`.
const FALLBACK_CRASH_TITLE: &str = "DevPanel stopped";
const FALLBACK_CRASH_MESSAGE: &str = "DevPanel stopped unexpectedly and will close.";

struct Shell {
    sidecar: Sidecar,
    crash_texts: Mutex<(String, String)>,
    /// The sidecar sent `exit`: its end is expected.
    exiting: AtomicBool,
}

/// The app data folder, as the web version's Server resolves it.
fn app_data_dir() -> PathBuf {
    match std::env::var_os("DEVPANEL_APP_DATA") {
        Some(dir) => PathBuf::from(dir),
        None => PathBuf::from(std::env::var_os("APPDATA").unwrap_or_default()).join("DevPanel"),
    }
}

/// Development: the developer's Node and the sidecar bundled from source, with the workspace web
/// build (the sidecar's default). Installed: the shipped node.exe beside the shell, and the
/// bundled sidecar and web UI from the resources.
fn sidecar_launch(app: &AppHandle) -> tauri::Result<Launch> {
    if cfg!(debug_assertions) {
        let desktop = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
        return Ok(Launch {
            node: "node".into(),
            script: desktop.join("dist").join("sidecar.cjs"),
            web_root: None,
        });
    }
    let resources = app.path().resource_dir()?;
    let node = std::env::current_exe()?.with_file_name("node.exe");
    Ok(Launch {
        node,
        script: resources.join("sidecar").join("sidecar.cjs"),
        web_root: Some(resources.join("web")),
    })
}

fn send(app: &AppHandle, message: &ShellMessage) {
    app.state::<Shell>().sidecar.send(message);
}

fn open_externally(app: &AppHandle, url: &Url) {
    if !matches!(url.scheme(), "http" | "https") {
        eprintln!("[shell] Not opening {url}: only http(s) links go to the browser.");
        return;
    }
    if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("[shell] Could not open {url}: {error}");
    }
}

fn open_window(app: &AppHandle, url: &str, show: bool) -> tauri::Result<()> {
    let url: Url = url.parse().map_err(io_error)?;
    let origin = url.origin();
    let (navigation_app, new_window_app) = (app.clone(), app.clone());
    let window = WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::External(url))
        .title("DevPanel")
        .inner_size(1400.0, 900.0)
        .center()
        .visible(show)
        // The WebView2 profile follows the app data folder, so a test instance never shares it.
        .data_directory(app_data_dir().join("desktop"))
        // The window only ever shows DevPanel: links to other origins go to the default browser.
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
        // Closing is not Exit: the window stays until the sidecar answers `hideWindow`.
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            send(&close_app, &ShellMessage::WindowCloseRequested);
        }
    });
    if show {
        let _ = window.set_focus();
    }
    Ok(())
}

fn io_error(error: impl std::fmt::Display) -> tauri::Error {
    tauri::Error::Io(std::io::Error::other(error.to_string()))
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn handle(app: &AppHandle, message: SidecarMessage) {
    match message {
        SidecarMessage::OpenWindow { url, show } => {
            if let Err(error) = open_window(app, &url, show) {
                eprintln!("[shell] Could not open the window: {error}");
                app.exit(1);
            }
        }
        SidecarMessage::ShowWindow => show_window(app),
        SidecarMessage::HideWindow => {
            if let Some(window) = app.get_webview_window(WINDOW) {
                let _ = window.hide();
            }
        }
        SidecarMessage::SetCrashTexts { title, message } => {
            *app.state::<Shell>()
                .crash_texts
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = (title, message);
        }
        SidecarMessage::OpenUrl { url } => match url.parse::<Url>() {
            Ok(url) => open_externally(app, &url),
            Err(error) => eprintln!("[shell] Not opening {url}: {error}"),
        },
        SidecarMessage::OpenFolder { path } => {
            if let Err(error) = app.opener().open_path(&path, None::<&str>) {
                eprintln!("[shell] Could not open {path}: {error}");
            }
        }
        SidecarMessage::Exit { code } => {
            app.state::<Shell>().exiting.store(true, Ordering::SeqCst);
            app.exit(code);
        }
        // Error dialogs come in ticket 04: log the error and dismiss it at once, so a start
        // failure still ends the shell.
        SidecarMessage::ShowError {
            dialog_id,
            title,
            message,
            details,
            ..
        } => {
            eprintln!(
                "[shell] {title}: {message}{}",
                details.map(|d| format!("\n{d}")).unwrap_or_default()
            );
            send(app, &ShellMessage::ErrorDismissed { dialog_id });
        }
        // The tray menu (ticket 04) and Start with Windows (ticket 05) are not wired yet.
        other @ (SidecarMessage::SetTray { .. } | SidecarMessage::SetAutostart { .. }) => {
            eprintln!("[shell] Not handled yet: {other:?}");
        }
    }
}

/// Reads the sidecar's protocol lines until it ends. An end without `exit` is a crash: the shell
/// shows the last crash texts and quits.
fn read_sidecar(app: AppHandle, mut child: Child, stdout: ChildStdout) {
    for line in BufReader::new(stdout).lines() {
        let Ok(line) = line else { break };
        match serde_json::from_str::<SidecarMessage>(&line) {
            Ok(message) => handle(&app, message),
            Err(error) => {
                eprintln!("[shell] Ignoring a bad line from the sidecar ({error}): {line}")
            }
        }
    }
    let status = child.wait();
    let shell = app.state::<Shell>();
    if shell.exiting.load(Ordering::SeqCst) {
        return;
    }
    eprintln!("[shell] The sidecar ended without exit: {status:?}");
    let (title, message) = shell
        .crash_texts
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title(title)
        .set_description(message)
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
    app.exit(1);
}

fn setup(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let launch = sidecar_launch(app)?;
    let (sidecar, child, stdout) = Sidecar::spawn(&launch, &app_data_dir()).map_err(|e| {
        format!(
            "Could not start the sidecar {} {}: {e}",
            launch.node.display(),
            launch.script.display()
        )
    })?;
    app.manage(Shell {
        sidecar,
        crash_texts: Mutex::new((FALLBACK_CRASH_TITLE.into(), FALLBACK_CRASH_MESSAGE.into())),
        exiting: AtomicBool::new(false),
    });

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("The app has no icon")?;
    TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip("DevPanel")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                send(tray.app_handle(), &ShellMessage::TrayClicked);
            }
        })
        .build(app)?;

    let reader_app = app.clone();
    std::thread::spawn(move || read_sidecar(reader_app, child, stdout));
    let start_hidden = std::env::args().any(|arg| arg == "--hidden");
    send(
        app,
        &ShellMessage::Start {
            start_hidden,
            autostart_enabled: false,
        },
    );
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| setup(app.handle()))
        .build(tauri::generate_context!())
        .expect("the DevPanel shell failed to build")
        .run(|_app, event| {
            // Only `exit` (or a crash) ends the shell; nothing else may, not even the last window
            // going away.
            if let RunEvent::ExitRequested {
                code: None, api, ..
            } = event
            {
                api.prevent_exit();
            }
        });
}

//! The DevPanel desktop shell (ADR-0003). The sidecar decides, the shell executes: it starts the
//! Node sidecar in a Job Object, renders the window and the tray, and does what the sidecar's
//! protocol messages say. It holds no decisions of its own.

// No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod autostart;
mod dialog;
mod instance;
mod protocol;
mod sidecar;
mod tray;
mod window;

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, ChildStdout};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use rfd::MessageButtons;
use tauri::{AppHandle, Manager, RunEvent, Url};
use tauri_plugin_opener::OpenerExt;

use instance::Instance;
use protocol::{ShellMessage, SidecarMessage};
use sidecar::{Launch, Sidecar};

/// What the shell shows if the sidecar ends without `exit`.
struct CrashTexts {
    title: String,
    message: String,
}

impl CrashTexts {
    /// Until the first `setCrashTexts`. The shell reads no settings, so it does not know the UI
    /// Language yet: these are `HOST_STRINGS.en.desktop.crashedTitle` / `crashed`, word for word.
    fn fallback() -> CrashTexts {
        CrashTexts {
            title: "DevPanel stopped".into(),
            message:
                "DevPanel stopped unexpectedly and will close. Start it again from the Start menu."
                    .into(),
        }
    }
}

struct Shell {
    sidecar: Sidecar,
    crash_texts: Mutex<CrashTexts>,
    /// The sidecar sent `exit`: its end is expected.
    exiting: AtomicBool,
}

/// The shell's own error box, for failures before or without a sidecar to word them. English only:
/// the UI Language is the sidecar's to know. Plain words first, the technical details below.
fn show_shell_error(message: &str, details: &str) {
    dialog::alert(
        "DevPanel could not start",
        &format!("{message}\n\nDetails for a developer:\n{details}"),
        MessageButtons::Ok,
    );
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

/// Start with Windows for this instance (see `instance`).
fn autostart_entry(app: &AppHandle) -> String {
    autostart::entry_name(app.state::<Instance>().suffix.as_deref())
}

/// Turns the entry on or off, then reports what Windows now has, even if that failed.
fn set_autostart(app: &AppHandle, enabled: bool) {
    let entry = autostart_entry(app);
    if let Err(error) = autostart::set(&entry, enabled) {
        eprintln!(
            "[shell] Could not turn Start with Windows {}: {error}",
            if enabled { "on" } else { "off" }
        );
    }
    send(
        app,
        &ShellMessage::AutostartChanged {
            enabled: autostart::is_enabled(&entry),
        },
    );
}

fn open_window(app: &AppHandle, url: &str, show: bool) {
    let app_data = app.state::<Instance>().app_data.clone();
    let on_close = |app: &AppHandle| send(app, &ShellMessage::WindowCloseRequested);
    if let Err(error) = window::open(app, url, show, &app_data, on_close) {
        eprintln!("[shell] Could not open the window: {error}");
        // The box blocks; the sidecar is ended with the shell (Job Object).
        show_shell_error(
            "DevPanel started, but its window could not open. Restart your computer and start \
             DevPanel again from the Start menu.",
            &error.to_string(),
        );
        app.exit(1);
    }
}

fn handle(app: &AppHandle, message: SidecarMessage) {
    match message {
        SidecarMessage::OpenWindow { url, show } => open_window(app, &url, show),
        SidecarMessage::ShowWindow => window::show(app),
        SidecarMessage::HideWindow => window::hide(app),
        SidecarMessage::SetCrashTexts { title, message } => {
            *app.state::<Shell>()
                .crash_texts
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = CrashTexts { title, message };
        }
        SidecarMessage::OpenUrl { url } => match url.parse::<Url>() {
            Ok(url) => window::open_externally(app, &url),
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
        SidecarMessage::ShowError(error) => {
            // The box blocks until closed; the sidecar's other messages keep flowing meanwhile.
            let app = app.clone();
            std::thread::spawn(move || {
                dialog::show_error(&error);
                send(
                    &app,
                    &ShellMessage::ErrorDismissed {
                        dialog_id: error.dialog_id,
                    },
                );
            });
        }
        SidecarMessage::SetTray { tooltip, items } => {
            if let Err(error) = tray::set(app, &tooltip, &items) {
                eprintln!("[shell] Could not update the tray: {error}");
            }
        }
        SidecarMessage::SetAutostart { enabled } => set_autostart(app, enabled),
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
    let crash = shell.crash_texts.lock().unwrap_or_else(|e| e.into_inner());
    let (title, message) = (crash.title.clone(), crash.message.clone());
    drop(crash);
    dialog::alert(&title, &message, MessageButtons::Ok);
    app.exit(1);
}

fn setup(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let launch = sidecar_launch(app)?;
    let app_data = app.state::<Instance>().app_data.clone();
    let port = std::env::var_os("DEVPANEL_PORT");
    let (sidecar, child, stdout) = match Sidecar::spawn(&launch, &app_data, port.as_deref()) {
        Ok(started) => started,
        Err(error) => {
            let details = format!(
                "Could not start {} {}: {error}",
                launch.node.display(),
                launch.script.display()
            );
            eprintln!("[shell] {details}");
            show_shell_error(
                "A part of DevPanel did not start. Reinstall DevPanel, then start it again from \
                 the Start menu.",
                &details,
            );
            // Nothing else runs yet: end here rather than show a second, vaguer box from `main`.
            std::process::exit(1);
        }
    };
    app.manage(Shell {
        sidecar,
        crash_texts: Mutex::new(CrashTexts::fallback()),
        exiting: AtomicBool::new(false),
    });

    tray::create(app, send)?;

    let reader_app = app.clone();
    std::thread::spawn(move || read_sidecar(reader_app, child, stdout));
    let start_hidden = std::env::args().any(|arg| arg == autostart::HIDDEN_ARG);
    send(
        app,
        &ShellMessage::Start {
            start_hidden,
            autostart_enabled: autostart::is_enabled(&autostart_entry(app)),
        },
    );
    Ok(())
}

fn main() {
    let instance = Instance::from_env();
    let mut context = tauri::generate_context!();
    // The single-instance lock is keyed on the identifier: make it follow the app data folder.
    if let Some(suffix) = &instance.suffix {
        let identifier = format!("{}.data-{suffix}", context.config().identifier);
        context.config_mut().identifier = identifier;
    }
    let app = tauri::Builder::default()
        // First, so a second launch exits before anything else (the sidecar above all) starts.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            window::show(app)
        }))
        .plugin(tauri_plugin_opener::init())
        .manage(instance)
        .setup(|app| setup(app.handle()))
        .build(context);
    let app = match app {
        Ok(app) => app,
        Err(error) => {
            show_shell_error(
                "DevPanel could not start on this computer. Restart your computer and start \
                 DevPanel again from the Start menu.",
                &error.to_string(),
            );
            std::process::exit(1);
        }
    };
    app.run(|app, event| {
        // Only the sidecar's `exit` (or a crash) ends the shell. Anything else asking it to quit
        // goes to the sidecar as `quitRequested`, which stops everything and then sends `exit`.
        if let RunEvent::ExitRequested {
            code: None, api, ..
        } = event
        {
            api.prevent_exit();
            if app.try_state::<Shell>().is_some() {
                send(app, &ShellMessage::QuitRequested);
            }
        }
    });
}

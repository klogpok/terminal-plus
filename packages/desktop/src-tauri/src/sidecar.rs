//! Starting the Node sidecar inside a Job Object, and writing protocol lines to its stdin.

use std::io::{self, Write};
use std::os::windows::io::AsRawHandle;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;

use win32job::{ExtendedLimitInfo, Job};

use crate::protocol::ShellMessage;

/// The GUI shell has no console: without this flag node.exe would open one.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// What runs the sidecar: the Node executable and the bundled sidecar script.
pub struct Launch {
    pub node: PathBuf,
    pub script: PathBuf,
    /// The built web UI, when the sidecar's default (the workspace build) does not apply.
    pub web_root: Option<PathBuf>,
}

pub struct Sidecar {
    stdin: Mutex<ChildStdin>,
    /// Kill-on-close: when the shell ends in any way (Exit, a crash, Task Manager, Windows sign-out)
    /// the handle closes and Windows ends the sidecar and every process it started.
    _job: Job,
}

impl Sidecar {
    /// Starts the sidecar; its stdout (the protocol from the sidecar) and the child are returned
    /// for the reader thread, its stderr is the shell's.
    pub fn spawn(launch: &Launch, app_data: &Path) -> io::Result<(Sidecar, Child, ChildStdout)> {
        let mut info = ExtendedLimitInfo::new();
        info.limit_kill_on_job_close();
        let job = Job::create_with_limit_info(&info).map_err(io::Error::other)?;

        let mut command = Command::new(&launch.node);
        command
            .arg(&launch.script)
            .env("DEVPANEL_APP_DATA", app_data)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .creation_flags(CREATE_NO_WINDOW);
        if let Some(web_root) = &launch.web_root {
            command.env("DEVPANEL_WEB_ROOT", web_root);
        }
        let mut child = command.spawn()?;
        // Node runs no user code for tens of milliseconds after spawn, so nothing it starts can
        // escape the Job before this line.
        if let Err(error) = job.assign_process(child.as_raw_handle() as isize) {
            let _ = child.kill();
            return Err(io::Error::other(error));
        }
        let stdin = child.stdin.take().expect("stdin is piped");
        let stdout = child.stdout.take().expect("stdout is piped");
        Ok((
            Sidecar {
                stdin: Mutex::new(stdin),
                _job: job,
            },
            child,
            stdout,
        ))
    }

    /// Writes one protocol line. A sidecar that is gone is noticed by the reader thread, so a
    /// failed write is only logged.
    pub fn send(&self, message: &ShellMessage) {
        let mut stdin = self.stdin.lock().unwrap_or_else(|e| e.into_inner());
        let result = serde_json::to_writer(&mut *stdin, message)
            .map_err(io::Error::from)
            .and_then(|()| stdin.write_all(b"\n"))
            .and_then(|()| stdin.flush());
        if let Err(error) = result {
            eprintln!("[shell] Could not send {message:?} to the sidecar: {error}");
        }
    }
}

use std::{
    fs::{self, File},
    io::{BufRead, BufReader, ErrorKind, Read, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
};

use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, State, WindowEvent,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Backend connection info sent to frontend.
#[derive(Clone, Serialize)]
struct BackendInfo {
    port: u16,
    token: String,
}

struct Backend {
    info: Result<BackendInfo, String>,
    child: Mutex<Option<Child>>,
    log_path: Option<PathBuf>,
}

/// Windows returns paths formatted like `\\?\C:\...`; some programs (including Node as cwd) handle this poorly.
fn clean_path(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => path,
    }
}

/// Dev: read each line from sidecar pipe and forward to terminal running `tauri dev`.
/// Using pipe instead of inheriting handle because `CREATE_NO_WINDOW` (Windows) drops inherited console handle.
fn forward_output<R: Read + Send + 'static>(reader: R, is_stderr: bool) {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let line = String::from_utf8_lossy(&buf);
                    let line = line.trim_end_matches(['\r', '\n']);
                    // Ignore write error (closed terminal) instead of panicking.
                    if is_stderr {
                        let _ = writeln!(std::io::stderr(), "[sidecar] {line}");
                    } else {
                        let _ = writeln!(std::io::stdout(), "[sidecar] {line}");
                    }
                }
            }
        }
    });
}

fn log_tail(path: &Option<PathBuf>) -> String {
    let Some(path) = path else { return String::new() };
    let content = fs::read_to_string(path).unwrap_or_default();
    let lines: Vec<&str> = content.lines().collect();
    let tail = lines[lines.len().saturating_sub(15)..].join("\n");
    format!("{tail}\n\n(full log: {})", path.display())
}

#[tauri::command]
fn backend_info(state: State<'_, Backend>) -> Result<BackendInfo, String> {
    let info = state.info.clone()?;
    // If sidecar already exited (crash / missing module...), return immediately with log.
    if let Ok(mut guard) = state.child.lock() {
        if let Some(child) = guard.as_mut() {
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!("Backend exited ({status}).\n{}", log_tail(&state.log_path)));
            }
        }
    }
    Ok(info)
}

/// Restore main window (when minimized or hidden to tray).
fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// System tray icon: left-click to show app, right-click for menu.
fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Open Zimusix", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "Play / Pause", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &toggle, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Zimusix")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "toggle" => {
                let _ = app.emit("tray-play-pause", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[tauri::command]
fn set_tray_tooltip(app: AppHandle, text: String) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(text));
    }
}

/// Directory containing `server.js`: source in dev, packaged (resources/sidecar) in release.
fn sidecar_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("sidecar");
    let mut candidates: Vec<PathBuf> = Vec::new();
    if cfg!(debug_assertions) {
        candidates.push(dev.clone());
    }
    if let Ok(resources) = app.path().resource_dir() {
        let resources = clean_path(resources);
        candidates.push(resources.join("resources").join("sidecar"));
        candidates.push(resources.join("sidecar"));
    }
    candidates.push(dev);
    candidates
        .iter()
        .find(|dir| dir.join("server.js").is_file())
        .cloned()
        .ok_or_else(|| {
            let tried: Vec<String> = candidates.iter().map(|c| c.display().to_string()).collect();
            format!(
                "Could not find sidecar/server.js. Tried:\n{}\nPlease run `npm run setup` (dev) or `npm run build` (packaging).",
                tried.join("\n")
            )
        })
}

fn find_in_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).map(|dir| dir.join(name)).find(|candidate| candidate.is_file())
}

/// Node.js: ZIMUSIX_NODE → bundled version → PATH → common installation locations.
/// (macOS/Linux GUI apps usually do not inherit shell PATH, so we search additional paths.)
fn node_binary(app: &AppHandle) -> PathBuf {
    if let Ok(custom) = std::env::var("ZIMUSIX_NODE") {
        return PathBuf::from(custom);
    }
    let name = if cfg!(windows) { "node.exe" } else { "node" };

    if let Ok(resources) = app.path().resource_dir() {
        let resources = clean_path(resources);
        for bundled in [
            resources.join("resources").join("node").join(name),
            resources.join("node").join(name),
        ] {
            if bundled.is_file() {
                return bundled;
            }
        }
    }
    if let Some(found) = find_in_path(name) {
        return found;
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    if cfg!(windows) {
        for var in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
            if let Some(base) = std::env::var_os(var) {
                candidates.push(PathBuf::from(base).join("nodejs").join(name));
            }
        }
    } else {
        for fixed in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"] {
            candidates.push(PathBuf::from(fixed));
        }
        if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
            candidates.push(home.join(".volta/bin/node"));
            candidates.push(home.join(".local/share/fnm/aliases/default/bin/node"));
            // nvm: pick the latest installed version
            if let Ok(entries) = fs::read_dir(home.join(".nvm/versions/node")) {
                let mut versions: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
                versions.sort();
                if let Some(latest) = versions.pop() {
                    candidates.push(latest.join("bin/node"));
                }
            }
        }
    }
    candidates.into_iter().find(|c| c.is_file()).unwrap_or_else(|| PathBuf::from(name))
}

fn spawn_backend(app: &AppHandle, log_path: &Path) -> Result<(BackendInfo, Child), String> {
    // Pick an available port on loopback, then release it for sidecar to bind.
    let port = {
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Failed to bind local port: {e}"))?;
        listener.local_addr().map_err(|e| e.to_string())?.port()
    };
    // Random token per run (from OS RNG).
    let token = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());

    let dir = sidecar_dir(app)?;
    let data_dir = clean_path(app.path().app_data_dir().map_err(|e| e.to_string())?);
    fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data directory: {e}"))?;

    let node = node_binary(app);
    let mut command = Command::new(&node);
    command
        .arg("server.js")
        .current_dir(&dir)
        .env("ZIMUSIX_PORT", port.to_string())
        .env("ZIMUSIX_TOKEN", &token)
        .env("ZIMUSIX_DATA_DIR", &data_dir)
        // stdin closes (app exits/crashes) → sidecar exits automatically, no orphans.
        .env("ZIMUSIX_EXIT_ON_STDIN_CLOSE", "1")
        .stdin(Stdio::piped());

    // Release build has no console: write stdout/stderr of sidecar to log file for diagnostics.
    // In dev: pipe and forward to terminal.
    if cfg!(debug_assertions) {
        command.stdout(Stdio::piped()).stderr(Stdio::piped());
    } else {
        let log = File::create(log_path).map_err(|e| format!("Failed to create log file: {e}"))?;
        let log_err = log.try_clone().map_err(|e| e.to_string())?;
        command.stdout(Stdio::from(log)).stderr(Stdio::from(log_err));
    }

    #[cfg(windows)]
    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    let mut child = command.spawn().map_err(|e| match e.kind() {
        ErrorKind::NotFound => format!(
            "Node.js (>= 20.3) not found. Tried: {}.\nPlease install Node.js or set the ZIMUSIX_NODE environment variable.",
            node.display()
        ),
        _ => format!("Failed to start backend ({}): {e}", node.display()),
    })?;

    if cfg!(debug_assertions) {
        if let Some(out) = child.stdout.take() {
            forward_output(out, false);
        }
        if let Some(err) = child.stderr.take() {
            forward_output(err, true);
        }
    }

    Ok((BackendInfo { port, token }, child))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![backend_info, set_tray_tooltip])
        // Clicking X hides window to tray; music keeps playing. Quit via tray menu -> "Quit".
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            let log_path = app
                .path()
                .app_data_dir()
                .ok()
                .map(clean_path)
                .map(|dir| {
                    let _ = fs::create_dir_all(&dir);
                    dir.join("sidecar.log")
                });
            let result = match &log_path {
                Some(path) => spawn_backend(app.handle(), path),
                None => Err("Could not determine application data directory".to_string()),
            };
            let (info, child) = match result {
                Ok((info, child)) => (Ok(info), Some(child)),
                Err(error) => (Err(error), None),
            };
            app.manage(Backend {
                info,
                child: Mutex::new(child),
                log_path,
            });
            build_tray(app.handle())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error initializing Tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(backend) = app.try_state::<Backend>() {
                    if let Ok(mut guard) = backend.child.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        });
}

use std::{
    fs::{self, File},
    io::ErrorKind,
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
};

use serde::Serialize;
use tauri::{AppHandle, Manager, RunEvent, State};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Thông tin kết nối backend gửi cho frontend.
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

/// Windows trả đường dẫn dạng `\\?\C:\...`; một số chương trình (kể cả Node làm cwd) xử lý không tốt.
fn clean_path(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => path,
    }
}

fn log_tail(path: &Option<PathBuf>) -> String {
    let Some(path) = path else { return String::new() };
    let content = fs::read_to_string(path).unwrap_or_default();
    let lines: Vec<&str> = content.lines().collect();
    let tail = lines[lines.len().saturating_sub(15)..].join("\n");
    format!("{tail}\n\n(log đầy đủ: {})", path.display())
}

#[tauri::command]
fn backend_info(state: State<'_, Backend>) -> Result<BackendInfo, String> {
    let info = state.info.clone()?;
    // Nếu sidecar đã thoát (crash/thiếu module...) thì báo ngay kèm log thay vì để UI chờ hết giờ.
    if let Ok(mut guard) = state.child.lock() {
        if let Some(child) = guard.as_mut() {
            if let Ok(Some(status)) = child.try_wait() {
                return Err(format!("Backend đã thoát ({status}).\n{}", log_tail(&state.log_path)));
            }
        }
    }
    Ok(info)
}

/// Thư mục chứa `server.js`: mã nguồn khi dev, bản đã đóng gói (resources/sidecar) khi release.
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
                "Không tìm thấy sidecar/server.js. Đã thử:\n{}\nHãy chạy `npm run setup` (dev) hoặc `npm run build` (đóng gói).",
                tried.join("\n")
            )
        })
}

fn find_in_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).map(|dir| dir.join(name)).find(|candidate| candidate.is_file())
}

/// Node.js: ZIMUSIX_NODE → bản đóng gói kèm → PATH → các vị trí cài đặt phổ biến.
/// (App GUI trên macOS/Linux thường không thừa hưởng PATH của shell nên cần dò thêm.)
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
            // nvm: lấy phiên bản mới nhất
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
    // Chọn cổng trống trên loopback, rồi giải phóng để sidecar bind.
    let port = {
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Không mở được cổng cục bộ: {e}"))?;
        listener.local_addr().map_err(|e| e.to_string())?.port()
    };
    // Token ngẫu nhiên mỗi lần chạy (từ RNG của hệ điều hành).
    let token = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());

    let dir = sidecar_dir(app)?;
    let data_dir = clean_path(app.path().app_data_dir().map_err(|e| e.to_string())?);
    fs::create_dir_all(&data_dir).map_err(|e| format!("Không tạo được thư mục dữ liệu: {e}"))?;

    let node = node_binary(app);
    let mut command = Command::new(&node);
    command
        .arg("server.js")
        .current_dir(&dir)
        .env("ZIMUSIX_PORT", port.to_string())
        .env("ZIMUSIX_TOKEN", &token)
        .env("ZIMUSIX_DATA_DIR", &data_dir)
        // stdin đóng (app thoát/crash) → sidecar tự thoát, không bị mồ côi.
        .env("ZIMUSIX_EXIT_ON_STDIN_CLOSE", "1")
        .stdin(Stdio::piped());

    // Bản release không có console: ghi stdout/stderr của sidecar ra file log để còn chẩn đoán.
    // Khi dev giữ nguyên terminal.
    if !cfg!(debug_assertions) {
        let log = File::create(log_path).map_err(|e| format!("Không tạo được file log: {e}"))?;
        let log_err = log.try_clone().map_err(|e| e.to_string())?;
        command.stdout(Stdio::from(log)).stderr(Stdio::from(log_err));
    }

    #[cfg(windows)]
    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    let child = command.spawn().map_err(|e| match e.kind() {
        ErrorKind::NotFound => format!(
            "Không tìm thấy Node.js (cần >= 20.3), đã thử: {}.\nHãy cài Node.js hoặc đặt biến môi trường ZIMUSIX_NODE.",
            node.display()
        ),
        _ => format!("Không chạy được backend ({}): {e}", node.display()),
    })?;

    Ok((BackendInfo { port, token }, child))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![backend_info])
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
                None => Err("Không xác định được thư mục dữ liệu của app".to_string()),
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
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("lỗi khi khởi tạo ứng dụng Tauri")
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

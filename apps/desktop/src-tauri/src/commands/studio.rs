use serde::Serialize;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;

use super::tools::{studio_executable, studio_plugins_dir};
use super::util::{command, find_tool, run_capture};

#[derive(Serialize)]
pub struct StudioInfo {
    pub found: bool,
    pub path: Option<String>,
    pub plugins_dir: Option<String>,
    pub rojo_plugin: bool,
    pub mcp_plugin: bool,
    pub running: bool,
    /// Built-in Studio MCP server executable (StudioMCP.exe / StudioMCP), when present.
    pub mcp_server: Option<String>,
}

fn studio_running() -> bool {
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    sys.processes().values().any(|p| {
        let n = p.name().to_string_lossy().to_lowercase();
        n.contains("robloxstudio")
    })
}

#[tauri::command]
pub fn studio_info() -> StudioInfo {
    let path = studio_executable();
    let plugins = studio_plugins_dir();
    let has = |needle: &str| -> bool {
        plugins
            .as_ref()
            .and_then(|d| std::fs::read_dir(d).ok())
            .map(|rd| rd.flatten().any(|e| e.file_name().to_string_lossy().to_lowercase().contains(needle)))
            .unwrap_or(false)
    };
    let rojo_plugin = has("rojo");
    let mcp_plugin = has("mcp");
    let mcp_server = path.as_ref().and_then(|exe| {
        let dir = exe.parent()?;
        let candidates = [dir.join("StudioMCP.exe"), dir.join("StudioMCP")];
        candidates.into_iter().find(|c| c.is_file())
    });
    StudioInfo {
        found: path.is_some(),
        path: path.map(|p| p.to_string_lossy().to_string()),
        plugins_dir: plugins.as_ref().map(|p| p.to_string_lossy().to_string()),
        rojo_plugin,
        mcp_plugin,
        running: studio_running(),
        mcp_server: mcp_server.map(|p| p.to_string_lossy().to_string()),
    }
}

/// Open a .rbxl/.rbxlx place file in Roblox Studio (detached).
#[tauri::command]
pub fn open_place_in_studio(place_path: String) -> Result<u32, String> {
    let exe = studio_executable().ok_or("Roblox Studio is not installed")?;
    let place = PathBuf::from(&place_path);
    if !place.exists() {
        return Err(format!("place file not found: {place_path}"));
    }
    let child = command(&exe).arg(&place).spawn().map_err(|e| e.to_string())?;
    Ok(child.id())
}

/// Launch Roblox Studio without a place.
#[tauri::command]
pub fn launch_studio() -> Result<u32, String> {
    let exe = studio_executable().ok_or("Roblox Studio is not installed")?;
    let child = command(&exe).spawn().map_err(|e| e.to_string())?;
    Ok(child.id())
}

/// Install the Rojo Studio plugin via `rojo plugin install`.
#[tauri::command]
pub async fn install_rojo_plugin() -> Result<String, String> {
    let rojo = find_tool("rojo").ok_or("Rojo is not installed")?;
    tokio::task::spawn_blocking(move || {
        let (code, out, err) = run_capture(&rojo, &["plugin", "install"], None, 120)?;
        if code == 0 {
            Ok(format!("{out}{err}").trim().to_string())
        } else {
            Err(format!("rojo plugin install failed ({code}): {err}{out}"))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct LogFile {
    pub path: String,
    pub name: String,
    pub modified_ms: u64,
    pub size: u64,
}

fn studio_logs_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        return dirs::data_local_dir().map(|d| d.join("Roblox").join("logs"));
    }
    #[cfg(target_os = "macos")]
    {
        return dirs::home_dir().map(|h| h.join("Library").join("Logs").join("Roblox"));
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        None
    }
}

/// Studio log files, newest first (only Studio logs, not the player).
#[tauri::command]
pub fn list_studio_logs(limit: Option<usize>) -> Vec<LogFile> {
    let Some(dir) = studio_logs_dir() else { return vec![] };
    let Ok(rd) = std::fs::read_dir(dir) else { return vec![] };
    let mut files: Vec<LogFile> = rd
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if !name.to_lowercase().contains("studio") || !name.ends_with(".log") {
                return None;
            }
            let meta = e.metadata().ok()?;
            let modified_ms = meta.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as u64;
            Some(LogFile { path: e.path().to_string_lossy().to_string(), name, modified_ms, size: meta.len() })
        })
        .collect();
    files.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    files.truncate(limit.unwrap_or(5));
    files
}

#[derive(Serialize)]
pub struct LogChunk {
    pub content: String,
    pub offset: u64,
    pub size: u64,
}

/// Read a log file from `offset` (tail semantics). Returns the new offset.
#[tauri::command]
pub fn read_studio_log(path: String, offset: u64, max_bytes: Option<u64>) -> Result<LogChunk, String> {
    let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let size = f.metadata().map_err(|e| e.to_string())?.len();
    let start = if offset > size { 0 } else { offset };
    let max = max_bytes.unwrap_or(512 * 1024);
    let to_read = (size - start).min(max);
    f.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; to_read as usize];
    f.read_exact(&mut buf).map_err(|e| e.to_string())?;
    Ok(LogChunk { content: String::from_utf8_lossy(&buf).to_string(), offset: start + to_read, size })
}

/// Poll the Rojo serve endpoint to know whether Studio is connected.
#[tauri::command]
pub async fn rojo_serve_status(port: Option<u16>) -> Result<serde_json::Value, String> {
    let port = port.unwrap_or(34872);
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(2)).build().map_err(|e| e.to_string())?;
    let res = client.get(format!("http://127.0.0.1:{port}/api/rojo")).send().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

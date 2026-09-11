use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_ms: u64,
}

#[derive(Serialize)]
pub struct AppPaths {
    pub app_data: String,
    pub projects_dir: String,
    pub tools_dir: String,
    pub logs_dir: String,
    pub home: String,
}

#[tauri::command]
pub fn app_paths() -> Result<AppPaths, String> {
    let data = dirs::data_dir().ok_or("no data dir")?.join("com.worldforge.ai");
    let local = dirs::data_local_dir().ok_or("no local data dir")?.join("WorldForge");
    let docs = dirs::document_dir().or_else(dirs::home_dir).ok_or("no documents dir")?;
    let projects = docs.join("WorldForge Projects");
    for d in [&data, &local, &projects] {
        std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    Ok(AppPaths {
        app_data: data.to_string_lossy().to_string(),
        projects_dir: projects.to_string_lossy().to_string(),
        tools_dir: local.join("tools").to_string_lossy().to_string(),
        logs_dir: local.join("logs").to_string_lossy().to_string(),
        home: dirs::home_dir().map(|h| h.to_string_lossy().to_string()).unwrap_or_default(),
    })
}

#[tauri::command]
pub fn fs_read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
pub fn fs_write_text(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&p, content).map_err(|e| format!("{path}: {e}"))
}

/// Write many files at once (project scaffolding).
#[tauri::command]
pub fn fs_write_files(root: String, files: Vec<(String, String)>) -> Result<usize, String> {
    let root = PathBuf::from(root);
    for (rel, content) in &files {
        let p = root.join(rel);
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&p, content).map_err(|e| format!("{}: {e}", p.display()))?;
    }
    Ok(files.len())
}

#[tauri::command]
pub fn fs_read_binary_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    Ok(base64_encode(&bytes))
}

#[tauri::command]
pub fn fs_write_binary_base64(path: String, data: String) -> Result<(), String> {
    let bytes = base64_decode(&data)?;
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&p, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub fn fs_is_dir(path: String) -> bool {
    Path::new(&path).is_dir()
}

#[tauri::command]
pub fn fs_mkdirp(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_list_dir(path: String) -> Result<Vec<DirEntryInfo>, String> {
    let rd = std::fs::read_dir(&path).map_err(|e| format!("{path}: {e}"))?;
    let mut out = Vec::new();
    for e in rd.flatten() {
        let meta = match e.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let modified_ms = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
        out.push(DirEntryInfo { name: e.file_name().to_string_lossy().to_string(), path: e.path().to_string_lossy().to_string(), is_dir: meta.is_dir(), size: meta.len(), modified_ms });
    }
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

/// Recursive file listing (relative paths), skipping heavy folders.
#[tauri::command]
pub fn fs_walk(root: String, max_entries: Option<usize>) -> Result<Vec<String>, String> {
    let max = max_entries.unwrap_or(5000);
    let root_path = PathBuf::from(&root);
    let mut out = Vec::new();
    for entry in walkdir::WalkDir::new(&root_path).into_iter().filter_entry(|e| {
        let n = e.file_name().to_string_lossy();
        !(n == "node_modules" || n == ".git" || n == "out" || n == "build" || n == "target")
    }) {
        let Ok(e) = entry else { continue };
        if e.file_type().is_file() {
            if let Ok(rel) = e.path().strip_prefix(&root_path) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
                if out.len() >= max {
                    break;
                }
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn fs_remove(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else if p.exists() {
        std::fs::remove_file(p).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn fs_copy_file(from: String, to: String) -> Result<u64, String> {
    let dst = PathBuf::from(&to);
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&from, &dst).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path).map(|m| m.len()).map_err(|e| e.to_string())
}

// --- tiny base64 (avoid an extra crate)
const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn base64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let n = ((chunk[0] as u32) << 16) | ((chunk.get(1).copied().unwrap_or(0) as u32) << 8) | chunk.get(2).copied().unwrap_or(0) as u32;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

pub fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let mut buf = 0u32;
    let mut bits = 0;
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' | b'\n' | b'\r' | b' ' => continue,
            _ => return Err("invalid base64".into()),
        } as u32;
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8 & 255);
        }
    }
    Ok(out)
}

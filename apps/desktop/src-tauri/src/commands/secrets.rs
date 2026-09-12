use keyring::Entry;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const SERVICE: &str = "com.worldforge.ai";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

/// Secrets live in the OS secure storage (Windows Credential Manager, macOS Keychain, Secret Service).
/// They are never written to disk by WorldForge, never logged, and never sent to the webview
/// except through `secret_get` for provider keys the user explicitly manages in Settings.
///
/// A local, git-ignored `.env` file (repo root, next to the executable, or `%APPDATA%\WorldForge\.env`)
/// is accepted as a fallback for people who prefer files: `ROBLOX_OPEN_CLOUD_API_KEY=…`,
/// `MESHY_API_KEY=…`, `GEMINI_IMAGE_API_KEY=…`, `ELEVENLABS_API_KEY=…`. The keyring wins when both exist.
#[tauri::command]
pub fn secret_set(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_exists(key: String) -> Result<bool, String> {
    match entry(&key)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(env_secret(&key).is_some()),
        Err(e) => Err(e.to_string()),
    }
}

/// Where a secret comes from: "keyring", "env" (environment / .env file) or "none".
#[tauri::command]
pub fn secret_source(key: String) -> String {
    if let Ok(e) = entry(&key) {
        if e.get_password().is_ok() {
            return "keyring".into();
        }
    }
    if env_secret(&key).is_some() {
        return "env".into();
    }
    "none".into()
}

#[tauri::command]
pub fn secret_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Returns the secret for internal use (never exposed to the webview): keyring first, then the environment.
pub fn secret_internal(key: &str) -> Option<String> {
    if let Some(v) = entry(key).ok().and_then(|e| e.get_password().ok()) {
        return Some(v);
    }
    env_secret(key)
}

/// Environment variable names accepted for a keyring key (`roblox_open_cloud_api_key` → `ROBLOX_OPEN_CLOUD_API_KEY`, plus aliases).
fn env_names(key: &str) -> Vec<String> {
    let mut names = vec![key.to_ascii_uppercase()];
    match key {
        "gemini_image_api_key" => names.push("GEMINI_API_KEY".into()),
        "roblox_open_cloud_api_key" => names.push("OPEN_CLOUD_API_KEY".into()),
        _ => {}
    }
    names
}

fn env_secret(key: &str) -> Option<String> {
    load_dotenv();
    env_names(key).into_iter().find_map(|n| std::env::var(&n).ok()).map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

static DOTENV: OnceLock<HashMap<String, String>> = OnceLock::new();

/// Candidate `.env` locations: the working directory and its parents (dev: repo root), the executable's
/// folder, and the per-user config folder.
fn dotenv_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        let mut dir: Option<&Path> = Some(cwd.as_path());
        for _ in 0..4 {
            if let Some(d) = dir {
                out.push(d.join(".env"));
                dir = d.parent();
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            out.push(dir.join(".env"));
        }
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        out.push(PathBuf::from(appdata).join("WorldForge").join(".env"));
    }
    if let Some(home) = std::env::var_os("HOME") {
        out.push(PathBuf::from(home).join(".config").join("worldforge").join(".env"));
    }
    out
}

/// Minimal dotenv: `KEY=value`, `export KEY="value"`, comments with `#`. Values already present in the
/// process environment are never overridden. Parsed once; the file contents are never logged.
pub fn load_dotenv() -> &'static HashMap<String, String> {
    DOTENV.get_or_init(|| {
        let mut loaded = HashMap::new();
        for path in dotenv_candidates() {
            let Ok(text) = std::fs::read_to_string(&path) else { continue };
            for raw in text.lines() {
                let line = raw.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                let line = line.strip_prefix("export ").unwrap_or(line);
                let Some((k, v)) = line.split_once('=') else { continue };
                let k = k.trim();
                let mut v = v.trim().to_string();
                if (v.starts_with('"') && v.ends_with('"') && v.len() >= 2) || (v.starts_with('\'') && v.ends_with('\'') && v.len() >= 2) {
                    v = v[1..v.len() - 1].to_string();
                }
                if k.is_empty() || loaded.contains_key(k) || std::env::var_os(k).is_some() {
                    continue;
                }
                std::env::set_var(k, &v);
                loaded.insert(k.to_string(), v);
            }
        }
        loaded
    })
}

/// Non-secret configuration that may live in `.env` next to the keys (prefills the Roblox tab).
#[derive(Serialize)]
pub struct EnvConfig {
    pub creator_user_id: Option<u64>,
    pub creator_group_id: Option<u64>,
    pub universe_id: Option<u64>,
    pub place_id: Option<u64>,
    pub dotenv_loaded: bool,
}

#[tauri::command]
pub fn env_config() -> EnvConfig {
    let loaded = load_dotenv();
    let num = |n: &str| std::env::var(n).ok().and_then(|v| v.trim().parse::<u64>().ok());
    EnvConfig {
        creator_user_id: num("ROBLOX_CREATOR_USER_ID"),
        creator_group_id: num("ROBLOX_CREATOR_GROUP_ID"),
        universe_id: num("ROBLOX_UNIVERSE_ID"),
        place_id: num("ROBLOX_PLACE_ID"),
        dotenv_loaded: !loaded.is_empty(),
    }
}

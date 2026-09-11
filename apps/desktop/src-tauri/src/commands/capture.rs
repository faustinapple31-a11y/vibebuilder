use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct CaptureResult {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub window_title: String,
}

#[derive(Serialize)]
pub struct WindowInfo {
    pub id: u32,
    pub title: String,
    pub app_name: String,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub fn list_windows() -> Vec<WindowInfo> {
    let Ok(windows) = xcap::Window::all() else { return vec![] };
    windows
        .into_iter()
        .filter_map(|w| {
            let minimized = w.is_minimized().unwrap_or(true);
            let width = w.width().unwrap_or(0);
            let height = w.height().unwrap_or(0);
            let title = w.title().unwrap_or_default();
            if minimized || width <= 100 || height <= 100 || title.is_empty() {
                return None;
            }
            Some(WindowInfo { id: w.id().unwrap_or(0), title, app_name: w.app_name().unwrap_or_default(), width, height })
        })
        .collect()
}

/// Screenshot a window whose title contains `title_contains` (default "Roblox Studio") as PNG.
#[tauri::command]
pub fn capture_window(title_contains: Option<String>, out_path: String) -> Result<CaptureResult, String> {
    let needle = title_contains.unwrap_or_else(|| "Roblox Studio".into()).to_lowercase();
    let windows = xcap::Window::all().map_err(|e| e.to_string())?;
    let win = windows
        .into_iter()
        .filter(|w| !w.is_minimized().unwrap_or(true))
        .find(|w| w.title().unwrap_or_default().to_lowercase().contains(&needle) || w.app_name().unwrap_or_default().to_lowercase().contains(&needle))
        .ok_or_else(|| format!("no window matching \"{needle}\" found"))?;
    let title = win.title().unwrap_or_default();
    let image = win.capture_image().map_err(|e| e.to_string())?;
    let out = PathBuf::from(&out_path);
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    image.save(&out).map_err(|e| e.to_string())?;
    Ok(CaptureResult { path: out_path, width: image.width(), height: image.height(), window_title: title })
}

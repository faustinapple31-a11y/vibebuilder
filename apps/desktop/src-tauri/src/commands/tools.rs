use serde::Serialize;
use std::path::PathBuf;
use sysinfo::System;

use super::util::{find_tool, run_capture, version_of};

#[derive(Serialize, Clone)]
pub struct ToolStatus {
    pub id: String,
    pub name: String,
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub install_hint: String,
    pub installable: bool,
    pub category: String,
}

#[derive(Serialize, Clone)]
pub struct SystemInfo {
    pub os: String,
    pub os_version: String,
    pub arch: String,
    pub ram_gb: f64,
    pub cpu_cores: usize,
    pub docker: bool,
    pub wsl: bool,
    pub hyperv_or_virtualization: bool,
}

#[derive(Serialize, Clone)]
pub struct ToolsReport {
    pub system: SystemInfo,
    pub tools: Vec<ToolStatus>,
    pub studio_path: Option<String>,
    pub rojo_plugin_installed: bool,
    pub studio_mcp_plugin_installed: bool,
}

pub fn studio_executable() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Some(local) = dirs::data_local_dir() {
            candidates.push(local.join("Roblox").join("Versions"));
        }
        candidates.push(PathBuf::from("C:\\Program Files (x86)\\Roblox\\Versions"));
        candidates.push(PathBuf::from("C:\\Program Files\\Roblox\\Versions"));
        let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
        for versions in candidates {
            let Ok(entries) = std::fs::read_dir(&versions) else { continue };
            for entry in entries.flatten() {
                let exe = entry.path().join("RobloxStudioBeta.exe");
                if exe.is_file() {
                    let mtime = exe.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
                    if best.as_ref().map(|(t, _)| mtime > *t).unwrap_or(true) {
                        best = Some((mtime, exe));
                    }
                }
            }
        }
        return best.map(|(_, p)| p);
    }
    #[cfg(target_os = "macos")]
    {
        let p = PathBuf::from("/Applications/RobloxStudio.app/Contents/MacOS/RobloxStudio");
        if p.exists() {
            return Some(p);
        }
        if let Some(home) = dirs::home_dir() {
            let p = home.join("Applications/RobloxStudio.app/Contents/MacOS/RobloxStudio");
            if p.exists() {
                return Some(p);
            }
        }
        None
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        None
    }
}

pub fn studio_plugins_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        return dirs::data_local_dir().map(|d| d.join("Roblox").join("Plugins"));
    }
    #[cfg(target_os = "macos")]
    {
        return dirs::home_dir().map(|h| h.join("Documents").join("Roblox").join("Plugins"));
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        None
    }
}

fn tool(id: &str, name: &str, bin: &str, version_args: &[&str], hint: &str, installable: bool, category: &str) -> ToolStatus {
    let path = find_tool(bin);
    let version = path.as_ref().and_then(|p| version_of(p, version_args));
    ToolStatus {
        id: id.into(),
        name: name.into(),
        found: path.is_some(),
        path: path.map(|p| p.to_string_lossy().to_string()),
        version,
        install_hint: hint.into(),
        installable,
        category: category.into(),
    }
}

fn docker_available() -> bool {
    find_tool("docker").map(|p| run_capture(&p, &["info", "--format", "{{.ServerVersion}}"], None, 15).map(|(c, _, _)| c == 0).unwrap_or(false)).unwrap_or(false)
}

fn wsl_available() -> bool {
    #[cfg(target_os = "windows")]
    {
        if let Some(p) = find_tool("wsl") {
            if let Ok((code, out, _)) = run_capture(&p, &["-l", "-q"], None, 15) {
                let text: String = out.chars().filter(|c| *c != '\0').collect();
                return code == 0 && !text.trim().is_empty();
            }
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[tauri::command]
pub fn detect_tools() -> ToolsReport {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();
    let ram_gb = sys.total_memory() as f64 / (1024.0 * 1024.0 * 1024.0);
    let docker = docker_available();
    let wsl = wsl_available();
    let system = SystemInfo {
        os: std::env::consts::OS.to_string(),
        os_version: System::long_os_version().unwrap_or_default(),
        arch: std::env::consts::ARCH.to_string(),
        ram_gb: (ram_gb * 10.0).round() / 10.0,
        cpu_cores: sys.cpus().len(),
        docker,
        wsl,
        hyperv_or_virtualization: docker || wsl,
    };
    let studio = studio_executable();
    let mut tools = vec![
        tool("node", "Node.js", "node", &["--version"], "Install Node.js 20+ from nodejs.org", false, "runtime"),
        tool("npm", "npm", "npm", &["--version"], "Bundled with Node.js", false, "runtime"),
        tool("git", "Git", "git", &["--version"], "Install Git from git-scm.com", false, "runtime"),
        tool("rbxtsc", "roblox-ts", "rbxtsc", &["--version"], "npm install -g roblox-ts", true, "roblox"),
        tool("rojo", "Rojo", "rojo", &["--version"], "Downloaded automatically from GitHub releases", true, "roblox"),
        tool("claude", "Claude Code", "claude", &["--version"], "npm install -g @anthropic-ai/claude-code", true, "agent"),
        tool("codex", "Codex CLI", "codex", &["--version"], "npm install -g @openai/codex", true, "agent"),
        tool("opencode", "OpenCode", "opencode", &["--version"], "npm install -g opencode-ai", true, "agent"),
        tool("gemini", "Gemini CLI", "gemini", &["--version"], "npm install -g @google/gemini-cli", true, "agent"),
        tool("antigravity", "Antigravity", "antigravity", &["--version"], "Install Antigravity IDE from Google", false, "agent"),
        tool("docker", "Docker", "docker", &["--version"], "Install Docker Desktop (optional sandbox runtime)", false, "sandbox"),
    ];
    tools.push(ToolStatus {
        id: "studio".into(),
        name: "Roblox Studio".into(),
        found: studio.is_some(),
        path: studio.as_ref().map(|p| p.to_string_lossy().to_string()),
        version: studio.as_ref().and_then(|p| p.parent().and_then(|d| d.file_name()).map(|n| n.to_string_lossy().to_string())),
        install_hint: "Install Roblox Studio from create.roblox.com".into(),
        installable: false,
        category: "roblox".into(),
    });
    let plugins = studio_plugins_dir();
    let rojo_plugin_installed = plugins
        .as_ref()
        .and_then(|d| std::fs::read_dir(d).ok())
        .map(|rd| rd.flatten().any(|e| e.file_name().to_string_lossy().to_lowercase().contains("rojo")))
        .unwrap_or(false);
    let studio_mcp_plugin_installed = plugins
        .as_ref()
        .and_then(|d| std::fs::read_dir(d).ok())
        .map(|rd| rd.flatten().any(|e| e.file_name().to_string_lossy().to_lowercase().contains("mcp")))
        .unwrap_or(false);
    ToolsReport { system, tools, studio_path: studio.map(|p| p.to_string_lossy().to_string()), rojo_plugin_installed, studio_mcp_plugin_installed }
}

#[derive(Serialize, Clone)]
pub struct InstallPlan {
    pub id: String,
    pub kind: String, // "npm" | "download-rojo"
    pub program: Option<String>,
    pub args: Vec<String>,
    pub label: String,
}

/// Returns how to install a tool. npm installs are executed by the frontend through `spawn_process`
/// (so output streams to the UI); Rojo is downloaded by `install_rojo`.
#[tauri::command]
pub fn install_plan(id: String) -> Result<InstallPlan, String> {
    let npm = find_tool("npm").ok_or("npm is not installed")?.to_string_lossy().to_string();
    let plan = |pkg: &str, label: &str| InstallPlan {
        id: id.clone(),
        kind: "npm".into(),
        program: Some(npm.clone()),
        args: vec!["install".into(), "-g".into(), pkg.into()],
        label: label.into(),
    };
    Ok(match id.as_str() {
        "rbxtsc" => plan("roblox-ts", "Installing roblox-ts compiler"),
        "claude" => plan("@anthropic-ai/claude-code", "Installing Claude Code"),
        "codex" => plan("@openai/codex", "Installing Codex CLI"),
        "opencode" => plan("opencode-ai", "Installing OpenCode"),
        "gemini" => plan("@google/gemini-cli", "Installing Gemini CLI"),
        "rojo" => InstallPlan { id: id.clone(), kind: "download-rojo".into(), program: None, args: vec![], label: "Downloading Rojo".into() },
        _ => return Err(format!("{id} cannot be installed automatically")),
    })
}

/// Download the latest Rojo release binary into the WorldForge tools directory.
#[tauri::command]
pub async fn install_rojo() -> Result<String, String> {
    let tools_dir = dirs::data_local_dir().ok_or("no local data dir")?.join("WorldForge").join("tools").join("rojo");
    tokio::fs::create_dir_all(&tools_dir).await.map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder().user_agent("WorldForgeAI/0.1").build().map_err(|e| e.to_string())?;
    let release: serde_json::Value = client
        .get("https://api.github.com/repos/rojo-rbx/rojo/releases/latest")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let (os, arch) = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => ("windows", "x86_64"),
        ("windows", "aarch64") => ("windows", "aarch64"),
        ("macos", "x86_64") => ("macos", "x86_64"),
        ("macos", "aarch64") => ("macos", "aarch64"),
        ("linux", "x86_64") => ("linux", "x86_64"),
        (o, a) => return Err(format!("unsupported platform {o}/{a}")),
    };
    let assets = release["assets"].as_array().ok_or("no assets in release")?;
    let asset = assets
        .iter()
        .find(|a| {
            let n = a["name"].as_str().unwrap_or("");
            n.contains(os) && n.contains(arch) && n.ends_with(".zip")
        })
        .ok_or("no matching Rojo asset")?;
    let url = asset["browser_download_url"].as_str().ok_or("no download url")?;
    let bytes = client.get(url).send().await.map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?;
    let cursor = std::io::Cursor::new(bytes.to_vec());
    let mut zip = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
    let mut installed = None;
    for i in 0..zip.len() {
        let mut file = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();
        if name.starts_with("rojo") {
            let out_path = tools_dir.join(if cfg!(windows) { "rojo.exe" } else { "rojo" });
            let mut out = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut out).map_err(|e| e.to_string())?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&out_path, std::fs::Permissions::from_mode(0o755));
            }
            installed = Some(out_path);
        }
    }
    installed.map(|p| p.to_string_lossy().to_string()).ok_or_else(|| "rojo binary not found in archive".to_string())
}

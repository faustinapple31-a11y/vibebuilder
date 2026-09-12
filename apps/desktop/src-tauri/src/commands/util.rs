use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Resolve an executable name to a full path by searching PATH (and Windows script extensions).
pub fn which(name: &str) -> Option<PathBuf> {
    let p = Path::new(name);
    if p.is_absolute() && p.exists() {
        return Some(p.to_path_buf());
    }
    let path_var = std::env::var_os("PATH")?;
    let exts: Vec<&str> = if cfg!(windows) { vec![".exe", ".cmd", ".bat", ".com"] } else { vec![""] };
    for dir in std::env::split_paths(&path_var) {
        for ext in &exts {
            let candidate = dir.join(format!("{name}{ext}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Extra locations where tools commonly live even when not on PATH.
pub fn extra_tool_dirs() -> Vec<PathBuf> {
    let mut dirs_out = Vec::new();
    if let Some(home) = dirs::home_dir() {
        dirs_out.push(home.join(".rokit").join("bin"));
        dirs_out.push(home.join(".aftman").join("bin"));
        dirs_out.push(home.join(".cargo").join("bin"));
        dirs_out.push(home.join(".local").join("bin"));
        dirs_out.push(home.join(".claude").join("local"));
        dirs_out.push(home.join("bin"));
    }
    if let Some(data) = dirs::data_local_dir() {
        dirs_out.push(data.join("WorldForge").join("tools").join("rojo"));
        dirs_out.push(data.join("Programs").join("Antigravity"));
    }
    if let Some(roaming) = dirs::data_dir() {
        dirs_out.push(roaming.join("npm"));
    }
    dirs_out.push(PathBuf::from("/usr/local/bin"));
    dirs_out.push(PathBuf::from("/opt/homebrew/bin"));
    dirs_out
}

pub fn find_tool(name: &str) -> Option<PathBuf> {
    if let Some(p) = which(name) {
        return Some(p);
    }
    let exts: Vec<&str> = if cfg!(windows) { vec![".exe", ".cmd", ".bat", ".com"] } else { vec![""] };
    for dir in extra_tool_dirs() {
        for ext in &exts {
            let candidate = dir.join(format!("{name}{ext}"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// npm-style `.cmd` shims cannot receive arbitrary arguments (cmd.exe escaping): resolve the real
/// target they launch (a native exe under node_modules, or `node <cli.js>`) and run it directly.
pub fn launch_spec(program: &Path) -> (PathBuf, Vec<String>) {
    let ext = program.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if ext != "cmd" && ext != "bat" {
        return (program.to_path_buf(), vec![]);
    }
    let Ok(text) = std::fs::read_to_string(program) else { return (program.to_path_buf(), vec![]) };
    let dir = program.parent().map(|d| d.to_path_buf()).unwrap_or_default();
    for line in text.lines() {
        let l = line.trim();
        if !l.contains("%dp0%") {
            continue;
        }
        let mut quoted: Vec<String> = Vec::new();
        let mut cur = String::new();
        let mut inside = false;
        for ch in l.chars() {
            if ch == '"' {
                if inside {
                    quoted.push(cur.clone());
                    cur.clear();
                }
                inside = !inside;
            } else if inside {
                cur.push(ch);
            }
        }
        for q in &quoted {
            let rel = q.replace("%dp0%", "");
            let target = dir.join(rel.trim_start_matches('\\').trim_start_matches('/'));
            let tl = target.to_string_lossy().to_ascii_lowercase();
            if tl.ends_with(".exe") && target.is_file() {
                return (target, vec![]);
            }
            if (tl.ends_with(".js") || tl.ends_with(".cjs") || tl.ends_with(".mjs")) && target.is_file() {
                let node = which("node").unwrap_or_else(|| PathBuf::from("node"));
                return (node, vec![target.to_string_lossy().to_string()]);
            }
        }
    }
    (program.to_path_buf(), vec![])
}

/// Build a Command for an executable path; on Windows hides the console window.
/// `.cmd` shims are unwrapped to their real target so arguments are passed verbatim.
pub fn command(program: &Path) -> Command {
    let (exe, prefix) = launch_spec(program);
    let mut cmd = Command::new(exe);
    cmd.args(prefix);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Run `program args...` and capture output (non-streaming).
pub fn run_capture(program: &Path, args: &[&str], cwd: Option<&Path>, timeout_secs: u64) -> Result<(i32, String, String), String> {
    let mut cmd = command(program);
    cmd.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let mut child = cmd.spawn().map_err(|e| format!("failed to start {}: {e}", program.display()))?;
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if start.elapsed().as_secs() > timeout_secs {
                    let _ = child.kill();
                    return Err(format!("{} timed out after {timeout_secs}s", program.display()));
                }
                std::thread::sleep(std::time::Duration::from_millis(30));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    Ok((
        out.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&out.stdout).to_string(),
        String::from_utf8_lossy(&out.stderr).to_string(),
    ))
}

pub fn version_of(program: &Path, args: &[&str]) -> Option<String> {
    let (code, out, err) = run_capture(program, args, None, 20).ok()?;
    let text = if out.trim().is_empty() { err } else { out };
    let line = text.lines().find(|l| !l.trim().is_empty())?.trim().to_string();
    if code != 0 && line.is_empty() {
        return None;
    }
    Some(line.chars().take(80).collect())
}

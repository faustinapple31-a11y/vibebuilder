use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

use super::util::{command, find_tool, run_capture};

/// Long-running child processes (agents, rojo serve, npm install, rbxtsc -w) keyed by an id.
#[derive(Default)]
pub struct ProcessRegistry {
    pub children: Mutex<HashMap<String, Arc<Mutex<Child>>>>,
    pub stdins: Mutex<HashMap<String, Arc<Mutex<ChildStdin>>>>,
}

#[derive(Serialize, Clone)]
pub struct ProcessOutput {
    pub id: String,
    pub stream: String,
    pub line: String,
}

#[derive(Serialize, Clone)]
pub struct ProcessExit {
    pub id: String,
    pub code: i32,
}

#[derive(Deserialize)]
pub struct SpawnOptions {
    pub id: String,
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    pub cwd: Option<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Text written to stdin right after spawn (prompt piping); stdin is closed afterwards unless keep_stdin.
    pub stdin: Option<String>,
    #[serde(default)]
    pub keep_stdin: bool,
    /// Environment variable names to strip from the child (never leak app secrets).
    #[serde(default)]
    pub strip_env: Vec<String>,
}

fn spawn_reader<R: std::io::Read + Send + 'static>(reader: Option<R>, stream: &'static str, app: AppHandle, id: String) {
    let Some(r) = reader else { return };
    std::thread::spawn(move || {
        let buf = BufReader::new(r);
        for line in buf.split(b'\n') {
            match line {
                Ok(bytes) => {
                    let mut text = String::from_utf8_lossy(&bytes).to_string();
                    if text.ends_with('\r') {
                        text.pop();
                    }
                    let _ = app.emit("process-output", ProcessOutput { id: id.clone(), stream: stream.into(), line: text });
                }
                Err(_) => break,
            }
        }
    });
}

#[tauri::command]
pub fn spawn_process(app: AppHandle, registry: State<'_, ProcessRegistry>, opts: SpawnOptions) -> Result<u32, String> {
    let program = find_tool(&opts.program).ok_or_else(|| format!("program not found: {}", opts.program))?;
    let mut cmd = command(&program);
    cmd.args(&opts.args).stdout(Stdio::piped()).stderr(Stdio::piped());
    cmd.stdin(if opts.stdin.is_some() || opts.keep_stdin { Stdio::piped() } else { Stdio::null() });
    if let Some(cwd) = &opts.cwd {
        cmd.current_dir(PathBuf::from(cwd));
    }
    for k in &opts.strip_env {
        cmd.env_remove(k);
    }
    for (k, v) in &opts.env {
        cmd.env(k, v);
    }
    let mut child = cmd.spawn().map_err(|e| format!("failed to spawn {}: {e}", program.display()))?;
    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let stdin = child.stdin.take();
    let id = opts.id.clone();

    if let Some(mut sin) = stdin {
        if let Some(text) = opts.stdin {
            let _ = sin.write_all(text.as_bytes());
            let _ = sin.flush();
        }
        if opts.keep_stdin {
            registry.stdins.lock().unwrap().insert(id.clone(), Arc::new(Mutex::new(sin)));
        }
        // dropped otherwise → EOF for the child
    }

    let child_arc = Arc::new(Mutex::new(child));
    registry.children.lock().unwrap().insert(id.clone(), child_arc.clone());

    spawn_reader(stdout, "stdout", app.clone(), id.clone());
    spawn_reader(stderr, "stderr", app.clone(), id.clone());

    // waiter thread
    {
        let app = app.clone();
        let id = id.clone();
        let child_arc = child_arc.clone();
        std::thread::spawn(move || {
            let code = loop {
                let status = child_arc.lock().unwrap().try_wait();
                match status {
                    Ok(Some(s)) => break s.code().unwrap_or(-1),
                    Ok(None) => std::thread::sleep(std::time::Duration::from_millis(60)),
                    Err(_) => break -1,
                }
            };
            // small delay so reader threads flush remaining lines first
            std::thread::sleep(std::time::Duration::from_millis(120));
            let _ = app.emit("process-exit", ProcessExit { id: id.clone(), code });
            if let Some(reg) = app.try_state::<ProcessRegistry>() {
                reg.children.lock().unwrap().remove(&id);
                reg.stdins.lock().unwrap().remove(&id);
            }
        });
    }
    Ok(pid)
}

#[tauri::command]
pub fn write_stdin(registry: State<'_, ProcessRegistry>, id: String, data: String) -> Result<(), String> {
    let stdins = registry.stdins.lock().unwrap();
    let sin = stdins.get(&id).ok_or("no stdin for process")?.clone();
    drop(stdins);
    let mut s = sin.lock().unwrap();
    s.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    s.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_stdin(registry: State<'_, ProcessRegistry>, id: String) -> Result<(), String> {
    registry.stdins.lock().unwrap().remove(&id);
    Ok(())
}

#[tauri::command]
pub fn kill_process(registry: State<'_, ProcessRegistry>, id: String) -> Result<bool, String> {
    let child = registry.children.lock().unwrap().get(&id).cloned();
    registry.stdins.lock().unwrap().remove(&id);
    match child {
        Some(c) => {
            let mut c = c.lock().unwrap();
            #[cfg(windows)]
            {
                // kill the whole tree (npm/cmd wrappers spawn children)
                let pid = c.id();
                let _ = command(&PathBuf::from("taskkill")).args(["/PID", &pid.to_string(), "/T", "/F"]).output();
            }
            let _ = c.kill();
            Ok(true)
        }
        None => Ok(false),
    }
}

#[tauri::command]
pub fn list_processes(registry: State<'_, ProcessRegistry>) -> Vec<String> {
    registry.children.lock().unwrap().keys().cloned().collect()
}

#[derive(Serialize)]
pub struct CommandResult {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// One-shot command with captured output (build steps, version checks).
#[tauri::command]
pub async fn run_command(program: String, args: Vec<String>, cwd: Option<String>, timeout_secs: Option<u64>) -> Result<CommandResult, String> {
    let prog = find_tool(&program).ok_or_else(|| format!("program not found: {program}"))?;
    let cwd_path = cwd.map(PathBuf::from);
    let timeout = timeout_secs.unwrap_or(600);
    tokio::task::spawn_blocking(move || {
        let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run_capture(&prog, &arg_refs, cwd_path.as_deref(), timeout).map(|(code, stdout, stderr)| CommandResult { code, stdout, stderr })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn resolve_tool(name: String) -> Option<String> {
    find_tool(&name).map(|p| p.to_string_lossy().to_string())
}

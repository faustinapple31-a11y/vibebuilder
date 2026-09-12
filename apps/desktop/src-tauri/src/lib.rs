pub mod commands;

use commands::process::ProcessRegistry;
use tauri_plugin_sql::{Migration, MigrationKind};

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "initial schema",
        sql: include_str!("../migrations/001_initial.sql"),
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:worldforge.db", migrations()).build())
        .manage(ProcessRegistry::default())
        .invoke_handler(tauri::generate_handler![
            // tools
            commands::tools::detect_tools,
            commands::tools::install_plan,
            commands::tools::install_rojo,
            // process
            commands::process::spawn_process,
            commands::process::write_stdin,
            commands::process::close_stdin,
            commands::process::kill_process,
            commands::process::list_processes,
            commands::process::run_command,
            commands::process::resolve_tool,
            // secrets
            commands::secrets::secret_set,
            commands::secrets::secret_get,
            commands::secrets::secret_exists,
            commands::secrets::secret_delete,
            // studio
            commands::studio::studio_info,
            commands::studio::open_place_in_studio,
            commands::studio::launch_studio,
            commands::studio::install_rojo_plugin,
            commands::studio::list_studio_logs,
            commands::studio::read_studio_log,
            commands::studio::rojo_serve_status,
            // open cloud
            commands::opencloud::oc_request,
            commands::opencloud::oc_has_key,
            // ai providers
            commands::ai::ai_request,
            commands::ai::ai_has_key,
            // capture
            commands::capture::list_windows,
            commands::capture::capture_window,
            // fs
            commands::fs::app_paths,
            commands::fs::fs_read_text,
            commands::fs::fs_write_text,
            commands::fs::fs_write_files,
            commands::fs::fs_read_binary_base64,
            commands::fs::fs_write_binary_base64,
            commands::fs::fs_exists,
            commands::fs::fs_is_dir,
            commands::fs::fs_mkdirp,
            commands::fs::fs_list_dir,
            commands::fs::fs_walk,
            commands::fs::fs_remove,
            commands::fs::fs_copy_file,
            commands::fs::fs_file_size,
        ])
        .run(tauri::generate_context!())
        .expect("error while running WorldForge AI");
}

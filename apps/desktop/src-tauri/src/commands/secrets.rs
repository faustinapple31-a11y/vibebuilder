use keyring::Entry;

const SERVICE: &str = "com.worldforge.ai";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

/// Secrets live in the OS secure storage (Windows Credential Manager, macOS Keychain, Secret Service).
/// They are never written to disk by WorldForge, never logged, and never sent to the webview
/// except through `secret_get` for provider keys the user explicitly manages in Settings.
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
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Returns the secret for internal use (never exposed to the webview).
pub fn secret_internal(key: &str) -> Option<String> {
    entry(key).ok()?.get_password().ok()
}

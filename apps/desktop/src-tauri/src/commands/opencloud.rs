use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::secrets::secret_internal;

pub const OPEN_CLOUD_KEY: &str = "roblox_open_cloud_api_key";
const ALLOWED_HOST: &str = "https://apis.roblox.com/";

#[derive(Deserialize)]
pub struct OcRequest {
    pub method: String,
    pub url: String,
    /// JSON body (serialized by the frontend) — sent as application/json.
    pub json_body: Option<String>,
    /// Path of a local file sent as the raw body (e.g. a .rbxl for place publishing).
    pub body_file: Option<String>,
    pub content_type: Option<String>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    /// multipart/form-data parts (Assets API): text fields and local files.
    pub multipart: Option<Vec<OcPart>>,
}

#[derive(Deserialize)]
pub struct OcPart {
    pub name: String,
    pub text: Option<String>,
    pub file_path: Option<String>,
    pub file_name: Option<String>,
    pub content_type: Option<String>,
}

#[derive(Serialize)]
pub struct OcResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

/// Authenticated proxy for Roblox Open Cloud. The API key is read from the OS keyring
/// and attached here, so it never transits through the webview.
#[tauri::command]
pub async fn oc_request(req: OcRequest) -> Result<OcResponse, String> {
    if !req.url.starts_with(ALLOWED_HOST) {
        return Err("only https://apis.roblox.com/ requests are allowed".into());
    }
    let key = secret_internal(OPEN_CLOUD_KEY).ok_or("No Roblox Open Cloud API key configured (Settings → Roblox)")?;
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(300)).user_agent("WorldForgeAI/0.1").build().map_err(|e| e.to_string())?;
    let method = reqwest::Method::from_bytes(req.method.to_uppercase().as_bytes()).map_err(|e| e.to_string())?;
    let mut builder = client.request(method, &req.url).header("x-api-key", key);
    for (k, v) in &req.headers {
        builder = builder.header(k, v);
    }
    if let Some(parts) = &req.multipart {
        let mut form = reqwest::multipart::Form::new();
        for p in parts {
            if let Some(path) = &p.file_path {
                let bytes = tokio::fs::read(path).await.map_err(|e| format!("cannot read part file {path}: {e}"))?;
                let file_name = p.file_name.clone().unwrap_or_else(|| std::path::Path::new(path).file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_else(|| "file".into()));
                let mut part = reqwest::multipart::Part::bytes(bytes).file_name(file_name);
                if let Some(ct) = &p.content_type {
                    part = part.mime_str(ct).map_err(|e| e.to_string())?;
                }
                form = form.part(p.name.clone(), part);
            } else {
                let mut part = reqwest::multipart::Part::text(p.text.clone().unwrap_or_default());
                if let Some(ct) = &p.content_type {
                    part = part.mime_str(ct).map_err(|e| e.to_string())?;
                }
                form = form.part(p.name.clone(), part);
            }
        }
        builder = builder.multipart(form);
    } else if let Some(path) = &req.body_file {
        let bytes = tokio::fs::read(path).await.map_err(|e| format!("cannot read body file: {e}"))?;
        builder = builder.header("content-type", req.content_type.clone().unwrap_or_else(|| "application/octet-stream".into())).body(bytes);
    } else if let Some(json) = &req.json_body {
        builder = builder.header("content-type", "application/json").body(json.clone());
    }
    let res = builder.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let mut headers = HashMap::new();
    for (k, v) in res.headers() {
        headers.insert(k.to_string(), v.to_str().unwrap_or("").to_string());
    }
    let body = res.text().await.map_err(|e| e.to_string())?;
    Ok(OcResponse { status, body, headers })
}

#[tauri::command]
pub fn oc_has_key() -> bool {
    secret_internal(OPEN_CLOUD_KEY).is_some()
}

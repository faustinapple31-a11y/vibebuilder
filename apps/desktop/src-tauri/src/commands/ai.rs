use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::fs::base64_encode;
use super::secrets::secret_internal;

/// Authenticated proxy for AI asset providers (Gemini images, Meshy 3D, ElevenLabs audio).
/// The API key is read from the OS keyring by provider name and attached here; the webview never sees it.
#[derive(Deserialize)]
pub struct AiRequest {
    pub provider: String,
    pub method: String,
    pub url: String,
    pub json_body: Option<String>,
    /// "text" (default) or "base64" for binary responses (images, audio, glb)
    pub response: Option<String>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
}

#[derive(Serialize)]
pub struct AiResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

fn provider_config(provider: &str) -> Option<(&'static str, &'static [&'static str], &'static str)> {
    // (keyring key, allowed url prefixes, auth header)
    match provider {
        "gemini" => Some(("gemini_image_api_key", &["https://generativelanguage.googleapis.com/"], "x-goog-api-key")),
        "meshy" => Some(("meshy_api_key", &["https://api.meshy.ai/", "https://assets.meshy.ai/"], "authorization")),
        "elevenlabs" => Some(("elevenlabs_api_key", &["https://api.elevenlabs.io/"], "xi-api-key")),
        _ => None,
    }
}

#[tauri::command]
pub async fn ai_request(req: AiRequest) -> Result<AiResponse, String> {
    let (key_name, hosts, header) = provider_config(&req.provider).ok_or_else(|| format!("unknown AI provider {}", req.provider))?;
    if !hosts.iter().any(|h| req.url.starts_with(h)) {
        return Err(format!("url not allowed for provider {}: {}", req.provider, req.url));
    }
    let key = secret_internal(key_name).ok_or_else(|| format!("No API key configured for {} (Settings → Keys)", req.provider))?;
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(600)).user_agent("WorldForgeAI/0.1").build().map_err(|e| e.to_string())?;
    let method = reqwest::Method::from_bytes(req.method.to_uppercase().as_bytes()).map_err(|e| e.to_string())?;
    let mut builder = client.request(method, &req.url);
    builder = if header == "authorization" { builder.header("authorization", format!("Bearer {key}")) } else { builder.header(header, key) };
    for (k, v) in &req.headers {
        builder = builder.header(k, v);
    }
    if let Some(json) = &req.json_body {
        builder = builder.header("content-type", "application/json").body(json.clone());
    }
    let res = builder.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let mut headers = HashMap::new();
    for (k, v) in res.headers() {
        headers.insert(k.to_string(), v.to_str().unwrap_or("").to_string());
    }
    let body = if req.response.as_deref() == Some("base64") && status < 300 {
        let bytes = res.bytes().await.map_err(|e| e.to_string())?;
        base64_encode(&bytes)
    } else {
        res.text().await.map_err(|e| e.to_string())?
    };
    Ok(AiResponse { status, body, headers })
}

#[tauri::command]
pub fn ai_has_key(provider: String) -> bool {
    provider_config(&provider).map(|(k, _, _)| secret_internal(k).is_some()).unwrap_or(false)
}

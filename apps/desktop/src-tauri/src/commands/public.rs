use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::fs::base64_encode;

/// Unauthenticated proxy for public Roblox endpoints the webview cannot reach directly (CORS):
/// Creator Store search / item details, asset thumbnails and thumbnail images.
/// Read-only, allow-listed hosts, no credentials attached.
const ALLOWED: &[&str] = &[
    "https://apis.roblox.com/toolbox-service/v1/",
    "https://thumbnails.roblox.com/v1/",
    "https://tr.rbxcdn.com/",
    "https://t0.rbxcdn.com/",
    "https://t1.rbxcdn.com/",
    "https://t2.rbxcdn.com/",
    "https://t3.rbxcdn.com/",
    "https://t4.rbxcdn.com/",
    "https://t5.rbxcdn.com/",
    "https://t6.rbxcdn.com/",
    "https://t7.rbxcdn.com/",
    "https://catalog.roblox.com/v1/",
];

#[derive(Deserialize)]
pub struct PublicRequest {
    pub url: String,
    /// "text" (default) or "base64" for images
    pub response: Option<String>,
}

#[derive(Serialize)]
pub struct PublicResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

#[tauri::command]
pub async fn public_get(req: PublicRequest) -> Result<PublicResponse, String> {
    if !ALLOWED.iter().any(|h| req.url.starts_with(h)) {
        return Err(format!("url not allowed: {}", req.url));
    }
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(60)).user_agent("WorldForgeAI/0.1").build().map_err(|e| e.to_string())?;
    let res = client.get(&req.url).send().await.map_err(|e| e.to_string())?;
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
    Ok(PublicResponse { status, body, headers })
}

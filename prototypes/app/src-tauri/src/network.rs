//! Essais 3 et 5 — la console s'annonce sur le Wi-Fi, les appareils la
//! trouvent, s'appairent par code et échangent des messages chiffrés.
//! Tout le travail est fait par `lems-core` ; ici on l'expose aux pages.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use lems_core::address;
use lems_core::discovery::{self, Advertiser, FoundConsole};
use lems_core::net::{ConsoleServer, DeviceClient, PeerInfo};
use lems_core::protocol::{Message, Role};

/// Port d'écoute de la console (0 = un port libre au hasard).
const CONSOLE_PORT: u16 = address::DEFAULT_PORT;
/// Au-delà, on considère que la console ne répond pas (pare-feu, autre réseau).
const CONNECT_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Default)]
pub struct NetState {
    console: Mutex<Option<ConsoleServer>>,
    advertiser: Mutex<Option<Advertiser>>,
    console_inbox: Arc<Mutex<Vec<serde_json::Value>>>,
    device: Mutex<Option<Arc<DeviceClient>>>,
    device_inbox: Arc<Mutex<Vec<serde_json::Value>>>,
}

#[derive(serde::Serialize)]
pub struct ConsoleInfo {
    pub port: u16,
    pub code: String,
    pub peers: Vec<PeerInfo>,
    pub advertised: bool,
    pub advertise_error: Option<String>,
    /// Adresses à saisir à la main sur un appareil si la recherche ne trouve rien.
    pub urls: Vec<String>,
}

fn info(server: &ConsoleServer, advertised: bool, advertise_error: Option<String>) -> ConsoleInfo {
    let urls = address::local_addresses().into_iter().map(|ip| format!("ws://{ip}:{}", server.port)).collect();
    ConsoleInfo { port: server.port, code: server.code(), peers: server.peers(), advertised, advertise_error, urls }
}

#[tauri::command]
pub async fn console_start(state: tauri::State<'_, NetState>, name: String) -> Result<ConsoleInfo, String> {
    if let Some(s) = state.console.lock().unwrap().as_ref() {
        return Ok(info(s, state.advertiser.lock().unwrap().is_some(), None));
    }
    let server = match ConsoleServer::start(&name, &format!("0.0.0.0:{CONSOLE_PORT}")).await {
        Ok(s) => s,
        Err(_) => ConsoleServer::start(&name, "0.0.0.0:0").await.map_err(|e| format!("écoute impossible : {e}"))?,
    };
    let (advertised, advertise_error) = match discovery::advertise(&name, server.port) {
        Ok(a) => {
            *state.advertiser.lock().unwrap() = Some(a);
            (true, None)
        }
        Err(e) => (false, Some(e.to_string())),
    };
    let inbox = state.console_inbox.clone();
    let s2 = server.clone();
    tauri::async_runtime::spawn(async move {
        while let Some((peer, m)) = s2.recv().await {
            let mut v = serde_json::to_value(&m).unwrap_or_default();
            v["peer"] = peer.into();
            v["received_at"] = lems_core::now_ms().into();
            inbox.lock().unwrap().push(v);
        }
    });
    let out = info(&server, advertised, advertise_error);
    *state.console.lock().unwrap() = Some(server);
    Ok(out)
}

#[tauri::command]
pub fn console_info(state: tauri::State<'_, NetState>) -> Option<ConsoleInfo> {
    let advertised = state.advertiser.lock().unwrap().is_some();
    state.console.lock().unwrap().as_ref().map(|s| info(s, advertised, None))
}

#[tauri::command]
pub fn console_new_code(state: tauri::State<'_, NetState>) -> Option<String> {
    state.console.lock().unwrap().as_ref().map(|s| s.new_code())
}

/// Diffuse un message (JSON du protocole) à tous les appareils.
#[tauri::command]
pub fn console_broadcast(state: tauri::State<'_, NetState>, message: String) -> Result<(), String> {
    let m = Message::from_json(&message).map_err(|e| format!("message invalide : {e}"))?;
    let g = state.console.lock().unwrap();
    let s = g.as_ref().ok_or("la console n'est pas démarrée")?;
    s.broadcast(m);
    Ok(())
}

#[tauri::command]
pub fn console_messages(state: tauri::State<'_, NetState>) -> Vec<serde_json::Value> {
    std::mem::take(&mut *state.console_inbox.lock().unwrap())
}

#[tauri::command]
pub async fn discover(timeout_ms: u64) -> Result<Vec<FoundConsole>, String> {
    tauri::async_runtime::spawn_blocking(move || discovery::browse(Duration::from_millis(timeout_ms.clamp(500, 15_000))))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

fn parse_role(role: &str) -> Role {
    match role {
        "screen" => Role::Screen,
        "library" => Role::Library,
        _ => Role::Controller,
    }
}

#[tauri::command]
pub async fn device_connect(state: tauri::State<'_, NetState>, url: String, code: String, name: String, role: String) -> Result<String, String> {
    let url = address::normalize_console_url(&url).map_err(|e| format!("Adresse incorrecte : {e}"))?;
    let attempt = DeviceClient::connect(&url, &code, &name, parse_role(&role), 250);
    let client = match tokio::time::timeout(CONNECT_TIMEOUT, attempt).await {
        Ok(Ok(c)) => c,
        Ok(Err(e)) => return Err(address::explain_connect_error(&e.to_string())),
        Err(_) => return Err(address::explain_connect_error(&format!("délai dépassé ({} s) vers {url}", CONNECT_TIMEOUT.as_secs()))),
    };
    let client = Arc::new(client);
    let console_name = client.console_name.clone();
    let inbox = state.device_inbox.clone();
    let c2 = client.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(m) = c2.recv().await {
            let mut v = serde_json::to_value(&m).unwrap_or_default();
            v["received_at"] = lems_core::now_ms().into();
            inbox.lock().unwrap().push(v);
        }
    });
    *state.device.lock().unwrap() = Some(client);
    Ok(console_name)
}

#[tauri::command]
pub fn device_status(state: tauri::State<'_, NetState>) -> Option<serde_json::Value> {
    let g = state.device.lock().unwrap();
    let d = g.as_ref()?;
    Some(serde_json::json!({
        "console": d.console_name,
        "rtt_ms": d.rtt_ms(),
        "offset_ms": d.clock_offset_ms(),
        "samples": d.clock_samples(),
    }))
}

#[tauri::command]
pub fn device_messages(state: tauri::State<'_, NetState>) -> Vec<serde_json::Value> {
    std::mem::take(&mut *state.device_inbox.lock().unwrap())
}

#[tauri::command]
pub async fn device_send(state: tauri::State<'_, NetState>, message: String) -> Result<(), String> {
    let m = Message::from_json(&message).map_err(|e| format!("message invalide : {e}"))?;
    let d = state.device.lock().unwrap().clone().ok_or("pas connecté à une console")?;
    d.send(m).await.map_err(|e| e.to_string())
}

/// Heure de cet appareil, en ms (pour la mire de l'essai 5).
#[tauri::command]
pub fn now_ms() -> i64 {
    lems_core::now_ms()
}

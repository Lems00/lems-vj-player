//! Essai 4 — la sortie vidéo sur un deuxième écran.
//!
//! On liste les écrans, puis on ouvre une fenêtre plein écran sur celui qu'on
//! choisit. Sur Android, Tauri ne voit qu'un écran : l'écran externe
//! demandera un module natif (voir le README des essais).

use tauri::{AppHandle, Manager};
#[cfg(desktop)]
use tauri::{WebviewUrl, WebviewWindowBuilder};

/// Sur Android, une application n'a qu'une fenêtre.
#[cfg(mobile)]
const MOBILE_ONE_WINDOW: &str = "Sur Android, l'application n'a qu'une fenêtre : la sortie sur un deuxième écran demandera un module natif (voir le README des essais).";

#[derive(serde::Serialize)]
pub struct MonitorInfo {
    pub index: usize,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub scale: f64,
    pub is_primary: bool,
}

#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let primary = app.primary_monitor().ok().flatten().map(|m| *m.position());
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    Ok(monitors
        .iter()
        .enumerate()
        .map(|(i, m)| MonitorInfo {
            index: i,
            name: m.name().cloned().unwrap_or_else(|| format!("Écran {}", i + 1)),
            width: m.size().width,
            height: m.size().height,
            x: m.position().x,
            y: m.position().y,
            scale: m.scale_factor(),
            is_primary: primary == Some(*m.position()),
        })
        .collect())
}

/// Ouvre la fenêtre de sortie sur l'écran `index`.
#[tauri::command]
pub async fn open_output(app: AppHandle, index: usize, fullscreen: bool) -> Result<serde_json::Value, String> {
    #[cfg(mobile)]
    {
        let _ = (app, index, fullscreen);
        Err(MOBILE_ONE_WINDOW.into())
    }
    #[cfg(desktop)]
    open_output_desktop(app, index, fullscreen).await
}

#[cfg(desktop)]
async fn open_output_desktop(app: AppHandle, index: usize, fullscreen: bool) -> Result<serde_json::Value, String> {
    use std::time::Duration;
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let m = monitors.get(index).ok_or("écran introuvable")?.clone();
    if let Some(w) = app.get_webview_window("sortie") {
        let _ = w.close();
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    // Écrans d'échelles différentes (Mac 2×, écran externe 1×) : on place la
    // fenêtre en points de l'écran visé, pas en pixels physiques.
    let scale = m.scale_factor();
    let (px, py) = (m.position().x as f64 / scale, m.position().y as f64 / scale);
    let (lw, lh) = (m.size().width as f64 / scale, m.size().height as f64 / scale);
    let started = std::time::Instant::now();
    let window = WebviewWindowBuilder::new(&app, "sortie", WebviewUrl::App("essai4-sortie.html".into()))
        .title("Lems VJ Player — sortie")
        .decorations(false)
        .position(px + 40.0, py + 40.0)
        .inner_size((lw - 80.0).max(320.0), (lh - 80.0).max(240.0))
        .build()
        .map_err(|e| e.to_string())?;
    // On attend que la fenêtre soit posée sur le bon écran avant le plein écran :
    // sinon macOS l'agrandit sur l'écran où elle se trouve encore.
    let target = *m.position();
    let mut placed = false;
    for _ in 0..20 {
        tokio::time::sleep(Duration::from_millis(50)).await;
        if window.current_monitor().ok().flatten().map(|cm| *cm.position() == target).unwrap_or(false) {
            placed = true;
            break;
        }
    }
    if fullscreen {
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
        tokio::time::sleep(Duration::from_millis(900)).await; // animation de macOS
    }
    let landed = window.current_monitor().ok().flatten().map(|cm| *cm.position() == target);
    Ok(serde_json::json!({
        "opened_ms": started.elapsed().as_millis() as u64,
        "placed_before_fullscreen": placed,
        "on_requested_monitor": landed,
        "fullscreen": window.is_fullscreen().unwrap_or(false),
        "target": { "x": target.x, "y": target.y, "scale": scale },
    }))
}

#[tauri::command]
pub fn close_output(app: AppHandle) {
    if let Some(w) = app.get_webview_window("sortie") {
        let _ = w.close();
    }
}

/// Ouvre une page des essais servie en http://localhost (essai 1, variante B).
#[tauri::command]
pub fn open_http_page(app: AppHandle, page: String) -> Result<(), String> {
    #[cfg(mobile)]
    {
        let _ = (app, page);
        Err(MOBILE_ONE_WINDOW.into())
    }
    #[cfg(desktop)]
    open_http_page_desktop(app, page)
}

#[cfg(desktop)]
fn open_http_page_desktop(app: AppHandle, page: String) -> Result<(), String> {
    if !page.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.') {
        return Err("nom de page invalide".into());
    }
    let url = format!("http://localhost:{}/{}", crate::LOCALHOST_PORT, page);
    let label = format!("http-{}", page.replace('.', "-"));
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.close();
    }
    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(url.parse().map_err(|e| format!("{e}"))?))
        .title(format!("{page} — servie en http://localhost"))
        .inner_size(1280.0, 860.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

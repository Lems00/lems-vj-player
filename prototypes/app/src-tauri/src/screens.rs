//! Essai 4 — la sortie vidéo sur un deuxième écran.
//!
//! On liste les écrans, puis on ouvre une fenêtre plein écran sur celui qu'on
//! choisit. Sur Android, Tauri ne voit qu'un écran : l'écran externe
//! demandera un module natif (voir le README des essais).

use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

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
pub fn open_output(app: AppHandle, index: usize, fullscreen: bool) -> Result<serde_json::Value, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let m = monitors.get(index).ok_or("écran introuvable")?;
    if let Some(w) = app.get_webview_window("sortie") {
        let _ = w.close();
    }
    let pos = m.position();
    let started = std::time::Instant::now();
    let window = WebviewWindowBuilder::new(&app, "sortie", WebviewUrl::App("essai4-sortie.html".into()))
        .title("Lems VJ Player — sortie")
        .decorations(false)
        .build()
        .map_err(|e| e.to_string())?;
    window.set_position(PhysicalPosition::new(pos.x + 40, pos.y + 40)).map_err(|e| e.to_string())?;
    if fullscreen {
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
    }
    let landed = window.current_monitor().ok().flatten().map(|cm| cm.position() == pos);
    Ok(serde_json::json!({
        "opened_ms": started.elapsed().as_millis() as u64,
        "on_requested_monitor": landed,
        "fullscreen": window.is_fullscreen().unwrap_or(false),
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

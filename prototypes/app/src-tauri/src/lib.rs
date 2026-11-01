//! Application d'essai de Lems VJ Player : cinq essais pour lever les risques
//! techniques avant d'écrire l'application (étape 2 du plan).
//!
//! 1. Quatre lecteurs YouTube        → page `essai1-youtube.html` (aucun Rust)
//! 2. Deux sorties son séparées      → `audio.rs`
//! 3. Découverte et appairage        → `network.rs` (s'appuie sur `lems-core`)
//! 4. Sortie sur un deuxième écran   → `screens.rs`
//! 5. Écran synchronisé              → `network.rs` + page `essai5-synchro.html`

mod audio;
mod network;
mod screens;

/// Port local sur lequel les pages sont aussi servies en http://localhost,
/// pour comparer le comportement du lecteur YouTube selon l'origine.
pub const LOCALHOST_PORT: u16 = 14870;

#[tauri::command]
fn platform_info() -> serde_json::Value {
    serde_json::json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "app_version": env!("CARGO_PKG_VERSION"),
        "localhost_port": LOCALHOST_PORT,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_localhost::Builder::new(LOCALHOST_PORT).build())
        .setup(|app| {
            // Sur Mac, la fenêtre principale a pour adresse tauri://localhost, et
            // YouTube y refuse ses lecteurs (erreur 153, essai 1 du 1er novembre).
            // On y sert donc les pages en http://localhost, comme la variante B.
            #[cfg(desktop)]
            if cfg!(target_os = "macos") {
                use tauri::Manager;
                if let Some(main) = app.get_webview_window("main") {
                    let url = format!("http://localhost:{LOCALHOST_PORT}/index.html");
                    main.navigate(url.parse().expect("adresse locale valide"))?;
                }
            }
            #[cfg(mobile)]
            let _ = app;
            Ok(())
        })
        .manage(audio::AudioState::default())
        .manage(network::NetState::default())
        .invoke_handler(tauri::generate_handler![
            platform_info,
            audio::audio_devices,
            audio::audio_inventory,
            audio::audio_start,
            audio::audio_stats,
            audio::audio_stop,
            network::console_start,
            network::console_info,
            network::console_new_code,
            network::console_broadcast,
            network::console_messages,
            network::discover,
            network::device_connect,
            network::device_status,
            network::device_messages,
            network::device_send,
            network::now_ms,
            screens::list_monitors,
            screens::open_output,
            screens::close_output,
            screens::open_http_page,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application d'essai");
}

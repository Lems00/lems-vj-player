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

/// Fichier où l'on note le dernier plantage, pour l'afficher au lancement
/// suivant : sur Android, l'utilisateur n'a pas accès aux journaux du système.
static CRASH_FILE: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();

fn install_crash_log() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(path) = CRASH_FILE.get() {
            let thread = std::thread::current().name().unwrap_or("?").to_string();
            let text = format!(
                "version {}, {} {}\nfil « {thread} »\n{info}\n\n{}",
                env!("CARGO_PKG_VERSION"),
                std::env::consts::OS,
                std::env::consts::ARCH,
                std::backtrace::Backtrace::force_capture()
            );
            let _ = std::fs::write(path, text);
        }
        default_hook(info);
    }));
}

/// Rend le dernier plantage noté (et l'efface), ou rien.
#[tauri::command]
fn last_crash() -> Option<String> {
    let path = CRASH_FILE.get()?;
    let text = std::fs::read_to_string(path).ok()?;
    let _ = std::fs::remove_file(path);
    Some(text)
}

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
    install_crash_log();
    tauri::Builder::default()
        .plugin(tauri_plugin_localhost::Builder::new(LOCALHOST_PORT).build())
        .setup(|app| {
            {
                use tauri::Manager;
                if let Ok(dir) = app.path().app_data_dir() {
                    let _ = std::fs::create_dir_all(&dir);
                    let _ = CRASH_FILE.set(dir.join("dernier-plantage.txt"));
                }
            }
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
            Ok(())
        })
        .manage(audio::AudioState::default())
        .manage(network::NetState::default())
        .invoke_handler(tauri::generate_handler![
            platform_info,
            last_crash,
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

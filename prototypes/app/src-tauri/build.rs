// Les commandes de l'application sont déclarées une à une : chaque fenêtre
// (principale, sortie, page servie en http://localhost) les reçoit ensuite
// explicitement dans src-tauri/capabilities/.
const COMMANDS: &[&str] = &[
    "platform_info",
    "audio_devices",
    "audio_inventory",
    "audio_start",
    "audio_stats",
    "audio_stop",
    "console_start",
    "console_info",
    "console_new_code",
    "console_broadcast",
    "console_messages",
    "discover",
    "device_connect",
    "device_status",
    "device_messages",
    "device_send",
    "now_ms",
    "list_monitors",
    "open_output",
    "close_output",
    "open_http_page",
    "last_crash",
];

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)))
        .expect("échec de la préparation de l'application");
}

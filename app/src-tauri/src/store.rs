//! Réglages et bibliothèque : un fichier JSON par clé dans le dossier de
//! données de l'application. Simple et lisible ; une base viendra si besoin.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

fn path_for(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(format!("clé invalide : « {key} »"));
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{key}.json")))
}

#[tauri::command]
pub fn store_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let p = path_for(&app, &key)?;
    match std::fs::read_to_string(&p) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Écrit d'abord dans un fichier temporaire, puis remplace : une coupure en
/// pleine écriture ne laisse jamais un fichier à moitié écrit.
#[tauri::command]
pub fn store_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let p = path_for(&app, &key)?;
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, value).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

//! Lems VJ Player — cœur commun des prototypes.
//!
//! Ce qui est ici est partagé par la console (Mac, Windows) et les appareils
//! (Android contrôleur, écran) : le protocole des messages, l'appairage par
//! code à 6 chiffres, le chiffrement des échanges, l'estimation de l'écart
//! d'horloge et, avec la fonction `net`, le réseau local (WebSocket + mDNS).
//!
//! Code de prototype : il sert à vérifier les risques de l'étape 2 du plan,
//! pas à être livré tel quel.

pub mod channel;
pub mod clock;
pub mod pairing;
pub mod protocol;

#[cfg(feature = "net")]
pub mod discovery;
#[cfg(feature = "net")]
pub mod net;

/// Heure murale en millisecondes depuis l'époque Unix.
pub fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

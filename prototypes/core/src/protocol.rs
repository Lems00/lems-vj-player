//! Les messages échangés entre la console et les appareils, en JSON.

use serde::{Deserialize, Serialize};

/// Version du protocole. Un appareil d'une autre version est refusé poliment.
pub const PROTOCOL_VERSION: u32 = 1;

/// Type de service annoncé sur le réseau local (mDNS / Bonjour).
pub const SERVICE_TYPE: &str = "_lemsvj._tcp.local.";

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Console,
    Controller,
    Screen,
    Library,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Deck {
    A,
    B,
    C,
    D,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Source {
    /// Une vidéo lue par le lecteur YouTube officiel.
    Youtube { video_id: String },
    /// Un fichier de l'utilisateur, identifié par son empreinte.
    File { name: String, sha256: String },
}

/// Messages de l'appairage, envoyés en clair (ils ne révèlent pas le code).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Handshake {
    PairStart { protocol: u32, name: String, role: Role, spake: Vec<u8> },
    PairReply { protocol: u32, name: String, spake: Vec<u8>, confirm: Vec<u8> },
    PairConfirm { confirm: Vec<u8> },
    /// La console a enregistré l'appareil : les échanges chiffrés commencent.
    PairAccepted { peer_id: u64 },
    PairRejected { reason: String },
}

/// Messages applicatifs, toujours chiffrés après l'appairage.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Message {
    /// Mesure d'horloge : t0 = envoi par l'appareil.
    Ping { t0: i64 },
    /// t1 = réception par la console, t2 = réponse de la console.
    Pong { t0: i64, t1: i64, t2: i64 },
    /// L'appareil rapporte ce qu'il mesure, pour l'affichage côté console.
    Report { rtt_ms: f64, offset_ms: f64 },
    Load { deck: Deck, source: Source },
    /// Lire à partir de `position` (secondes) à l'instant `at` (horloge console, ms).
    Play { deck: Deck, position: f64, at: i64 },
    Pause { deck: Deck, position: f64 },
    /// Position réellement jouée par la platine de la console : `position` (s)
    /// à l'instant `at` (horloge console, ms). Les écrans suivent cette lecture
    /// réelle plutôt que l'horloge théorique.
    Position { deck: Deck, position: f64, at: i64 },
    Volume { deck: Deck, value: f32 },
    Crossfader { left: Deck, right: Deck, value: f32 },
    Status { text: String },
    /// Préparer une platine : charger `source` et l'arrêter à `position` (s),
    /// prête à partir sans délai au prochain `Play` (essai 6, playlist).
    Cue { deck: Deck, source: Source, position: f64 },
    /// Réponse d'un appareil : la platine est préparée, en `load_ms` millisecondes.
    Ready { deck: Deck, video_id: String, load_ms: u32 },
    /// Un contrôleur commande le transport d'une platine de la console.
    Transport { deck: Deck, action: TransportAction },
    /// L'état de la console, diffusé aux contrôleurs (deux fois par seconde).
    State(ConsoleSnapshot),
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TransportAction {
    Play,
    Pause,
    Toggle,
    Cue,
}

/// Ce qu'un contrôleur a besoin de voir d'une platine.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct DeckSnapshot {
    pub deck: Deck,
    pub title: Option<String>,
    pub channel: Option<String>,
    pub video_id: Option<String>,
    pub duration: f64,
    pub position: f64,
    pub playing: bool,
    pub bpm: Option<f64>,
    pub volume: f32,
    pub on_air: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct ConsoleSnapshot {
    pub decks: Vec<DeckSnapshot>,
    pub ab: f32,
    pub cd: f32,
    pub master: f32,
    pub program: Option<Deck>,
    /// Heure de la console (ms) au moment de l'instantané.
    pub at: i64,
}

impl Message {
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).expect("un Message se sérialise toujours")
    }
    pub fn from_json(s: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aller_retour_json() {
        let msgs = vec![
            Message::Play { deck: Deck::A, position: 83.4, at: 1_700_000_000_000 },
            Message::Load { deck: Deck::B, source: Source::Youtube { video_id: "dQw4w9WgXcQ".into() } },
            Message::Load { deck: Deck::C, source: Source::File { name: "lagune.mp4".into(), sha256: "ab12".into() } },
            Message::Crossfader { left: Deck::A, right: Deck::B, value: -0.6 },
            Message::Pong { t0: 1, t1: 2, t2: 3 },
            Message::Position { deck: Deck::A, position: 31.25, at: 1_700_000_001_000 },
            Message::Cue { deck: Deck::B, source: Source::Youtube { video_id: "eRsGyueVLvQ".into() }, position: 30.0 },
            Message::Ready { deck: Deck::B, video_id: "eRsGyueVLvQ".into(), load_ms: 1780 },
            Message::Transport { deck: Deck::C, action: TransportAction::Toggle },
            Message::State(ConsoleSnapshot { decks: vec![DeckSnapshot { deck: Deck::A, title: Some("Lagune".into()), channel: None, video_id: Some("aqz-KE-bpKQ".into()), duration: 372.0, position: 83.4, playing: true, bpm: Some(124.0), volume: 0.8, on_air: true }], ab: -0.6, cd: 0.0, master: 0.85, program: Some(Deck::A), at: 1_700_000_002_000 }),
        ];
        for m in msgs {
            let back = Message::from_json(&m.to_json()).unwrap();
            assert_eq!(back, m);
        }
    }

    #[test]
    fn format_lisible_et_stable() {
        let j = Message::Play { deck: Deck::A, position: 1.5, at: 10 }.to_json();
        assert_eq!(j, r#"{"type":"play","deck":"a","position":1.5,"at":10}"#);
        let j = Message::Load { deck: Deck::D, source: Source::Youtube { video_id: "x".into() } }.to_json();
        assert_eq!(j, r#"{"type":"load","deck":"d","source":{"kind":"youtube","video_id":"x"}}"#);
    }

    #[test]
    fn message_inconnu_refuse() {
        assert!(Message::from_json(r#"{"type":"self_destruct"}"#).is_err());
    }
}

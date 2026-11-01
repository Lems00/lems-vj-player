//! Appairage par code à 6 chiffres.
//!
//! Le code n'est jamais envoyé sur le réseau. Les deux côtés en dérivent une
//! clé commune avec SPAKE2 : quelqu'un qui écoute le Wi-Fi n'apprend rien, et
//! un appareil qui se trompe de code ne peut tenter qu'une seule valeur par
//! essai (la console limite le nombre d'essais, puis change de code).

use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use rand::Rng;
use sha2::Sha256;
use spake2::{Ed25519Group, Identity, Password, Spake2};

use crate::channel::SecureChannel;

const ID_DEVICE: &[u8] = b"lems-vj/appareil";
const ID_CONSOLE: &[u8] = b"lems-vj/console";
const CONFIRM_CONSOLE: &[u8] = b"lems-vj confirm console v1";
const CONFIRM_DEVICE: &[u8] = b"lems-vj confirm appareil v1";

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum PairingError {
    #[error("code incorrect")]
    WrongCode,
    #[error("message d'appairage invalide")]
    Invalid,
}

/// Un nouveau code, six chiffres, tiré au hasard.
pub fn generate_code() -> String {
    format!("{:06}", rand::thread_rng().gen_range(0..1_000_000u32))
}

/// Un code est valide s'il fait exactement six chiffres.
pub fn is_valid_code(code: &str) -> bool {
    code.len() == 6 && code.bytes().all(|b| b.is_ascii_digit())
}

fn confirm_tag(key: &[u8], label: &[u8]) -> Vec<u8> {
    let mut m = <HmacSha256 as Mac>::new_from_slice(key).expect("toute longueur de clé convient");
    m.update(label);
    m.finalize().into_bytes().to_vec()
}

fn check_tag(key: &[u8], label: &[u8], tag: &[u8]) -> bool {
    let mut m = <HmacSha256 as Mac>::new_from_slice(key).expect("toute longueur de clé convient");
    m.update(label);
    m.verify_slice(tag).is_ok()
}

/// Deux clés de 32 octets : appareil → console et console → appareil.
fn session_keys(shared: &[u8]) -> ([u8; 32], [u8; 32]) {
    let hk = Hkdf::<Sha256>::new(Some(b"lems-vj session v1"), shared);
    let mut d2c = [0u8; 32];
    let mut c2d = [0u8; 32];
    hk.expand(b"appareil vers console", &mut d2c).expect("32 octets");
    hk.expand(b"console vers appareil", &mut c2d).expect("32 octets");
    (d2c, c2d)
}

/// Côté appareil (téléphone, tablette, écran).
pub struct DevicePairing {
    state: Spake2<Ed25519Group>,
}

impl DevicePairing {
    /// Démarre l'appairage ; renvoie le message à envoyer à la console.
    pub fn start(code: &str) -> (Self, Vec<u8>) {
        let (state, msg) = Spake2::<Ed25519Group>::start_a(
            &Password::new(code.as_bytes()),
            &Identity::new(ID_DEVICE),
            &Identity::new(ID_CONSOLE),
        );
        (Self { state }, msg)
    }

    /// Reçoit la réponse de la console. Vérifie qu'elle connaît le même code,
    /// et renvoie la preuve à lui retourner ainsi que le canal chiffré.
    pub fn finish(self, console_spake: &[u8], console_confirm: &[u8]) -> Result<(Vec<u8>, SecureChannel), PairingError> {
        let shared = self.state.finish(console_spake).map_err(|_| PairingError::Invalid)?;
        if !check_tag(&shared, CONFIRM_CONSOLE, console_confirm) {
            return Err(PairingError::WrongCode);
        }
        let (d2c, c2d) = session_keys(&shared);
        Ok((confirm_tag(&shared, CONFIRM_DEVICE), SecureChannel::new(d2c, c2d)))
    }
}

/// Côté console.
pub struct ConsolePairing {
    shared: Vec<u8>,
}

impl ConsolePairing {
    /// Reçoit le premier message de l'appareil ; renvoie la réponse
    /// (message SPAKE2 et preuve de connaissance du code).
    pub fn respond(code: &str, device_spake: &[u8]) -> Result<(Self, Vec<u8>, Vec<u8>), PairingError> {
        let (state, msg) = Spake2::<Ed25519Group>::start_b(
            &Password::new(code.as_bytes()),
            &Identity::new(ID_DEVICE),
            &Identity::new(ID_CONSOLE),
        );
        let shared = state.finish(device_spake).map_err(|_| PairingError::Invalid)?;
        let confirm = confirm_tag(&shared, CONFIRM_CONSOLE);
        Ok((Self { shared }, msg, confirm))
    }

    /// Vérifie la preuve de l'appareil ; renvoie le canal chiffré.
    pub fn finish(self, device_confirm: &[u8]) -> Result<SecureChannel, PairingError> {
        if !check_tag(&self.shared, CONFIRM_DEVICE, device_confirm) {
            return Err(PairingError::WrongCode);
        }
        let (d2c, c2d) = session_keys(&self.shared);
        Ok(SecureChannel::new(c2d, d2c))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_bien_formes() {
        for _ in 0..1000 {
            let c = generate_code();
            assert!(is_valid_code(&c), "{c}");
        }
        assert!(!is_valid_code("48291"));
        assert!(!is_valid_code("48291a"));
        assert!(!is_valid_code("4829133"));
    }

    #[test]
    fn bon_code_canal_commun() {
        let (dev, m1) = DevicePairing::start("482913");
        let (con, m2, conf_c) = ConsolePairing::respond("482913", &m1).unwrap();
        let (conf_d, mut dev_ch) = dev.finish(&m2, &conf_c).unwrap();
        let mut con_ch = con.finish(&conf_d).unwrap();
        let sealed = dev_ch.seal(b"play a").unwrap();
        assert_eq!(con_ch.open(&sealed).unwrap(), b"play a");
        let sealed = con_ch.seal(b"pong").unwrap();
        assert_eq!(dev_ch.open(&sealed).unwrap(), b"pong");
    }

    #[test]
    fn mauvais_code_detecte_par_l_appareil() {
        let (dev, m1) = DevicePairing::start("111111");
        let (_con, m2, conf_c) = ConsolePairing::respond("482913", &m1).unwrap();
        assert_eq!(dev.finish(&m2, &conf_c).err(), Some(PairingError::WrongCode));
    }

    #[test]
    fn appareil_qui_ment_detecte_par_la_console() {
        let (_dev, m1) = DevicePairing::start("111111");
        let (con, _m2, _conf_c) = ConsolePairing::respond("482913", &m1).unwrap();
        assert_eq!(con.finish(&[0u8; 32]).err(), Some(PairingError::WrongCode));
    }

    #[test]
    fn message_corrompu() {
        assert_eq!(ConsolePairing::respond("482913", b"n'importe quoi").err(), Some(PairingError::Invalid));
    }
}

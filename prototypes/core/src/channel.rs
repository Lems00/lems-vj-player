//! Canal chiffré : ChaCha20-Poly1305, un compteur par sens.
//!
//! Chaque trame commence par son numéro (8 octets). Une trame rejouée, en
//! retard ou modifiée est refusée.

use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ChannelError {
    #[error("trame trop courte")]
    TooShort,
    #[error("trame rejouée ou en retard")]
    Replay,
    #[error("trame illisible ou modifiée")]
    Corrupt,
    #[error("compteur épuisé")]
    Exhausted,
}

pub struct SecureChannel {
    send: ChaCha20Poly1305,
    recv: ChaCha20Poly1305,
    send_counter: u64,
    recv_next: u64,
}

fn nonce(counter: u64) -> [u8; 12] {
    let mut n = [0u8; 12];
    n[4..].copy_from_slice(&counter.to_be_bytes());
    n
}

impl SecureChannel {
    pub fn new(send_key: [u8; 32], recv_key: [u8; 32]) -> Self {
        Self {
            send: ChaCha20Poly1305::new(Key::from_slice(&send_key)),
            recv: ChaCha20Poly1305::new(Key::from_slice(&recv_key)),
            send_counter: 0,
            recv_next: 0,
        }
    }

    pub fn seal(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, ChannelError> {
        let c = self.send_counter;
        self.send_counter = c.checked_add(1).ok_or(ChannelError::Exhausted)?;
        let ct = self.send.encrypt(Nonce::from_slice(&nonce(c)), plaintext).map_err(|_| ChannelError::Corrupt)?;
        let mut out = Vec::with_capacity(8 + ct.len());
        out.extend_from_slice(&c.to_be_bytes());
        out.extend_from_slice(&ct);
        Ok(out)
    }

    pub fn open(&mut self, frame: &[u8]) -> Result<Vec<u8>, ChannelError> {
        if frame.len() < 8 + 16 {
            return Err(ChannelError::TooShort);
        }
        let c = u64::from_be_bytes(frame[..8].try_into().unwrap());
        if c < self.recv_next {
            return Err(ChannelError::Replay);
        }
        let pt = self.recv.decrypt(Nonce::from_slice(&nonce(c)), &frame[8..]).map_err(|_| ChannelError::Corrupt)?;
        self.recv_next = c + 1;
        Ok(pt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pair() -> (SecureChannel, SecureChannel) {
        let (a, b) = ([7u8; 32], [9u8; 32]);
        (SecureChannel::new(a, b), SecureChannel::new(b, a))
    }

    #[test]
    fn aller_retour() {
        let (mut x, mut y) = pair();
        for i in 0..50u32 {
            let f = x.seal(format!("message {i}").as_bytes()).unwrap();
            assert_eq!(y.open(&f).unwrap(), format!("message {i}").as_bytes());
        }
    }

    #[test]
    fn rejeu_refuse() {
        let (mut x, mut y) = pair();
        let f = x.seal(b"volume a 0.8").unwrap();
        y.open(&f).unwrap();
        assert_eq!(y.open(&f).err(), Some(ChannelError::Replay));
    }

    #[test]
    fn modification_refusee() {
        let (mut x, mut y) = pair();
        let mut f = x.seal(b"crossfader 0.2").unwrap();
        let last = f.len() - 1;
        f[last] ^= 1;
        assert_eq!(y.open(&f).err(), Some(ChannelError::Corrupt));
    }

    #[test]
    fn mauvaise_cle_refusee() {
        let (mut x, _) = pair();
        let mut z = SecureChannel::new([1u8; 32], [2u8; 32]);
        let f = x.seal(b"secret").unwrap();
        assert_eq!(z.open(&f).err(), Some(ChannelError::Corrupt));
    }
}

//! Écart d'horloge entre un appareil et la console (méthode NTP).
//!
//! L'appareil envoie t0, la console note t1 à la réception et t2 à la
//! réponse, l'appareil note t3 au retour. On garde les mesures au plus court
//! aller-retour : ce sont les plus fiables sur un Wi-Fi chargé.

use std::collections::VecDeque;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ClockSample {
    /// Horloge console − horloge appareil, en ms.
    pub offset_ms: f64,
    /// Aller-retour réseau, hors temps de traitement console, en ms.
    pub rtt_ms: f64,
}

pub fn sample(t0: i64, t1: i64, t2: i64, t3: i64) -> ClockSample {
    let offset = ((t1 - t0) + (t2 - t3)) as f64 / 2.0;
    let rtt = ((t3 - t0) - (t2 - t1)) as f64;
    ClockSample { offset_ms: offset, rtt_ms: rtt.max(0.0) }
}

pub struct ClockSync {
    samples: VecDeque<ClockSample>,
    capacity: usize,
}

impl Default for ClockSync {
    fn default() -> Self {
        Self::new(32)
    }
}

impl ClockSync {
    pub fn new(capacity: usize) -> Self {
        Self { samples: VecDeque::with_capacity(capacity), capacity: capacity.max(1) }
    }

    pub fn push(&mut self, s: ClockSample) {
        if self.samples.len() == self.capacity {
            self.samples.pop_front();
        }
        self.samples.push_back(s);
    }

    pub fn len(&self) -> usize {
        self.samples.len()
    }

    pub fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }

    /// Moyenne des écarts des trois mesures au plus court aller-retour.
    pub fn offset_ms(&self) -> Option<f64> {
        let mut v: Vec<_> = self.samples.iter().copied().collect();
        if v.is_empty() {
            return None;
        }
        v.sort_by(|a, b| a.rtt_ms.partial_cmp(&b.rtt_ms).unwrap());
        let best = &v[..v.len().min(3)];
        Some(best.iter().map(|s| s.offset_ms).sum::<f64>() / best.len() as f64)
    }

    /// Plus court aller-retour observé.
    pub fn best_rtt_ms(&self) -> Option<f64> {
        self.samples.iter().map(|s| s.rtt_ms).fold(None, |m, x| Some(m.map_or(x, |m: f64| m.min(x))))
    }

    /// Convertit une heure de la console en heure locale.
    pub fn to_local(&self, console_ms: i64) -> Option<i64> {
        self.offset_ms().map(|o| console_ms - o.round() as i64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Simule un échange : la console a `skew` ms d'avance, aller `up` ms,
    /// retour `down` ms, traitement 1 ms.
    fn exchange(device_now: i64, skew: i64, up: i64, down: i64) -> ClockSample {
        let t0 = device_now;
        let t1 = t0 + up + skew;
        let t2 = t1 + 1;
        let t3 = t2 - skew + down;
        sample(t0, t1, t2, t3)
    }

    #[test]
    fn reseau_symetrique_exact() {
        let s = exchange(1_000, 1_234, 5, 5);
        assert_eq!(s.offset_ms, 1_234.0);
        assert_eq!(s.rtt_ms, 10.0);
    }

    #[test]
    fn asymetrie_bornee_par_la_moitie_de_l_aller_retour() {
        let s = exchange(1_000, -500, 30, 4);
        assert!((s.offset_ms - (-500.0)).abs() <= s.rtt_ms / 2.0);
    }

    #[test]
    fn filtre_les_mesures_bruitees() {
        let mut c = ClockSync::new(16);
        // Wi-Fi chargé : la plupart des mesures ont un aller lent et inégal.
        let delays = [(80, 6), (5, 5), (120, 9), (4, 6), (60, 3), (6, 4), (200, 10), (95, 7)];
        for (i, (up, down)) in delays.iter().enumerate() {
            c.push(exchange(10_000 + i as i64 * 500, 2_000, *up, *down));
        }
        let o = c.offset_ms().unwrap();
        assert!((o - 2_000.0).abs() <= 2.0, "écart estimé {o}");
        assert_eq!(c.best_rtt_ms(), Some(10.0));
        assert_eq!(c.to_local(52_000), Some(50_000));
    }

    #[test]
    fn capacite_respectee() {
        let mut c = ClockSync::new(4);
        for i in 0..10 {
            c.push(sample(i, i, i, i));
        }
        assert_eq!(c.len(), 4);
    }
}

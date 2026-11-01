//! Essai 2 — deux sorties son séparées (enceintes et casque).
//!
//! On ouvre deux flux de sortie en même temps, sur deux périphériques (ou deux
//! fois le même pour comparer). Chacun joue un son d'essai : 440 Hz sur la
//! sortie principale, 880 Hz sur le casque. On mesure ce que le système
//! accorde réellement (fréquence, taille de tampon) et la latence estimée.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct DeviceInfo {
    pub name: String,
    pub is_default: bool,
    pub max_channels: u16,
    pub sample_rates: Vec<u32>,
    pub buffer_min: Option<u32>,
    pub buffer_max: Option<u32>,
    /// Réglages illisibles (défaut connu de cpal sur les sorties intégrées du Mac) :
    /// l'essai ouvrira la sortie en 48 kHz stéréo.
    pub config_unknown: bool,
}

#[derive(Serialize, Clone, Default)]
pub struct StreamReport {
    pub device: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub requested_buffer: u32,
    pub buffer_mode: String,
    pub tone_hz: f32,
    pub error: Option<String>,
}

#[derive(Default)]
struct Counters {
    callbacks: AtomicU64,
    frames: AtomicU64,
    /// Dernière latence estimée par le système, en microsecondes.
    latency_us: AtomicU64,
    max_latency_us: AtomicU64,
    errors: AtomicU64,
}

#[derive(Serialize)]
pub struct StreamStats {
    pub callbacks: u64,
    pub frames: u64,
    pub latency_ms: Option<f64>,
    pub max_latency_ms: Option<f64>,
    pub errors: u64,
}

struct Running {
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
    main: Arc<Counters>,
    phones: Arc<Counters>,
    started: std::time::Instant,
}

#[derive(Default)]
pub struct AudioState(Mutex<Option<Running>>);

fn find_device(host: &cpal::Host, name: &str) -> Option<cpal::Device> {
    if name.is_empty() {
        return host.default_output_device();
    }
    // On cherche parmi tous les appareils : les sorties intégrées du Mac dont
    // les réglages sont illisibles n'apparaissent pas dans output_devices().
    // Un même nom peut désigner l'entrée et la sortie (AirPods) : on écarte
    // les appareils qui n'ont certainement aucune sortie.
    let mut unreadable = None;
    for d in host.devices().ok()? {
        if d.name().map(|n| n != name).unwrap_or(true) {
            continue;
        }
        match d.supported_output_configs() {
            Ok(mut c) => {
                if c.next().is_some() {
                    return Some(d);
                }
            }
            Err(_) => {
                if unreadable.is_none() {
                    unreadable = Some(d);
                }
            }
        }
    }
    unreadable
}

/// Ce que le système dit d'un appareil son, erreurs comprises (diagnostic).
#[derive(Serialize, Clone)]
pub struct InventoryEntry {
    pub name: String,
    pub default_output: bool,
    pub output: String,
    pub input: String,
}

fn describe(r: Result<usize, String>) -> String {
    match r {
        Ok(0) => "aucune configuration".into(),
        Ok(n) => format!("{n} configuration(s)"),
        Err(e) => format!("erreur : {e}"),
    }
}

/// Tous les appareils vus par le système, avec la raison s'ils sont écartés.
#[tauri::command]
pub fn audio_inventory() -> Result<Vec<InventoryEntry>, String> {
    let host = cpal::default_host();
    let default_name = host.default_output_device().and_then(|d| d.name().ok()).unwrap_or_default();
    let mut out = vec![];
    for d in host.devices().map_err(|e| e.to_string())? {
        let name = d.name().unwrap_or_else(|e| format!("? ({e})"));
        let output = describe(d.supported_output_configs().map(|c| c.count()).map_err(|e| e.to_string()));
        let input = describe(d.supported_input_configs().map(|c| c.count()).map_err(|e| e.to_string()));
        out.push(InventoryEntry { default_output: name == default_name, name, output, input });
    }
    Ok(out)
}

#[tauri::command]
pub fn audio_devices() -> Result<Vec<DeviceInfo>, String> {
    let host = cpal::default_host();
    let default_name = host.default_output_device().and_then(|d| d.name().ok()).unwrap_or_default();
    let mut out = vec![];
    // On parcourt tous les appareils, pas seulement ceux que la bibliothèque
    // classe en sortie : un appareil dont la liste de configurations échoue
    // mais qui a une configuration par défaut reste proposé.
    for d in host.devices().map_err(|e| e.to_string())? {
        let name = d.name().unwrap_or_else(|_| "?".into());
        let mut rates = vec![];
        let mut max_ch = 0;
        let (mut bmin, mut bmax) = (None, None);
        let mut usable = false;
        let mut unreadable = false;
        let listed = d.supported_output_configs();
        if listed.is_err() {
            unreadable = true;
        }
        if let Ok(cfgs) = listed {
            for c in cfgs {
                usable = true;
                max_ch = max_ch.max(c.channels());
                for r in [44_100u32, 48_000, 88_200, 96_000] {
                    if c.min_sample_rate().0 <= r && r <= c.max_sample_rate().0 && !rates.contains(&r) {
                        rates.push(r);
                    }
                }
                if let cpal::SupportedBufferSize::Range { min, max } = c.buffer_size() {
                    bmin = Some(bmin.map_or(*min, |m: u32| m.min(*min)));
                    bmax = Some(bmax.map_or(*max, |m: u32| m.max(*max)));
                }
            }
        }
        if let Ok(c) = d.default_output_config() {
            usable = true;
            max_ch = max_ch.max(c.channels());
            if !rates.contains(&c.sample_rate().0) {
                rates.push(c.sample_rate().0);
            }
        }
        let config_unknown = !usable && unreadable;
        if config_unknown {
            // Sur Mac, une sortie intégrée qui n'est pas la sortie par défaut
            // renvoie « Invalid property value » : on la propose quand même.
            max_ch = 2;
            rates = vec![FALLBACK_RATE];
        } else if !usable {
            continue;
        }
        rates.sort();
        out.push(DeviceInfo { is_default: name == default_name, name, max_channels: max_ch, sample_rates: rates, buffer_min: bmin, buffer_max: bmax, config_unknown });
    }
    Ok(out)
}

/// Réglages de repli quand le système ne dit rien d'une sortie.
const FALLBACK_RATE: u32 = 48_000;

fn build_stream(device: &cpal::Device, buffer: u32, tone_hz: f32, counters: Arc<Counters>) -> Result<(cpal::Stream, StreamReport), String> {
    let name = device.name().unwrap_or_else(|_| "?".into());
    let (sample_rate, channels, format, fixed_ok, fallback) = match device.default_output_config() {
        Ok(supported) => {
            let fixed_ok = matches!(supported.buffer_size(), cpal::SupportedBufferSize::Range { min, max } if *min <= buffer && buffer <= *max);
            (supported.sample_rate().0, supported.channels(), supported.sample_format(), fixed_ok, false)
        }
        // Réglages illisibles : on tente 48 kHz stéréo en flottant, taille de tampon libre.
        Err(_) => (FALLBACK_RATE, 2, cpal::SampleFormat::F32, false, true),
    };
    let config = cpal::StreamConfig {
        channels,
        sample_rate: cpal::SampleRate(sample_rate),
        buffer_size: if fixed_ok { cpal::BufferSize::Fixed(buffer) } else { cpal::BufferSize::Default },
    };
    let mut phase = 0f32;
    let step = tone_hz / sample_rate as f32;
    let ch = channels as usize;
    let c2 = counters.clone();
    let err_counters = counters.clone();
    let stream = match format {
        cpal::SampleFormat::F32 => device.build_output_stream(
            &config,
            move |data: &mut [f32], info: &cpal::OutputCallbackInfo| {
                for frame in data.chunks_mut(ch) {
                    let v = (phase * std::f32::consts::TAU).sin() * 0.25;
                    phase = (phase + step).fract();
                    for s in frame.iter_mut() {
                        *s = v;
                    }
                }
                record(&c2, data.len() / ch, info);
            },
            move |_e| {
                err_counters.errors.fetch_add(1, Ordering::Relaxed);
            },
            None,
        ),
        cpal::SampleFormat::I16 => device.build_output_stream(
            &config,
            move |data: &mut [i16], info: &cpal::OutputCallbackInfo| {
                for frame in data.chunks_mut(ch) {
                    let v = ((phase * std::f32::consts::TAU).sin() * 0.25 * i16::MAX as f32) as i16;
                    phase = (phase + step).fract();
                    for s in frame.iter_mut() {
                        *s = v;
                    }
                }
                record(&c2, data.len() / ch, info);
            },
            move |_e| {
                err_counters.errors.fetch_add(1, Ordering::Relaxed);
            },
            None,
        ),
        other => return Err(format!("{name} : format {other:?} non géré par l'essai")),
    }
    .map_err(|e| format!("{name} : {e}"))?;
    stream.play().map_err(|e| format!("{name} : {e}"))?;
    let report = StreamReport {
        device: name,
        sample_rate,
        channels,
        requested_buffer: buffer,
        buffer_mode: if fallback {
            "réglages illisibles : 48 kHz stéréo, tampon du système".into()
        } else if fixed_ok {
            format!("fixe {buffer}")
        } else {
            "par défaut (taille demandée refusée)".into()
        },
        tone_hz,
        error: None,
    };
    Ok((stream, report))
}

fn record(c: &Counters, frames: usize, info: &cpal::OutputCallbackInfo) {
    c.callbacks.fetch_add(1, Ordering::Relaxed);
    c.frames.fetch_add(frames as u64, Ordering::Relaxed);
    let ts = info.timestamp();
    if let Some(d) = ts.playback.duration_since(&ts.callback) {
        let us = d.as_micros() as u64;
        c.latency_us.store(us, Ordering::Relaxed);
        c.max_latency_us.fetch_max(us, Ordering::Relaxed);
    }
}

/// Démarre les deux sorties. `main` et `phones` sont des noms de
/// périphériques (vide = sortie par défaut).
#[tauri::command]
pub fn audio_start(state: tauri::State<'_, AudioState>, main: String, phones: String, buffer: u32) -> Result<Vec<StreamReport>, String> {
    audio_stop(state.clone());
    let stop = Arc::new(AtomicBool::new(false));
    let (c_main, c_phones) = (Arc::new(Counters::default()), Arc::new(Counters::default()));
    let (tx, rx) = mpsc::channel();
    let (stop2, cm, cp) = (stop.clone(), c_main.clone(), c_phones.clone());
    // Les flux cpal ne changent pas de fil sur certains systèmes :
    // on les crée et on les garde dans un fil dédié.
    let handle = thread::spawn(move || {
        let host = cpal::default_host();
        let mut streams = vec![];
        let mut reports = vec![];
        for (name, hz, counters) in [(main, 440.0, cm), (phones, 880.0, cp)] {
            match find_device(&host, &name) {
                Some(dev) => match build_stream(&dev, buffer, hz, counters) {
                    Ok((s, r)) => {
                        streams.push(s);
                        reports.push(r);
                    }
                    Err(e) => reports.push(StreamReport { device: name, tone_hz: hz, error: Some(e), ..Default::default() }),
                },
                None => reports.push(StreamReport { device: name, tone_hz: hz, error: Some("périphérique introuvable".into()), ..Default::default() }),
            }
        }
        let _ = tx.send(reports);
        while !stop2.load(Ordering::Relaxed) {
            thread::sleep(std::time::Duration::from_millis(50));
        }
        drop(streams);
    });
    let reports = rx.recv().map_err(|_| "le fil audio s'est arrêté".to_string())?;
    *state.0.lock().unwrap() = Some(Running { stop, thread: Some(handle), main: c_main, phones: c_phones, started: std::time::Instant::now() });
    Ok(reports)
}

fn stats(c: &Counters) -> StreamStats {
    let l = c.latency_us.load(Ordering::Relaxed);
    let m = c.max_latency_us.load(Ordering::Relaxed);
    StreamStats {
        callbacks: c.callbacks.load(Ordering::Relaxed),
        frames: c.frames.load(Ordering::Relaxed),
        latency_ms: (l > 0).then(|| l as f64 / 1000.0),
        max_latency_ms: (m > 0).then(|| m as f64 / 1000.0),
        errors: c.errors.load(Ordering::Relaxed),
    }
}

#[tauri::command]
pub fn audio_stats(state: tauri::State<'_, AudioState>) -> Option<serde_json::Value> {
    let g = state.0.lock().unwrap();
    let r = g.as_ref()?;
    Some(serde_json::json!({
        "seconds": r.started.elapsed().as_secs_f64(),
        "main": stats(&r.main),
        "phones": stats(&r.phones),
    }))
}

#[tauri::command]
pub fn audio_stop(state: tauri::State<'_, AudioState>) {
    let running = state.0.lock().unwrap().take();
    if let Some(mut r) = running {
        r.stop.store(true, Ordering::Relaxed);
        if let Some(t) = r.thread.take() {
            let _ = t.join();
        }
    }
}

//! Réseau local : la console écoute en WebSocket, les appareils s'y connectent.
//!
//! Déroulé d'une connexion :
//! 1. appairage en clair (messages `Handshake`, le code n'y figure pas) ;
//! 2. ensuite, uniquement des trames binaires chiffrées (messages `Message`).
//!
//! La console accepte trois mauvais codes au plus, puis en tire un nouveau.

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::tungstenite::Message as WsMsg;

use crate::channel::SecureChannel;
use crate::clock::{self, ClockSync};
use crate::pairing::{generate_code, ConsolePairing, DevicePairing, PairingError};
use crate::protocol::{Handshake, Message, Role, PROTOCOL_VERSION};
use crate::now_ms;

/// Nombre de mauvais codes acceptés avant de changer de code.
pub const MAX_WRONG_CODES: u32 = 3;

#[derive(Debug, thiserror::Error)]
pub enum NetError {
    #[error("connexion impossible : {0}")]
    Connect(String),
    #[error("code incorrect")]
    WrongCode,
    #[error("refusé par la console : {0}")]
    Rejected(String),
    #[error("échange interrompu")]
    Closed,
    #[error("message inattendu")]
    Protocol,
}

impl From<PairingError> for NetError {
    fn from(e: PairingError) -> Self {
        match e {
            PairingError::WrongCode => NetError::WrongCode,
            PairingError::Invalid => NetError::Protocol,
        }
    }
}

/// Ce que la console sait d'un appareil connecté.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PeerInfo {
    pub id: u64,
    pub name: String,
    pub role: Role,
    pub addr: String,
    pub connected: bool,
    pub rtt_ms: Option<f64>,
    pub offset_ms: Option<f64>,
}

struct ConsoleState {
    name: String,
    code: String,
    wrong_codes: u32,
    peers: Vec<PeerInfo>,
    next_id: u64,
}

/// La console : elle écoute, appaire, et diffuse ses commandes à tous.
#[derive(Clone)]
pub struct ConsoleServer {
    pub port: u16,
    state: Arc<Mutex<ConsoleState>>,
    out: broadcast::Sender<Message>,
    inbox: Arc<tokio::sync::Mutex<mpsc::Receiver<(u64, Message)>>>,
}

impl ConsoleServer {
    /// Démarre l'écoute sur `bind` (par exemple "0.0.0.0:0" pour un port libre).
    pub async fn start(name: &str, bind: &str) -> std::io::Result<Self> {
        let listener = TcpListener::bind(bind).await?;
        let port = listener.local_addr()?.port();
        let state = Arc::new(Mutex::new(ConsoleState { name: name.to_string(), code: generate_code(), wrong_codes: 0, peers: vec![], next_id: 1 }));
        let (out, _) = broadcast::channel(256);
        let (in_tx, in_rx) = mpsc::channel(256);
        let server = Self { port, state: state.clone(), out: out.clone(), inbox: Arc::new(tokio::sync::Mutex::new(in_rx)) };
        tokio::spawn(async move {
            while let Ok((stream, addr)) = listener.accept().await {
                let (state, out, in_tx) = (state.clone(), out.clone(), in_tx.clone());
                tokio::spawn(async move {
                    let _ = handle_device(stream, addr, state, out, in_tx).await;
                });
            }
        });
        Ok(server)
    }

    pub fn code(&self) -> String {
        self.state.lock().unwrap().code.clone()
    }

    pub fn new_code(&self) -> String {
        let mut s = self.state.lock().unwrap();
        s.code = generate_code();
        s.wrong_codes = 0;
        s.code.clone()
    }

    pub fn peers(&self) -> Vec<PeerInfo> {
        self.state.lock().unwrap().peers.clone()
    }

    /// Envoie un message à tous les appareils connectés.
    pub fn broadcast(&self, m: Message) {
        let _ = self.out.send(m);
    }

    /// Prochain message reçu d'un appareil (hors mesures d'horloge).
    pub async fn recv(&self) -> Option<(u64, Message)> {
        self.inbox.lock().await.recv().await
    }
}

async fn handle_device(
    stream: TcpStream,
    addr: SocketAddr,
    state: Arc<Mutex<ConsoleState>>,
    out: broadcast::Sender<Message>,
    in_tx: mpsc::Sender<(u64, Message)>,
) -> Result<(), NetError> {
    let mut ws = tokio_tungstenite::accept_async(stream).await.map_err(|e| NetError::Connect(e.to_string()))?;

    // 1. Appairage.
    let first = next_text(&mut ws).await?;
    let (dev_name, role, spake) = match serde_json::from_str::<Handshake>(&first).map_err(|_| NetError::Protocol)? {
        Handshake::PairStart { protocol, name, role, spake } => {
            if protocol != PROTOCOL_VERSION {
                let r = Handshake::PairRejected { reason: format!("version de protocole {protocol}, la console parle la version {PROTOCOL_VERSION}") };
                let _ = ws.send(WsMsg::Text(serde_json::to_string(&r).unwrap())).await;
                return Err(NetError::Protocol);
            }
            (name, role, spake)
        }
        _ => return Err(NetError::Protocol),
    };
    let (code, console_name) = {
        let s = state.lock().unwrap();
        (s.code.clone(), s.name.clone())
    };
    let (pairing, reply, confirm) = ConsolePairing::respond(&code, &spake)?;
    let msg = Handshake::PairReply { protocol: PROTOCOL_VERSION, name: console_name, spake: reply, confirm };
    ws.send(WsMsg::Text(serde_json::to_string(&msg).unwrap())).await.map_err(|_| NetError::Closed)?;
    let answer = next_text(&mut ws).await.ok().and_then(|t| serde_json::from_str::<Handshake>(&t).ok());
    let device_confirm = match answer {
        Some(Handshake::PairConfirm { confirm }) => confirm,
        _ => {
            // L'appareil a abandonné : sans doute un mauvais code de son côté.
            count_wrong_code(&state);
            return Err(NetError::WrongCode);
        }
    };
    let mut channel = match pairing.finish(&device_confirm) {
        Ok(c) => c,
        Err(_) => {
            count_wrong_code(&state);
            let r = Handshake::PairRejected { reason: "code incorrect".into() };
            let _ = ws.send(WsMsg::Text(serde_json::to_string(&r).unwrap())).await;
            return Err(NetError::WrongCode);
        }
    };

    let id = {
        let mut s = state.lock().unwrap();
        let id = s.next_id;
        s.next_id += 1;
        s.peers.push(PeerInfo { id, name: dev_name, role, addr: addr.to_string(), connected: true, rtt_ms: None, offset_ms: None });
        // Un code ne sert qu'une fois.
        s.code = generate_code();
        s.wrong_codes = 0;
        id
    };
    let accepted = Handshake::PairAccepted { peer_id: id };
    if ws.send(WsMsg::Text(serde_json::to_string(&accepted).unwrap())).await.is_err() {
        mark_disconnected(&state, id);
        return Err(NetError::Closed);
    }

    // 2. Échanges chiffrés.
    let mut rx_out = out.subscribe();
    let result: Result<(), NetError> = loop {
        tokio::select! {
            frame = ws.next() => {
                let data = match frame {
                    Some(Ok(WsMsg::Binary(b))) => b,
                    Some(Ok(WsMsg::Ping(_))) | Some(Ok(WsMsg::Pong(_))) => continue,
                    _ => break Err(NetError::Closed),
                };
                let t1 = now_ms();
                let plain = match channel.open(&data) { Ok(p) => p, Err(_) => break Err(NetError::Protocol) };
                let m = match serde_json::from_slice::<Message>(&plain) { Ok(m) => m, Err(_) => continue };
                match m {
                    Message::Ping { t0 } => {
                        let pong = Message::Pong { t0, t1, t2: now_ms() };
                        if send_sealed(&mut ws, &mut channel, &pong).await.is_err() { break Err(NetError::Closed); }
                    }
                    Message::Report { rtt_ms, offset_ms } => {
                        let mut s = state.lock().unwrap();
                        if let Some(p) = s.peers.iter_mut().find(|p| p.id == id) { p.rtt_ms = Some(rtt_ms); p.offset_ms = Some(offset_ms); }
                    }
                    other => { let _ = in_tx.send((id, other)).await; }
                }
            }
            m = rx_out.recv() => {
                match m {
                    Ok(m) => if send_sealed(&mut ws, &mut channel, &m).await.is_err() { break Err(NetError::Closed); },
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break Ok(()),
                }
            }
        }
    };
    mark_disconnected(&state, id);
    result
}

fn mark_disconnected(state: &Arc<Mutex<ConsoleState>>, id: u64) {
    let mut s = state.lock().unwrap();
    if let Some(p) = s.peers.iter_mut().find(|p| p.id == id) {
        p.connected = false;
    }
}

fn count_wrong_code(state: &Arc<Mutex<ConsoleState>>) {
    let mut s = state.lock().unwrap();
    s.wrong_codes += 1;
    if s.wrong_codes >= MAX_WRONG_CODES {
        s.code = generate_code();
        s.wrong_codes = 0;
    }
}

async fn next_text<S>(ws: &mut tokio_tungstenite::WebSocketStream<S>) -> Result<String, NetError>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    loop {
        match tokio::time::timeout(Duration::from_secs(10), ws.next()).await {
            Ok(Some(Ok(WsMsg::Text(t)))) => return Ok(t),
            Ok(Some(Ok(WsMsg::Ping(_)))) | Ok(Some(Ok(WsMsg::Pong(_)))) => continue,
            _ => return Err(NetError::Closed),
        }
    }
}

async fn send_sealed<S>(ws: &mut tokio_tungstenite::WebSocketStream<S>, ch: &mut SecureChannel, m: &Message) -> Result<(), NetError>
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
{
    let frame = ch.seal(m.to_json().as_bytes()).map_err(|_| NetError::Closed)?;
    ws.send(WsMsg::Binary(frame)).await.map_err(|_| NetError::Closed)
}

/// Un appareil connecté à la console.
pub struct DeviceClient {
    pub console_name: String,
    tx: mpsc::Sender<Message>,
    rx: tokio::sync::Mutex<mpsc::Receiver<Message>>,
    clock: Arc<Mutex<ClockSync>>,
}

impl DeviceClient {
    /// Se connecte à `url` (ws://adresse:port), s'appaire avec `code`, puis
    /// mesure l'horloge toutes les `ping_every` millisecondes.
    pub async fn connect(url: &str, code: &str, name: &str, role: Role, ping_every: u64) -> Result<Self, NetError> {
        let (mut ws, _) = tokio_tungstenite::connect_async(url).await.map_err(|e| NetError::Connect(e.to_string()))?;
        let (pairing, spake) = DevicePairing::start(code);
        let start = Handshake::PairStart { protocol: PROTOCOL_VERSION, name: name.to_string(), role, spake };
        ws.send(WsMsg::Text(serde_json::to_string(&start).unwrap())).await.map_err(|_| NetError::Closed)?;
        let (console_name, mut channel) = match serde_json::from_str::<Handshake>(&next_text(&mut ws).await?).map_err(|_| NetError::Protocol)? {
            Handshake::PairReply { name, spake, confirm, .. } => {
                let (my_confirm, ch) = match pairing.finish(&spake, &confirm) {
                    Ok(x) => x,
                    Err(e) => {
                        let _ = ws.close(None).await;
                        return Err(e.into());
                    }
                };
                ws.send(WsMsg::Text(serde_json::to_string(&Handshake::PairConfirm { confirm: my_confirm }).unwrap())).await.map_err(|_| NetError::Closed)?;
                match serde_json::from_str::<Handshake>(&next_text(&mut ws).await?).map_err(|_| NetError::Protocol)? {
                    Handshake::PairAccepted { .. } => {}
                    Handshake::PairRejected { reason } => return Err(NetError::Rejected(reason)),
                    _ => return Err(NetError::Protocol),
                }
                (name, ch)
            }
            Handshake::PairRejected { reason } => return Err(NetError::Rejected(reason)),
            _ => return Err(NetError::Protocol),
        };

        let clock = Arc::new(Mutex::new(ClockSync::default()));
        let (tx, mut out_rx) = mpsc::channel::<Message>(256);
        let (in_tx, in_rx) = mpsc::channel::<Message>(256);
        let clock2 = clock.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_millis(ping_every.max(50)));
            let mut reports = 0u32;
            loop {
                tokio::select! {
                    _ = tick.tick() => {
                        if send_sealed(&mut ws, &mut channel, &Message::Ping { t0: now_ms() }).await.is_err() { break; }
                        reports += 1;
                        if reports.is_multiple_of(4) {
                            let (rtt, off) = { let c = clock2.lock().unwrap(); (c.best_rtt_ms(), c.offset_ms()) };
                            if let (Some(rtt_ms), Some(offset_ms)) = (rtt, off) {
                                if send_sealed(&mut ws, &mut channel, &Message::Report { rtt_ms, offset_ms }).await.is_err() { break; }
                            }
                        }
                    }
                    m = out_rx.recv() => {
                        match m { Some(m) => if send_sealed(&mut ws, &mut channel, &m).await.is_err() { break; }, None => break }
                    }
                    frame = ws.next() => {
                        let data = match frame { Some(Ok(WsMsg::Binary(b))) => b, Some(Ok(WsMsg::Ping(_))) | Some(Ok(WsMsg::Pong(_))) => continue, _ => break };
                        let t3 = now_ms();
                        let Ok(plain) = channel.open(&data) else { break };
                        let Ok(m) = serde_json::from_slice::<Message>(&plain) else { continue };
                        if let Message::Pong { t0, t1, t2 } = m {
                            clock2.lock().unwrap().push(clock::sample(t0, t1, t2, t3));
                        } else if in_tx.send(m).await.is_err() { break; }
                    }
                }
            }
        });
        Ok(Self { console_name, tx, rx: tokio::sync::Mutex::new(in_rx), clock })
    }

    pub async fn send(&self, m: Message) -> Result<(), NetError> {
        self.tx.send(m).await.map_err(|_| NetError::Closed)
    }

    pub async fn recv(&self) -> Option<Message> {
        self.rx.lock().await.recv().await
    }

    pub fn clock_offset_ms(&self) -> Option<f64> {
        self.clock.lock().unwrap().offset_ms()
    }

    pub fn rtt_ms(&self) -> Option<f64> {
        self.clock.lock().unwrap().best_rtt_ms()
    }

    pub fn clock_samples(&self) -> usize {
        self.clock.lock().unwrap().len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{Deck, Source};

    async fn console() -> ConsoleServer {
        ConsoleServer::start("MacBook Pro de Lems", "127.0.0.1:0").await.unwrap()
    }

    #[tokio::test]
    async fn appairage_puis_commandes_dans_les_deux_sens() {
        let c = console().await;
        let url = format!("ws://127.0.0.1:{}", c.port);
        let code = c.code();
        let d = DeviceClient::connect(&url, &code, "Pixel 8 de Lems", Role::Controller, 50).await.unwrap();
        assert_eq!(d.console_name, "MacBook Pro de Lems");
        // Le code a servi : la console en a tiré un autre.
        assert_ne!(c.code(), code);

        // Console → appareil
        tokio::time::sleep(Duration::from_millis(100)).await;
        c.broadcast(Message::Load { deck: Deck::A, source: Source::Youtube { video_id: "abc".into() } });
        let got = tokio::time::timeout(Duration::from_secs(2), d.recv()).await.unwrap().unwrap();
        assert_eq!(got, Message::Load { deck: Deck::A, source: Source::Youtube { video_id: "abc".into() } });

        // Appareil → console
        d.send(Message::Volume { deck: Deck::B, value: 0.6 }).await.unwrap();
        let (_, got) = tokio::time::timeout(Duration::from_secs(2), c.recv()).await.unwrap().unwrap();
        assert_eq!(got, Message::Volume { deck: Deck::B, value: 0.6 });

        // Horloge : même machine, l'écart doit être quasi nul.
        tokio::time::sleep(Duration::from_millis(600)).await;
        assert!(d.clock_samples() >= 5, "mesures : {}", d.clock_samples());
        assert!(d.clock_offset_ms().unwrap().abs() <= 2.0, "écart {:?}", d.clock_offset_ms());
        // La console a reçu le rapport de l'appareil.
        let peers = c.peers();
        assert_eq!(peers.len(), 1);
        assert_eq!(peers[0].name, "Pixel 8 de Lems");
        assert_eq!(peers[0].role, Role::Controller);
        assert!(peers[0].rtt_ms.is_some(), "{peers:?}");
    }

    #[tokio::test]
    async fn mauvais_code_refuse() {
        let c = console().await;
        let url = format!("ws://127.0.0.1:{}", c.port);
        let wrong = if c.code() == "000000" { "111111" } else { "000000" };
        let r = DeviceClient::connect(&url, wrong, "Intrus", Role::Controller, 50).await;
        assert!(matches!(r, Err(NetError::WrongCode)), "{:?}", r.err());
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(c.peers().is_empty());
    }

    #[tokio::test]
    async fn trois_mauvais_codes_changent_le_code() {
        let c = console().await;
        let url = format!("ws://127.0.0.1:{}", c.port);
        let code = c.code();
        let wrong = if code == "000000" { "111111" } else { "000000" };
        for _ in 0..MAX_WRONG_CODES {
            let _ = DeviceClient::connect(&url, wrong, "Intrus", Role::Controller, 50).await;
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert_ne!(c.code(), code, "le code aurait dû changer");
        // L'ancien code, même juste, ne marche plus.
        let r = DeviceClient::connect(&url, &code, "Retardataire", Role::Controller, 50).await;
        assert!(r.is_err());
    }

    #[tokio::test]
    async fn plusieurs_appareils_recoivent_la_meme_commande() {
        let c = console().await;
        let url = format!("ws://127.0.0.1:{}", c.port);
        let d1 = DeviceClient::connect(&url, &c.code(), "Tablette", Role::Controller, 100).await.unwrap();
        let d2 = DeviceClient::connect(&url, &c.code(), "PC Salle", Role::Screen, 100).await.unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;
        let at = now_ms() + 500;
        c.broadcast(Message::Play { deck: Deck::A, position: 83.4, at });
        for d in [&d1, &d2] {
            let m = tokio::time::timeout(Duration::from_secs(2), d.recv()).await.unwrap().unwrap();
            assert_eq!(m, Message::Play { deck: Deck::A, position: 83.4, at });
        }
        assert_eq!(c.peers().len(), 2);
    }
}

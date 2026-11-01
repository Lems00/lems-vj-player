//! Découverte sur le réseau local (mDNS / Bonjour) : la console s'annonce,
//! les appareils la trouvent sans saisir d'adresse.

use std::time::{Duration, Instant};

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};

use crate::protocol::{PROTOCOL_VERSION, SERVICE_TYPE};

#[derive(Debug, Clone, serde::Serialize, PartialEq)]
pub struct FoundConsole {
    pub name: String,
    pub addresses: Vec<String>,
    pub port: u16,
    pub protocol: u32,
    /// Adresse WebSocket prête à l'emploi (IPv4 en priorité).
    pub url: Option<String>,
}

impl FoundConsole {
    /// Calcule l'adresse WebSocket à utiliser (IPv4 en priorité).
    pub fn ws_url(&self) -> Option<String> {
        let ip = self.addresses.iter().find(|a| !a.contains(':')).or(self.addresses.first())?;
        Some(if ip.contains(':') { format!("ws://[{ip}]:{}", self.port) } else { format!("ws://{ip}:{}", self.port) })
    }
}

/// Garde l'annonce active tant qu'il est vivant.
pub struct Advertiser {
    daemon: ServiceDaemon,
    fullname: String,
}

impl Drop for Advertiser {
    fn drop(&mut self) {
        let _ = self.daemon.unregister(&self.fullname);
        let _ = self.daemon.shutdown();
    }
}

fn instance_id() -> String {
    format!("{:08x}", rand::random::<u32>())
}

/// Annonce la console `name` sur `port`.
pub fn advertise(name: &str, port: u16) -> Result<Advertiser, mdns_sd::Error> {
    let daemon = ServiceDaemon::new()?;
    let id = instance_id();
    let host = format!("lems-{id}.local.");
    let instance = format!("lems-{id}");
    let proto = PROTOCOL_VERSION.to_string();
    let props = [("name", name), ("role", "console"), ("proto", proto.as_str())];
    let info = ServiceInfo::new(SERVICE_TYPE, &instance, &host, "", port, &props[..])?.enable_addr_auto();
    let fullname = info.get_fullname().to_string();
    daemon.register(info)?;
    Ok(Advertiser { daemon, fullname })
}

/// Cherche les consoles pendant `timeout` (bloquant).
pub fn browse(timeout: Duration) -> Result<Vec<FoundConsole>, mdns_sd::Error> {
    let daemon = ServiceDaemon::new()?;
    let rx = daemon.browse(SERVICE_TYPE)?;
    let deadline = Instant::now() + timeout;
    let mut found: Vec<FoundConsole> = vec![];
    while let Some(left) = deadline.checked_duration_since(Instant::now()) {
        match rx.recv_timeout(left) {
            Ok(ServiceEvent::ServiceResolved(info)) => {
                let mut c = FoundConsole {
                    name: info.get_property_val_str("name").unwrap_or("Console").to_string(),
                    addresses: info.get_addresses().iter().map(|a| a.to_string()).collect(),
                    port: info.get_port(),
                    protocol: info.get_property_val_str("proto").and_then(|p| p.parse().ok()).unwrap_or(0),
                    url: None,
                };
                c.url = c.ws_url();
                if !found.iter().any(|f| f.name == c.name && f.port == c.port) {
                    found.push(c);
                }
            }
            Ok(_) => {}
            Err(_) => break,
        }
    }
    let _ = daemon.shutdown();
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_ipv4_puis_ipv6() {
        let c = FoundConsole { name: "x".into(), addresses: vec!["fe80::1".into(), "192.168.1.20".into()], port: 4870, protocol: 1, url: None };
        assert_eq!(c.ws_url().unwrap(), "ws://192.168.1.20:4870");
        let c = FoundConsole { name: "x".into(), addresses: vec!["fe80::1".into()], port: 4870, protocol: 1, url: None };
        assert_eq!(c.ws_url().unwrap(), "ws://[fe80::1]:4870");
    }

    /// Demande le multicast sur l'interface réseau : à lancer sur une vraie
    /// machine (`cargo test -- --ignored`), pas toujours possible en conteneur.
    #[test]
    #[ignore]
    fn annonce_puis_decouverte() {
        let _ad = advertise("Console de test", 4870).unwrap();
        let found = browse(Duration::from_secs(4)).unwrap();
        assert!(found.iter().any(|c| c.name == "Console de test" && c.port == 4870 && c.url.is_some()), "{found:?}");
    }
}

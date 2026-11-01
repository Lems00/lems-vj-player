//! Adresses de la console : celles à afficher pour une saisie à la main, la
//! lecture tolérante de ce que l'utilisateur tape, et des messages d'erreur de
//! connexion compréhensibles.

/// Port d'écoute habituel de la console.
pub const DEFAULT_PORT: u16 = 48_700;

/// Transforme ce que l'utilisateur a tapé en adresse `ws://hôte:port`.
///
/// Accepte : `192.168.1.20`, `192.168.1.20:48700`, `ws://192.168.1.20:48700`,
/// et la faute fréquente `192.168.1.20.48700` (un point au lieu des deux-points).
/// Les espaces et la barre finale sont ignorés.
pub fn normalize_console_url(input: &str) -> Result<String, String> {
    let s: String = input.chars().filter(|c| !c.is_whitespace()).collect();
    let s = s.trim_end_matches('/');
    if s.is_empty() {
        return Err("adresse vide".into());
    }
    let lower = s.to_ascii_lowercase();
    let rest = if let Some(r) = lower.strip_prefix("ws://") {
        r
    } else if lower.starts_with("wss://") || lower.starts_with("http://") || lower.starts_with("https://") {
        return Err(format!("« {s} » : l'adresse doit commencer par ws:// (ou juste les chiffres)"));
    } else {
        &lower
    };

    // Cinq nombres séparés par des points : le dernier est le port.
    let parts: Vec<&str> = rest.split('.').collect();
    if parts.len() == 5 && !rest.contains(':') && parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit())) {
        let ip = parts[..4].join(".");
        return check_ip(&ip).and_then(|_| check_port(parts[4])).map(|port| format!("ws://{ip}:{port}"));
    }

    let (host, port) = match rest.rsplit_once(':') {
        Some((h, p)) => (h, check_port(p)?),
        None => (rest, DEFAULT_PORT),
    };
    if host.is_empty() {
        return Err(format!("« {s} » : il manque l'adresse avant le port"));
    }
    if host.chars().all(|c| c.is_ascii_digit() || c == '.') {
        check_ip(host)?;
    }
    Ok(format!("ws://{host}:{port}"))
}

fn check_ip(ip: &str) -> Result<(), String> {
    ip.parse::<std::net::Ipv4Addr>().map(|_| ()).map_err(|_| format!("« {ip} » n'est pas une adresse IP valide (4 nombres de 0 à 255)"))
}

fn check_port(p: &str) -> Result<u16, String> {
    match p.parse::<u16>() {
        Ok(n) if n > 0 => Ok(n),
        _ => Err(format!("« {p} » n'est pas un numéro de port valide")),
    }
}

/// Explique en clair un échec de connexion d'un appareil à la console.
pub fn explain_connect_error(raw: &str) -> String {
    let l = raw.to_ascii_lowercase();
    let why = if l.contains("lookup address") || l.contains("nodename") || l.contains("no such host") || l.contains("name or service not known") {
        "l'adresse est mal écrite. Recopiez-la telle que la console l'affiche, par exemple ws://192.168.1.20:48700."
    } else if l.contains("refused") || l.contains("10061") {
        "l'ordinateur a été joint mais rien n'écoute à cette adresse. Sur la console, cliquez d'abord sur « Cet appareil est la console », et vérifiez le numéro de port."
    } else if l.contains("timed out") || l.contains("délai") || l.contains("10060") {
        "aucune réponse. Le plus probable : le pare-feu de la console bloque l'accès (sur Windows, autorisez « Lems VJ Essais » en réseau privé), ou les deux appareils ne sont pas sur le même Wi-Fi."
    } else if l.contains("unreachable") || l.contains("10065") || l.contains("10051") {
        "réseau inaccessible. Les deux appareils sont-ils sur le même Wi-Fi ?"
    } else if l.contains("code incorrect") {
        "code incorrect. Recopiez le code affiché sur la console (il change après 3 erreurs)."
    } else {
        return format!("Connexion impossible : {raw}");
    };
    format!("Connexion impossible : {why} (détail : {raw})")
}

/// Adresses IPv4 de cet appareil sur le réseau local, à afficher sur la console.
/// Les adresses de réseau domestique (192.168.x, 10.x, 172.16-31.x) viennent en premier.
pub fn local_addresses() -> Vec<String> {
    let mut v: Vec<std::net::Ipv4Addr> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|i| match i.ip() {
            std::net::IpAddr::V4(ip) if !ip.is_loopback() && !ip.is_link_local() && !ip.is_unspecified() => Some(ip),
            _ => None,
        })
        .collect();
    v.sort_by_key(|ip| (!ip.is_private(), *ip));
    v.dedup();
    v.into_iter().map(|ip| ip.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adresses_acceptees() {
        for (input, expected) in [
            ("192.168.88.231", "ws://192.168.88.231:48700"),
            ("192.168.88.231:48700", "ws://192.168.88.231:48700"),
            ("ws://192.168.88.231:48700", "ws://192.168.88.231:48700"),
            ("ws://192.168.88.231.48700", "ws://192.168.88.231:48700"),
            ("192.168.88.231.48700", "ws://192.168.88.231:48700"),
            ("  WS://192.168.88.231:48700/ ", "ws://192.168.88.231:48700"),
            ("ws://192.168.88.231:50000", "ws://192.168.88.231:50000"),
            ("mon-pc.local", "ws://mon-pc.local:48700"),
        ] {
            assert_eq!(normalize_console_url(input).as_deref(), Ok(expected), "{input}");
        }
    }

    #[test]
    fn adresses_refusees() {
        for input in ["", "http://192.168.1.2:48700", "192.168.1.300", "192.168.1.2:99999", "192.168.1.2:", ":48700", "1.2.3.4.0"] {
            assert!(normalize_console_url(input).is_err(), "{input}");
        }
    }

    #[test]
    fn erreurs_expliquees() {
        assert!(explain_connect_error("IO error: failed to lookup address information: nodename nor servname provided, or not known").contains("mal écrite"));
        assert!(explain_connect_error("IO error: Connection refused (os error 61)").contains("rien n'écoute"));
        assert!(explain_connect_error("délai dépassé").contains("pare-feu"));
        assert!(explain_connect_error("autre chose").starts_with("Connexion impossible : autre chose"));
    }

    #[test]
    fn adresses_locales_sans_boucle() {
        for a in local_addresses() {
            assert!(!a.starts_with("127.") && !a.starts_with("169.254."), "{a}");
        }
    }
}

use anyhow::{Context, Result};
use ipnetwork::IpNetwork;
use std::net::IpAddr;
use std::process::Command;
use tracing::{info, warn};

#[derive(Debug, Clone)]
pub struct TailscaleInfo {
    pub ip: IpAddr,
    pub interface: String,
    pub networks: Vec<IpNetwork>,
}

/// Find the tailscale command, trying PATH first, then macOS-specific path
fn find_tailscale_command() -> String {
    // Try standard PATH first
    if let Ok(path) = which::which("tailscale") {
        return path.to_string_lossy().to_string();
    }

    // On macOS, try the application bundle path
    #[cfg(target_os = "macos")]
    {
        let mac_path = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
        if std::path::Path::new(mac_path).exists() {
            return mac_path.to_string();
        }
    }

    "tailscale".to_string() // Fallback, will fail with clear error
}

/// Get Tailscale IP address using the local API or tailscale command
pub fn get_tailscale_ip() -> Result<IpAddr> {
    // Try Tailscale local API first
    if let Ok(ip) = get_tailscale_ip_from_api() {
        return Ok(ip);
    }

    // Fallback to tailscale ip command
    let tailscale_cmd = find_tailscale_command();
    let output = Command::new(&tailscale_cmd)
        .arg("ip")
        .output()
        .with_context(|| format!("Failed to execute tailscale ip command (tried {})", tailscale_cmd))?;

    if !output.status.success() {
        anyhow::bail!("tailscale ip command failed");
    }

    let ip_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if ip_str.is_empty() {
        anyhow::bail!("tailscale ip returned empty");
    }

    ip_str
        .parse()
        .with_context(|| format!("Failed to parse Tailscale IP: {}", ip_str))
}

/// Attempt to get IP from Tailscale local API
fn get_tailscale_ip_from_api() -> Result<IpAddr> {
    let tailscale_cmd = find_tailscale_command();
    let output = Command::new(&tailscale_cmd)
        .arg("status")
        .arg("--json")
        .output()?;

    if !output.status.success() {
        anyhow::bail!("tailscale status command failed");
    }

    #[derive(serde::Deserialize)]
    struct Status {
        #[serde(rename = "Self")]
        self_: SelfInfo,
    }

    #[derive(serde::Deserialize)]
    struct SelfInfo {
        #[serde(rename = "TailscaleIPs")]
        tailscale_ips: Vec<String>,
    }

    let status: Status = serde_json::from_slice(&output.stdout)?;
    if status.self_.tailscale_ips.is_empty() {
        anyhow::bail!("no Tailscale IPs found");
    }

    status.self_.tailscale_ips[0]
        .parse()
        .with_context(|| format!("Failed to parse Tailscale IP: {}", status.self_.tailscale_ips[0]))
}

/// Get Tailscale interface name
pub fn get_tailscale_interface() -> Result<String> {
    let ip = get_tailscale_ip()?;

    // Find interface with this IP
    let interfaces = if_addrs::get_if_addrs()?;
    for iface in interfaces {
        if iface.ip() == ip {
            return Ok(iface.name);
        }
    }

    anyhow::bail!("interface not found for Tailscale IP: {}", ip);
}

/// Get Tailscale network ranges
pub fn get_tailscale_networks() -> Result<Vec<IpNetwork>> {
    let tailscale_cmd = find_tailscale_command();
    let output = Command::new(&tailscale_cmd)
        .arg("status")
        .arg("--json")
        .output()?;

    if !output.status.success() {
        anyhow::bail!("tailscale status command failed");
    }

    #[derive(serde::Deserialize)]
    struct Status {
        #[serde(rename = "Self")]
        self_: SelfInfo,
    }

    #[derive(serde::Deserialize)]
    struct SelfInfo {
        #[serde(rename = "TailscaleIPs")]
        tailscale_ips: Vec<String>,
    }

    let status: Status = serde_json::from_slice(&output.stdout)?;
    let mut networks = Vec::new();

    for ip_str in status.self_.tailscale_ips {
        let ip: IpAddr = ip_str.parse()?;
        let network = match ip {
            IpAddr::V4(_) => IpNetwork::new(ip, 32)?,
            IpAddr::V6(_) => IpNetwork::new(ip, 128)?,
        };
        networks.push(network);
    }

    Ok(networks)
}

/// Get all Tailscale information
pub fn get_tailscale_info() -> Result<TailscaleInfo> {
    let ip = get_tailscale_ip()?;
    let interface = get_tailscale_interface()?;
    let networks = get_tailscale_networks()?;

    Ok(TailscaleInfo {
        ip,
        interface,
        networks,
    })
}

/// Get Tailscale info, returning None if not available (non-fatal)
pub fn get_tailscale_info_optional() -> Option<TailscaleInfo> {
    match get_tailscale_info() {
        Ok(info) => {
            info!("Detected Tailscale interface: ip={}, interface={}", info.ip, info.interface);
            Some(info)
        }
        Err(e) => {
            warn!("Failed to get Tailscale info, continuing without interface binding: {}", e);
            None
        }
    }
}


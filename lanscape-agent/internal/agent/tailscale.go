package agent

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// TailscaleInfo contains Tailscale interface information
type TailscaleInfo struct {
	IP        string
	Interface string
	Networks  []net.IPNet
}

// findTailscaleCommand finds the tailscale command, trying PATH first, then macOS-specific path
func findTailscaleCommand() string {
	// Try standard PATH first
	if path, err := exec.LookPath("tailscale"); err == nil {
		return path
	}

	// On macOS, try the application bundle path
	if runtime.GOOS == "darwin" {
		macPath := "/Applications/Tailscale.app/Contents/MacOS/Tailscale"
		if _, err := os.Stat(macPath); err == nil {
			return macPath
		}
	}

	return "tailscale" // Fallback, will fail with clear error
}

// GetTailscaleIP gets the Tailscale IP address using the local API or tailscale command
func GetTailscaleIP() (string, error) {
	// Try Tailscale local API first
	if ip, err := getTailscaleIPFromAPI(); err == nil {
		return ip, nil
	}

	// Fallback to tailscale ip command
	tailscaleCmd := findTailscaleCommand()
	cmd := exec.Command(tailscaleCmd, "ip")
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to get Tailscale IP (tried %s): %w", tailscaleCmd, err)
	}

	ip := strings.TrimSpace(string(output))
	if ip == "" {
		return "", fmt.Errorf("tailscale ip returned empty")
	}

	return ip, nil
}

// getTailscaleIPFromAPI attempts to get IP from Tailscale local API
func getTailscaleIPFromAPI() (string, error) {
	tailscaleCmd := findTailscaleCommand()
	cmd := exec.Command(tailscaleCmd, "status", "--json")
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}

	var status struct {
		Self struct {
			TailscaleIPs []string `json:"TailscaleIPs"`
		} `json:"Self"`
	}

	if err := json.Unmarshal(output, &status); err != nil {
		return "", err
	}

	if len(status.Self.TailscaleIPs) == 0 {
		return "", fmt.Errorf("no Tailscale IPs found")
	}

	return status.Self.TailscaleIPs[0], nil
}

// GetTailscaleInterface gets the Tailscale interface name
func GetTailscaleInterface() (string, error) {
	ip, err := GetTailscaleIP()
	if err != nil {
		return "", err
	}

	// Find interface with this IP
	ifaces, err := net.Interfaces()
	if err != nil {
		return "", err
	}

	for _, iface := range ifaces {
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			var ipNet *net.IPNet
			switch v := addr.(type) {
			case *net.IPNet:
				ipNet = v
			case *net.IPAddr:
				ipNet = &net.IPNet{IP: v.IP, Mask: v.IP.DefaultMask()}
			default:
				continue
			}

			if ipNet.IP.String() == ip {
				return iface.Name, nil
			}
		}
	}

	return "", fmt.Errorf("interface not found for Tailscale IP: %s", ip)
}

// GetTailscaleNetworks gets the Tailscale network ranges
func GetTailscaleNetworks() ([]net.IPNet, error) {
	tailscaleCmd := findTailscaleCommand()
	cmd := exec.Command(tailscaleCmd, "status", "--json")
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	var status struct {
		Self struct {
			TailscaleIPs []string `json:"TailscaleIPs"`
		} `json:"Self"`
	}

	if err := json.Unmarshal(output, &status); err != nil {
		return nil, err
	}

	var networks []net.IPNet
	for _, ipStr := range status.Self.TailscaleIPs {
		ip := net.ParseIP(ipStr)
		if ip == nil {
			continue
		}

		// Determine mask based on IP version
		var mask net.IPMask
		if ip.To4() != nil {
			mask = net.CIDRMask(32, 32) // /32 for IPv4
		} else {
			mask = net.CIDRMask(128, 128) // /128 for IPv6
		}

		networks = append(networks, net.IPNet{
			IP:   ip,
			Mask: mask,
		})
	}

	return networks, nil
}

// GetTailscaleInfo gets all Tailscale information
func GetTailscaleInfo() (*TailscaleInfo, error) {
	ip, err := GetTailscaleIP()
	if err != nil {
		return nil, err
	}

	iface, err := GetTailscaleInterface()
	if err != nil {
		return nil, err
	}

	networks, err := GetTailscaleNetworks()
	if err != nil {
		return nil, err
	}

	return &TailscaleInfo{
		IP:        ip,
		Interface: iface,
		Networks:  networks,
	}, nil
}

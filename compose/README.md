# Docker Compose Setup

This docker-compose configuration runs the complete Lanscape stack:

- **lanscaped**: Backend API service (port 8080 internally)
- **webui**: Frontend web application (port 80 internally)
- **nginx**: Reverse proxy that serves the frontend and routes API requests (exposed on port 80)
- **signaling**: WebRTC signaling server (exposed on tailnet as `signaling`)
- **signaling-nginx**: Nginx reverse proxy with Let's Encrypt certificates for WSS access to signaling (exposed on port 8443 by default)

## Quick Start

1. **Set your GitHub repository** (optional, defaults to `jhead/lanscape`):
   ```bash
   export GITHUB_REPOSITORY=your-username/lanscape
   ```

2. **Start all services**:
   ```bash
   docker-compose up -d
   ```

3. **Access the application**:
   - Frontend: http://localhost
   - API: http://localhost/v1/

## Configuration

### Environment Variables

- `GITHUB_REPOSITORY`: GitHub repository name (default: `jhead/lanscape`)
  - Used to pull images from `ghcr.io/${GITHUB_REPOSITORY}/...`
- `TS_AUTHKEY`: Tailscale auth key for joining the tailnet
- `SIGNALING_DOMAIN`: Domain name for signaling server (default: `signaling.main.tsnet.jxh.io`)
  - Used for Let's Encrypt certificate provisioning
- `CF_Token`: Cloudflare API token for DNS-01 challenge
- `CF_Zone_ID`: Cloudflare zone ID for DNS-01 challenge
- `SIGNALING_WSS_PORT`: Port for WSS access (default: `8443`)
- `SIGNALING_HTTP_PORT`: Port for HTTP/ACME challenge (default: `8080`)

### Volumes

- `lanscaped-data`: Persistent storage for the lanscaped database and data
- `tailscale-data`: Persistent storage for Tailscale state
- `acme-data`: Persistent storage for acme.sh certificates and configuration
- `signaling-ssl`: Persistent storage for signaling SSL certificates

### Ports

- `80`: HTTP (nginx reverse proxy for main app)
- `443`: HTTPS (nginx reverse proxy for main app)
- `8080`: HTTP (signaling nginx for ACME challenges, configurable via `SIGNALING_HTTP_PORT`)
- `8443`: HTTPS/WSS (signaling nginx for WebSocket connections, configurable via `SIGNALING_WSS_PORT`)

## Development

To use local images instead of pulling from GitHub Container Registry:

1. Build images locally:
   ```bash
   docker build -f packages/webui/Dockerfile -t lanscape-webui .
   cd lanscaped && docker build -t lanscape-daemon .
   ```

2. Update `docker-compose.yml` to use local images:
   ```yaml
   lanscaped:
     image: lanscape-daemon:latest
   webui:
     image: lanscape-webui:latest
   ```

## Signaling WSS Setup

The signaling server is exposed via WSS (WebSocket Secure) through a dedicated nginx instance with automatic Let's Encrypt certificate provisioning.

### Certificate Provisioning

Certificates are automatically provisioned on container startup using acme.sh with Cloudflare DNS-01 challenge. The entrypoint script will:

1. Wait for the signaling service to be ready
2. Check if certificates already exist
3. If not, request new certificates from Let's Encrypt using Cloudflare DNS challenge
4. Install certificates to the nginx SSL directory
5. Start nginx with the certificates

### Required Environment Variables

For certificate provisioning to work, you must set:
- `SIGNALING_DOMAIN`: The domain name for your signaling server (e.g., `signaling.main.tsnet.jxh.io`)
- `CF_Token`: Your Cloudflare API token with DNS edit permissions
- `CF_Zone_ID`: Your Cloudflare zone ID

### Access

- **WSS**: `wss://${SIGNALING_DOMAIN}:${SIGNALING_WSS_PORT:-8443}/ws/{topic}`
- **Tailnet**: The signaling service is also accessible directly on the tailnet as `signaling:8081`

## Production Notes

- Configure SSL/TLS certificates in `nginx.conf` for HTTPS
- Set appropriate resource limits in `docker-compose.yml`
- Use Docker secrets for sensitive configuration
- Consider using a managed database instead of SQLite for production
- Certificates are automatically renewed by acme.sh (runs on container restart)

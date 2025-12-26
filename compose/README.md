# Docker Compose Setup

This docker-compose configuration runs the complete Lanscape stack:

- **lanscaped**: Backend API service (port 8080 internally)
- **webui**: Frontend web application (port 80 internally)
- **nginx**: Reverse proxy that serves the frontend and routes API requests (exposed on port 80)

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

### Volumes

- `lanscaped-data`: Persistent storage for the lanscaped database and data

### Ports

- `80`: HTTP (nginx reverse proxy for main app)
- `443`: HTTPS (nginx reverse proxy for main app)

## Development

To use local images instead of pulling from GitHub Container Registry:

1. Build images locally:
   ```bash
   cd webui && docker build -t lanscape-webui .
   cd ../lanscaped && docker build -t lanscape-daemon .
   ```

2. Update `docker-compose.yml` to use local images:
   ```yaml
   lanscaped:
     image: lanscape-daemon:latest
   webui:
     image: lanscape-webui:latest
   ```

## Production Notes

- Configure SSL/TLS certificates in `nginx.conf` for HTTPS
- Set appropriate resource limits in `docker-compose.yml`
- Use Docker secrets for sensitive configuration
- Consider using a managed database instead of SQLite for production

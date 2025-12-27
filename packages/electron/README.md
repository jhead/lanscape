# Lanscape Electron App

Electron wrapper for the Lanscape webui with bundled lanscape-agent.

## Development

1. Start the webui dev server:
   ```bash
   pnpm --filter webui dev
   ```

2. In another terminal, start Electron:
   ```bash
   pnpm --filter @lanscape/electron dev
   ```

Or use the convenience script from the root:
```bash
pnpm electron:dev
```

## Building

### Build Agent Binary

Build the macOS agent binaries (both amd64 and arm64):
```bash
pnpm --filter @lanscape/electron build:agent
```

### Build Electron App

Build the webui, agent binaries, and Electron app:
```bash
pnpm electron:build
```

This will:
1. Build the webui
2. Build the agent binaries for macOS
3. Compile TypeScript
4. Copy webui dist into electron package
5. Package the Electron app with electron-builder

The output will be in `packages/electron/dist-electron/`.

## Architecture

- **Main Process** (`src/main.ts`): Spawns lanscape-agent as a child process, finds an available port (starting from 8082), and creates the BrowserWindow.
- **Preload Script** (`src/preload.ts`): Exposes IPC API to the renderer process for getting the agent port.
- **Renderer Process**: The webui React app, which connects to the local agent via WebSocket.

## Configuration

### Signaling URL

The signaling server URL can be configured via the `SIGNALING_URL` environment variable:

```bash
SIGNALING_URL=ws://localhost:8081 pnpm electron:dev
```

Default: `ws://localhost:8081`

### Port Management

The agent port is dynamically selected to avoid conflicts:
- Starts at port 8082
- Increments if port is unavailable (up to 8099)
- Port is communicated to renderer via IPC

## Agent Binary

The agent binary is built for both macOS architectures:
- `resources/lanscape-agent-amd64` (Intel)
- `resources/lanscape-agent-arm64` (Apple Silicon)

The correct binary is selected at runtime based on the system architecture.


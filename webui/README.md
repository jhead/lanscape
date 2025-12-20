# Lanscape WebAuthn Registration UI

A simple Vite + TypeScript frontend for testing WebAuthn registration with the lanscaped backend.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure the API URL (optional):
   - Create a `.env` file with `VITE_API_URL=http://localhost:8080` (or your backend URL)
   - Defaults to `http://localhost:8080` if not set

## Development

Run the development server:
```bash
npm run dev
```

The UI will be available at `http://localhost:5173` (or the port Vite assigns).

## Building

Build for production:
```bash
npm run build
```

The built files will be in the `dist/` directory.

## Usage

1. Start the lanscaped backend server
2. Open the web UI in a browser that supports WebAuthn
3. Enter a username and click "Register with WebAuthn"
4. Follow the prompts from your authenticator device (e.g., Touch ID, Windows Hello, security key)

## Requirements

- Modern browser with WebAuthn support (Chrome, Firefox, Safari, Edge)
- An authenticator device (biometric, security key, etc.)
- Backend server running on the configured API URL

# Lanscape Tauri Desktop Application

Tauri-based desktop application for Lanscape.

## Development

```bash
# Start the development server
pnpm tauri:dev

# Build the application
pnpm tauri:build
```

## Project Structure

- `src/` - React frontend code
- `src-tauri/` - Rust backend code (Tauri application)
  - `src/lib.rs` - Main Rust application logic
  - `Cargo.toml` - Rust dependencies
  - `tauri.conf.json` - Tauri configuration

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

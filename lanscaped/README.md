# lanscaped — backend for a private tailnet

lanscaped is a small, self-hosted backend that sits next to **Headscale**
and makes it easy for friends to join a shared tailnet with minimal setup.

- **Headscale**: the Tailscale control-plane (users, nodes, preauth keys).
- **lanscaped**: product API (registration + device adoption) and
  persistence.
- **Clients**: mobile/desktop apps that call lanscaped and then join the
  tailnet using the returned preauth key.

lanscaped runs well on a Raspberry Pi–class host and works anywhere Go
and SQLite are available.

## Features

- **User registration**: app-driven registration tied to a public key.
- **Device adoption**: authenticated user adopts a device; lanscaped
  issues a Headscale preauth key scoped to that user/device.
- **REST API**: simple HTTP/JSON endpoints for the apps.

## Architecture

### Components

- `headscale` (control plane)
- `lanscaped` (this service)
- (optional) reverse proxy / TLS terminator

### lanscaped responsibilities

- HTTP/JSON API for clients
- authentication/authorization for user + device operations
- persistence (SQLite first)
- translating product operations into Headscale API calls
- structured logs to trace onboarding/adoption

### Headscale responsibilities

- creating/managing users and nodes
- issuing and validating preauth keys

### Storage

- **SQLite is the default** for a single-box deployment (`file:` database).
- The storage layer is structured so you can swap in other database drivers via configuration.
- Migrations and queries stay portable where practical.

## Primary flows

- **Register user**
  1) Client submits a registration request including a public key.
  2) lanscaped creates a user record and mirrors the identity in
     Headscale.
  3) lanscaped returns the user handle and an auth token for subsequent API
     calls.

- **Adopt device into the tailnet**
  1) Authenticated user requests adoption for a device (name, platform,
     etc.).
  2) lanscaped creates a device record, mints a Headscale preauth key,
     and binds it to the user/device.
  3) Client uses that key to sign in to Tailscale and join the tailnet.

### API (MVP)

This API is minimal by design and focuses on onboarding.

- `POST /v1/register` → create user (returns token)
- `POST /v1/devices/adopt` → create device + return preauth key
- `GET /v1/me` → basic introspection / debugging
- `GET /healthz` → health check (and optionally Headscale connectivity)

## Data model

Core entities:

- users
- devices
- network (typically 1 per server instance)
- preauth keys (issued + redeemed/expired)
- audit events (high-signal record of onboarding/adoption actions)

## Project structure

Repository layout:

- `cmd/lanscaped/` — entrypoint and wiring (config, logging, server)
- `internal/api/` — routing, handlers, request/response types
- `internal/auth/` — auth, tokens, key validation
- `internal/store/` — DB access + migrations (SQLite first)
- `internal/tailnet/` — Headscale client wrapper
- `pkg/types/` — shared domain structs/errors (if needed by clients)
- `deployments/` — Docker/compose/Helm/systemd examples

## Local development

- **Go**: 1.25+
- **SQLite**: available on the host (or configure `DATABASE_URL` for another SQL backend)
- **Headscale**: reachable from lanscaped (same host in the Pi setup)

### Configuration

- `DATABASE_URL` (optional; defaults to a local SQLite file)
- `HEADSCALE_ENDPOINT` (e.g. `http://localhost:8080`)
- `HEADSCALE_API_KEY` (if required by your Headscale deployment)

Examples:

```text
# SQLite
DATABASE_URL="file:lanscaped.db?_foreign_keys=on"

# Postgres
DATABASE_URL="postgres://user:pass@localhost:5432/lanscaped?sslmode=disable"

HEADSCALE_ENDPOINT="http://localhost:8080"
HEADSCALE_API_KEY="..."
```
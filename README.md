# Netio Local Management

A cross-platform desktop application for centralized management of [Netio](https://www.netio-products.com/) smart power devices on a local network — no cloud required.

Built with [Neutralinojs](https://neutralino.js.org/), [React](https://react.dev/), and [Bun](https://bun.sh/).

---

## Features

- **Automatic device discovery** — scans the local network via UDP broadcast and ping sweep fallback
- **Bulk control** — toggle, turn on or off multiple sockets or devices at once
- **Device groups** — organize devices into named groups for easier management
- **User profiles** — store multiple sets of credentials and assign them per device
- **Firmware updates** — upload and flash firmware to one or more devices simultaneously
- **Real-time status** — live socket state updates via WebSocket (with HTTP polling fallback)
- **Fully local** — no cloud dependency, all data stored on your machine

---

## Architecture

- **Frontend** (`react-src/`) — React 19 + TypeScript + React Bootstrap, built with Vite
- **Backend** (`extensions/backend/`) — Bun-compiled TypeScript extension; handles device communication, config persistence, and discovery
- **Transport** — Neutralinojs extension protocol over WebSocket; the backend exposes a simple RPC-style route table

---

## Prerequisites

[Bun bundler](https://bun.sh/)

System web window

- Edge WebView2 on Windows
- WebKit on macOS
- WebKitGTK on Linux

If you want to pack it into single executable:
[warp-packer](https://github.com/dgiagio/warp)

## Getting Started

This method is working on Linux operating system.

### 1. Clone the repository

```bash
git clone https://github.com/your-username/netio-local-management.git
cd netio-local-management
```

### 2. Install dependencies

```bash
# Root (Neutralinojs CLI)
bun install

# Frontend
cd react-src && bun install && cd ..

# Backend
cd extensions/backend && bun install && cd ../..
```

### 3. Run in development mode

Build backend binary.

```bash
cd extencions/backend && bun run build && cd ../..
```

Start the dev server.

```bash
bun run start
```

> The app connects to the frontend dev server defined in `neutralino.config.json` (`devUrl: http://localhost:5177`).

---

## Building

The `build.sh` script builds everything and produces platform binaries in `dist/`.

```bash
bun run build
```

What it does:

1. Builds the React frontend (`react-src/build/`)
2. Compiles the backend for all four targets:
   - `be-linux-x64`
   - `be-windows-x64.exe`
   - `be-darwin-arm64`
   - `be-darwin-x64`
3. Runs platform-specific packaging scripts (`build-scripts/`)

To build only a specific backend target:

```bash
cd extensions/backend
bun run build:linux
bun run build:windows
bun run build:darwin-x64
bun run build:darwin-arm64
```

---

## Testing

Tests live in `extensions/backend/tests/` and run with Bun's built-in test runner:

```bash
cd extensions/backend
bun test
```

---

## Data storage

On first launch the app creates a data file in the platform-standard data directory:

| OS      | Path                                                               |
| ------- | ------------------------------------------------------------------ |
| Linux   | `~/.local/share/netio-local-management/config.json`                |
| macOS   | `~/Library/Application Support/netio-local-management/config.json` |
| Windows | `%LOCALAPPDATA%\netio-local-management\config.json`                |

Stored credentials are encrypted at rest using AES-256-GCM.

---

## License

MIT

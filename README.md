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
git clone https://github.com/netioproducts/netio-local-management.git
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

## Creating single executables

For this you have to have warp_packer installed.

```bash
wget -qO warp-packer "https://github.com/dgiagio/warp/releases/download/v0.3.0/linux-x64.warp-packer"
```

The `build_win_portable.sh` and `build_linux_portable.sh` scripts bundle builded binaries into `dist/`.

```bash
bun run build:linux-portable
bun run build:win-portable
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

| OS      | Path                                                             |
| ------- | ---------------------------------------------------------------- |
| Linux   | `~/.local/share/netio-local-management/data.json`                |
| macOS   | `~/Library/Application Support/netio-local-management/data.json` |
| Windows | `%LOCALAPPDATA%\netio-local-management\data.json`                |

Stored credentials are encrypted at rest using AES-256-GCM.

---

## Debugging

### Log file

The backend writes its log to `backend.log` next to `data.json` (see [Data storage](#data-storage)).
The file has a single size limit of 5 MB. When it is exceeded, the older half is removed and the file
starts with `--- log trimmed ---`. Every application start begins with a header line
`===== Netio Local Management <version> started <time> =====` followed by the platform, paths and
the active log level.

Passwords, tokens and session IDs are always masked as `***`, even in debug mode, so the log can be
sent for diagnostics.

### Log levels

| Level   | Contains                                                                             |
| ------- | ------------------------------------------------------------------------------------ |
| `error` | Failed operations with stack traces                                                  |
| `warn`  | Recoverable problems and failed requests with their reason                           |
| `info`  | User actions and state changes with results and durations (default)                 |
| `debug` | Every request to the backend and to devices, WebSocket messages, polling, discovery |

### Enabling debug mode

The level is chosen at startup in this order:

1. Environment variable `NETIO_DEBUG=1` sets `debug`.
2. `settings.logLevel` in `data.json` (`error`, `warn`, `info` or `debug`):
   ```json
   {
     "devices": [],
     "deviceGroups": [],
     "users": [],
     "settings": { "logLevel": "debug" }
   }
   ```
   Edit the file while the application is closed. The change takes effect on the next start.
3. Default `info`.

In debug mode the backend also prints the log to its standard output and the frontend prints its own
log to the browser console. Frontend logs are never written to the file.

```bash
# Development
NETIO_DEBUG=1 bun run start

# Built application (Linux / macOS)
NETIO_DEBUG=1 ./netio-local-management-linux_x64

# Built application (Windows, PowerShell)
$env:NETIO_DEBUG=1; .\netio-local-management.exe
```

### Developer tools in a built application

The WebView inspector is disabled in the configuration. To open it in a built application, start it
with `--window-enable-inspector=true`, for example together with debug mode:

```bash
NETIO_DEBUG=1 ./netio-local-management-linux_x64 --window-enable-inspector=true
```

---

## License

MIT

# DirecTree — LDAP Directory Browser

A modern, cross-platform LDAP directory browser desktop application built with **Tauri 2**, **Next.js 15**, and **Rust**. It lets you connect to any LDAP/LDAPS server, browse the directory tree, inspect and edit entries, run advanced searches, view schema, and export LDIF — all from a native desktop window.

---

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Frontend Details](#frontend-details)
- [Backend (Rust) Details](#backend-rust-details)
- [Tauri Commands Reference](#tauri-commands-reference)
- [Configuration Files](#configuration-files)
- [Logging](#logging)
- [Building for Production](#building-for-production)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Connection Manager** — Create, organize (with folders), edit, and delete LDAP connection profiles. Profiles are persisted in browser localStorage.
- **Tree Browser** — Lazy-loading hierarchical tree view of the LDAP directory (DIT). Expand nodes on demand.
- **Attribute Inspector** — View all attributes of a selected entry, with type detection (string, binary/base64, certificate, image, GUID, SID, timestamps, etc.).
- **Entry Editing** — Add, modify, and delete attributes on LDAP entries via `modify_ldap_entry`.
- **Advanced Search** — Full LDAP search with configurable Base DN, scope (base/one/sub), filter presets (users, groups, computers, OUs, locked accounts, etc.) and attribute presets. Saved searches per profile.
- **LDIF Export** — View any entry as LDIF and bulk-export search results.
- **Schema Browser** — Fetch and explore the LDAP schema (attribute types, object classes, syntaxes, matching rules).
- **Root DSE Viewer** — Quick access to the server's Root DSE.
- **Entry Comparison** — Side-by-side comparison of two LDAP entries.
- **Bookmarks** — Bookmark frequently accessed DNs.
- **Command Palette** — Quick keyboard-driven navigation.
- **Logs Viewer** — Inspect both frontend (ring-buffer) and backend (file-based) logs with level filtering.
- **Clipboard Support** — Copy DNs, attribute values, and LDIF to clipboard.
- **TLS Support** — Connect via `ldaps://` with optional certificate verification bypass.

---

## Architecture Overview

```
┌──────────────────────────────────────────────┐
│               Tauri Window (native)          │
│  ┌────────────────────────────────────────┐  │
│  │     Next.js Frontend (React 19)        │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │  │
│  │  │ Home │ │ Tree │ │Search│ │Schema│  │  │
│  │  │ page │ │ page │ │ page │ │ page │  │  │
│  │  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘  │  │
│  │     └────────┴────────┴────────┘       │  │
│  │              invoke() IPC              │  │
│  └──────────────┬─────────────────────────┘  │
│                 │                             │
│  ┌──────────────▼─────────────────────────┐  │
│  │       Rust Backend (Tauri Core)        │  │
│  │  • AppState (Mutex<Option<LdapConn>>)  │  │
│  │  • Commands (connect, search, modify…) │  │
│  │  • ldap3 crate for LDAP protocol       │  │
│  │  • Structured logging (tracing)        │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

The frontend is a statically-exported Next.js app (`output: 'export'`) served inside a Tauri webview. All LDAP operations happen in Rust via Tauri's IPC `invoke()` mechanism — the frontend never talks to LDAP directly.

---

## Tech Stack

| Layer     | Technology                                                  |
|-----------|-------------------------------------------------------------|
| Desktop   | [Tauri 2](https://v2.tauri.app/) (Rust-based native shell) |
| Frontend  | [Next.js 15](https://nextjs.org/) with App Router, React 19, TypeScript |
| Styling   | [Tailwind CSS 3](https://tailwindcss.com/), [MUI 6](https://mui.com/) (Material UI), Framer Motion |
| LDAP      | [`ldap3`](https://crates.io/crates/ldap3) Rust crate with native TLS |
| Logging   | `tracing` + `tracing-appender` (backend), custom ring-buffer (frontend) |
| Clipboard | `@tauri-apps/plugin-clipboard-manager`                      |

---

## Prerequisites

Make sure you have the following installed before setting up the project:

1. **Node.js** — v18 or later ([download](https://nodejs.org/))
2. **npm** — comes with Node.js (v9+ recommended)
3. **Rust toolchain** — install via [rustup](https://rustup.rs/) (Rust 1.77.2+)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
   On Windows, use the [rustup-init.exe](https://rustup.rs/) installer instead.
4. **Tauri system dependencies** — follow the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) for your OS:
   - **Windows**: Microsoft Visual Studio C++ Build Tools, WebView2 (usually pre-installed on Windows 10/11)
   - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
   - **Linux**: `build-essential`, `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, etc.

Verify your setup:
```bash
node --version    # should print v18+
npm --version     # should print v9+
rustc --version   # should print 1.77.2+
cargo --version
```

---

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd direc-tree
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Run in development mode

```bash
npm run tauri dev
```

This single command will:
- Start the Next.js dev server on `http://localhost:3000` (with Turbopack)
- Compile the Rust backend
- Open the native Tauri window pointing at the dev server

Hot-reload works for both frontend (Next.js) and backend (Rust recompiles on save).

> **First run** takes longer because Cargo downloads and compiles all Rust dependencies.

### 4. Access the app

The Tauri window opens automatically. You'll land on the **Connection Manager** (home page) where you can create your first LDAP connection profile.

---

## Project Structure

```
direc-tree/
├── src/                          # ── Frontend (Next.js) ──
│   └── app/
│       ├── layout.tsx            # Root layout (metadata, fonts)
│       ├── page.tsx              # Home — Connection Manager
│       ├── globals.css           # Global styles (Tailwind base)
│       ├── utils.ts              # Shared frontend utilities
│       ├── components/           # Reusable React components
│       │   ├── ConnectionTree.tsx      # Connection list (folders + connections)
│       │   ├── ConnectionFormModal.tsx  # Create/edit connection dialog
│       │   ├── LdapTreeView.tsx        # LDAP directory tree browser
│       │   ├── AttributePanel.tsx      # Entry attribute inspector
│       │   ├── EditAttributeModal.tsx  # Edit attribute dialog
│       │   ├── CommandPalette.tsx      # Keyboard command palette
│       │   ├── BookmarksPanel.tsx      # Bookmarked DNs panel
│       │   ├── CompareEntriesModal.tsx # Side-by-side entry comparison
│       │   ├── LdifView.tsx           # LDIF format viewer
│       │   ├── ContentPreview.tsx     # Attribute content preview
│       │   ├── Base64ImageDisplay.tsx # Base64-encoded image renderer
│       │   ├── XmlContentViewer.tsx   # XML attribute viewer
│       │   ├── RootDseModal.tsx       # Root DSE viewer dialog
│       │   ├── DnBreadcrumb.tsx       # DN breadcrumb navigation
│       │   ├── ProfileList.tsx        # Profile selector list
│       │   ├── ProfileFormModal.tsx   # Profile create/edit form
│       │   ├── FileExplorer.tsx       # File explorer component
│       │   ├── FolderNameDialog.tsx   # Folder name input dialog
│       │   └── ConfirmDialog.tsx      # Generic confirmation dialog
│       ├── hooks/
│       │   └── useLdapTree.ts    # Custom hook for LDAP tree operations
│       ├── models/               # TypeScript type definitions
│       │   ├── ConnectionTree.ts      # Connection tree model + localStorage helpers
│       │   ├── LdapNode.ts           # LdapNode interface
│       │   ├── LdapProfile.ts        # LdapProfile interface
│       │   ├── AttributeTypeEnum.ts  # Attribute type detection enum
│       │   ├── SchemaTypes.ts        # LDAP schema type definitions
│       │   └── SearchModels.ts       # Search params/results types
│       ├── tree/
│       │   └── page.tsx          # Tree browser page (connects & shows DIT)
│       ├── search/
│       │   └── page.tsx          # Advanced search page
│       ├── schema/
│       │   ├── page.tsx          # Schema browser page
│       │   └── SchemaPageClient.tsx
│       ├── logs/
│       │   └── page.tsx          # Log viewer page (frontend + backend)
│       ├── utils/
│       │   ├── loggedInvoke.ts   # Tauri invoke wrapper with logging & redaction
│       │   └── logger.ts         # Frontend ring-buffer logger
│       └── ux/
│           └── CustomResizeHandle.tsx  # Resizable panel handle
│
├── src-tauri/                    # ── Backend (Rust / Tauri) ──
│   ├── tauri.conf.json           # Tauri configuration (window, build, plugins)
│   ├── Cargo.toml                # Rust dependencies
│   ├── build.rs                  # Tauri build script
│   ├── capabilities/
│   │   └── default.json          # Tauri permission capabilities
│   ├── src/
│   │   ├── main.rs               # Entry point (calls lib::run)
│   │   ├── lib.rs                # Tauri app setup, plugin registration, command handlers
│   │   ├── ldap_conn.rs          # LDAP connection helpers (TLS, bind)
│   │   ├── constants.rs          # Dev-only hardcoded constants
│   │   ├── commands/             # Tauri IPC command handlers
│   │   │   ├── mod.rs
│   │   │   ├── connect_ldap.rs        # Connect to LDAP server
│   │   │   ├── disconnect_ldap.rs     # Disconnect from LDAP server
│   │   │   ├── fetch_ldap_tree.rs     # Fetch directory tree nodes
│   │   │   ├── fetch_ldap_entry_attrs.rs  # Fetch entry attributes
│   │   │   ├── fetch_attribute_value.rs   # Fetch single attribute value
│   │   │   ├── fetch_schema.rs        # Fetch LDAP schema
│   │   │   ├── search_ldap.rs         # LDAP search, Root DSE, LDIF export
│   │   │   ├── modify_entry.rs        # Modify LDAP entry attributes
│   │   │   ├── get_all_ldap_objects.rs    # Fetch all objects under a DN
│   │   │   ├── profile_management.rs  # Profile CRUD (file-based)
│   │   │   └── log_commands.rs        # Read backend log files
│   │   ├── models/               # Rust data models (serde-serializable)
│   │   │   ├── mod.rs
│   │   │   ├── ldap_node.rs
│   │   │   └── ldap_profile.rs
│   │   ├── state_management/     # App state (LDAP connection)
│   │   │   ├── mod.rs
│   │   │   └── app_state.rs      # AppState { ldap_connection: Mutex<Option<LdapConn>> }
│   │   └── logging/
│   │       └── mod.rs            # Structured logging setup (tracing + file appender)
│   └── icons/                    # App icons for all platforms
│
├── public/                       # Static assets served by Next.js
├── package.json                  # Node dependencies & scripts
├── tailwind.config.ts            # Tailwind CSS configuration
├── tsconfig.json                 # TypeScript configuration
├── next.config.ts                # Next.js config (static export)
├── postcss.config.mjs            # PostCSS config
└── eslint.config.mjs             # ESLint config
```

---

## Frontend Details

### Pages (App Router)

| Route       | File                         | Purpose                                   |
|------------|------------------------------|-------------------------------------------|
| `/`        | `src/app/page.tsx`           | Connection Manager — create/edit/delete/organize LDAP connection profiles in folders |
| `/tree`    | `src/app/tree/page.tsx`      | Tree Browser — connect to the active profile, browse the DIT, inspect attributes |
| `/search`  | `src/app/search/page.tsx`    | Advanced Search — configurable LDAP search with filter/attribute presets |
| `/schema`  | `src/app/schema/page.tsx`    | Schema Browser — explore attribute types, object classes, syntaxes |
| `/logs`    | `src/app/logs/page.tsx`      | Log Viewer — view frontend + backend logs with level filtering |

### Key Patterns

- **IPC via `loggedInvoke()`** — All calls to the Rust backend go through `src/app/utils/loggedInvoke.ts`, which wraps Tauri's `invoke()` with automatic logging, timing, and credential redaction.
- **Connection state** — The active connection profile is stored in `localStorage` under the key `directree_active_profile`. The `ConnectionTree` model manages the folder/connection hierarchy.
- **No server-side rendering** — The Next.js app is statically exported (`output: 'export'` in `next.config.ts`). All pages are client-side rendered (`'use client'`).

---

## Backend (Rust) Details

### App State

The backend maintains a single `AppState` struct (in `src-tauri/src/state_management/app_state.rs`):

```rust
pub struct AppState {
    pub ldap_connection: Mutex<Option<LdapConn>>,
}
```

This holds the active LDAP connection. It's wrapped in `Arc<Mutex<…>>` and managed by Tauri's state system.

### LDAP Connection

`src-tauri/src/ldap_conn.rs` provides:
- `get_ldap_conn_with_params(url, no_tls_verify)` — Creates a new `LdapConn` with TLS settings and a 60-second timeout.
- `simple_user_pwd_bind_with_params(conn, bind_dn, password)` — Performs LDAP simple bind.

### Logging

Backend logging uses `tracing` + `tracing-appender`:
- Log files are written to `<OS_APP_DATA>/com.rishabh.directree/logs/` as daily rolling files.
- Default level: `info`. Override with the `DIRECTREE_LOG` env var (e.g., `DIRECTREE_LOG=debug`).
- Log directory paths by OS:
  - **Windows**: `%APPDATA%/com.rishabh.directree/logs/`
  - **macOS**: `~/Library/Application Support/com.rishabh.directree/logs/`
  - **Linux**: `~/.local/share/com.rishabh.directree/logs/`

---

## Tauri Commands Reference

These are the IPC commands exposed from Rust to the frontend via `invoke()`:

| Command                          | Description                                       |
|----------------------------------|---------------------------------------------------|
| `connect_ldap`                   | Connect and bind to an LDAP server                |
| `disconnect_ldap`               | Disconnect the active LDAP connection              |
| `is_ldap_connected`             | Check if an LDAP connection is active              |
| `fetch_ldap_tree`               | Fetch child nodes under a base DN                  |
| `get_parsed_json_tree`          | Get the tree as parsed JSON                        |
| `fetch_node_attributes`         | Fetch all attributes of a specific entry           |
| `determine_attribute_type`      | Detect the type (string, binary, cert, etc.)       |
| `fetch_attribute_value`         | Fetch a single attribute's value                   |
| `fetch_node_attributes_operational` | Fetch operational attributes of an entry       |
| `search_ldap`                   | Perform an LDAP search with filter, scope, attrs   |
| `fetch_root_dse`                | Fetch the Root DSE entry                           |
| `get_entry_ldif`                | Get a single entry in LDIF format                  |
| `export_ldif`                   | Export multiple entries as LDIF                     |
| `modify_ldap_entry`             | Add/replace/delete attributes on an entry          |
| `fetch_schema`                  | Fetch the LDAP schema                              |
| `get_all_ldap_objects`          | Fetch all objects under a DN subtree               |
| `list_profiles`                 | List saved connection profiles                     |
| `upsert_profile`                | Create or update a connection profile              |
| `delete_profile`                | Delete a connection profile                        |
| `get_log_tail`                  | Read the last N lines from the backend log         |
| `get_log_dir`                   | Get the backend log directory path                 |

---

## Configuration Files

| File                          | Purpose                                                      |
|-------------------------------|--------------------------------------------------------------|
| `src-tauri/tauri.conf.json`   | Tauri app config — window size, title, build commands, plugins, CSP, bundle settings |
| `next.config.ts`              | Next.js config — static export mode, ESLint bypass during builds |
| `tailwind.config.ts`          | Tailwind CSS theme and content paths                          |
| `tsconfig.json`               | TypeScript compiler options and path aliases                  |
| `src-tauri/Cargo.toml`        | Rust dependencies and crate metadata                          |
| `src-tauri/capabilities/default.json` | Tauri security capabilities (permissions)             |

---

## Logging

### Frontend Logs

The frontend uses a custom ring-buffer logger (`src/app/utils/logger.ts`) that stores log entries in memory. View them on the `/logs` page under the "Frontend" tab. All Tauri IPC calls go through `loggedInvoke()` which automatically logs command name, sanitized arguments (passwords are redacted), timing, and results/errors.

### Backend Logs

The Rust backend logs to rolling daily files using `tracing`. View them on the `/logs` page under the "Backend" tab, or find the raw files at the OS-specific path documented under [Logging](#logging-1) above.

To increase verbosity during development:

```bash
# Windows (PowerShell)
$env:DIRECTREE_LOG="debug"; npm run tauri dev

# macOS / Linux
DIRECTREE_LOG=debug npm run tauri dev
```

---

## Building for Production

### Build the desktop app

```bash
npm run tauri build
```

This will:
1. Run `npm run build` (Next.js static export to `out/`)
2. Compile Rust in release mode
3. Produce platform-specific installers in `src-tauri/target/release/bundle/`

Output locations by platform:
- **Windows**: `.msi` and `.exe` installers in `src-tauri/target/release/bundle/msi/` and `nsis/`
- **macOS**: `.dmg` and `.app` in `src-tauri/target/release/bundle/dmg/` and `macos/`
- **Linux**: `.deb`, `.AppImage` in `src-tauri/target/release/bundle/deb/` and `appimage/`

---

## Troubleshooting

### "Connection failed" when connecting to LDAP

- Verify the LDAP URL is correct (use `ldaps://` for TLS on port 636, `ldap://` for plain on port 389).
- If using a self-signed certificate, enable **"Skip TLS Verification"** in the connection form.
- Check the backend logs for detailed error messages.

### First `npm run tauri dev` is very slow

The first run downloads and compiles all Rust crate dependencies. Subsequent runs are incremental and much faster.

### Rust compilation errors

- Ensure your Rust toolchain is up to date: `rustup update`
- Make sure you have the Tauri system dependencies installed for your OS (see [Prerequisites](#prerequisites)).

### Frontend changes not reflecting

- The dev server uses Turbopack (`next dev --turbopack`). If changes aren't showing, try restarting the dev server.

### Port 3000 already in use

Kill the process using port 3000 or change the port:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# macOS / Linux
lsof -i :3000
kill -9 <PID>
```

---

## NPM Scripts

| Script            | Command               | Description                                |
|-------------------|-----------------------|--------------------------------------------|
| `npm run dev`     | `next dev --turbopack`| Start Next.js dev server (standalone, no Tauri) |
| `npm run build`   | `next build`          | Build Next.js static export               |
| `npm run lint`    | `next lint`           | Run ESLint                                 |
| `npm run tauri dev`| `tauri dev`          | Start full Tauri dev environment           |
| `npm run tauri build`| `tauri build`     | Build production desktop app               |

---

## Useful Links

- [Tauri 2 Docs](https://v2.tauri.app/)
- [Next.js 15 Docs](https://nextjs.org/docs)
- [ldap3 crate Docs](https://docs.rs/ldap3/)
- [MUI Components](https://mui.com/material-ui/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)

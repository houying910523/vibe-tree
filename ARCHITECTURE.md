# VibeTree Architecture

## Overview

This fork is a desktop-first VibeTree workspace. It keeps the Electron desktop app, the shared core/backend packages, and the CLI package. Browser/PWA, standalone server app, static site, shared UI package, shared auth package, and Docker deployment files have been removed.

The main rule is simple: the desktop renderer talks to the same HTTP/WebSocket backend API that the CLI can target. In desktop mode that backend is embedded inside Electron main and bound to `127.0.0.1` with a per-launch token.

## Directory Structure

```text
vibe-tree/
  apps/
    desktop/        Electron app; embeds the backend on loopback
  packages/
    core/           Shared git, worktree, shell session, adapter, and type logic
    server-core/    Embeddable Express/WebSocket backend
    cli/            Command-line client for the backend API
  scripts/          Local maintenance scripts
  docs/             Project notes and development docs
```

## Runtime Shape

```text
Electron renderer
  React UI, terminal panes, diff view, settings
        |
        | WebSocket + per-launch token
        v
Electron main
  embedded-server.ts
        |
        v
packages/server-core
  REST routes, WebSocket routes, auth token checks, ShellManager
        |
        v
packages/core
  git worktree operations, PTY session manager, output buffers, protocol adapter
```

Electron IPC is reserved for native desktop concerns such as opening folders, settings files, notifications, menu events, diagnostics, and IDE launch. Shell and git traffic goes through the embedded backend API instead of broad IPC handlers.

## Desktop App

Main entry points:

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/embedded-server.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/App.tsx`

Startup flow:

1. Electron main initializes desktop services and settings managers.
2. `embedded-server.ts` starts `createVibeTreeServer` on an ephemeral loopback port.
3. Main creates a random static token for the current app launch.
4. The renderer gets the endpoint through preload IPC (`server:get-endpoint`).
5. The renderer uses `WebSocketAdapter` for shell, git, and agent-state traffic.

## Shared Packages

### `@vibetree/core`

`packages/core` contains the platform-neutral domain logic:

- `utils/git.ts`: git worktree list/create/remove/status/diff operations.
- `utils/worktree-hooks.ts`: `.vibetree/git-hook.yml` commands plus legacy `.vibetree/hooks/post-create` and `pre-remove` scripts.
- `services/ShellSessionManager.ts`: PTY lifecycle, reconnect behavior, and scrollback buffers.
- `services/OutputBuffer.ts`: bounded terminal output history.
- `adapters/WebSocketAdapter.ts`: client-side request/response and event protocol.
- `types/index.ts`: shared worktree, git status, and shell session types.

### `@vibetree/server-core`

`packages/server-core` is the embeddable backend used by the desktop app:

- `server.ts`: creates Express, WebSocket server, `ShellManager`, and auth service.
- `api/rest.ts`: project discovery, config, auth, and REST endpoints.
- `api/websocket.ts`: shell, git, and agent-state WebSocket protocol.
- `services/ShellManager.ts`: backend facade over `ShellSessionManager`.
- `auth/AuthService.ts`: static token and optional auth helpers.

The host injects `node-pty` spawn behavior. This keeps native PTY binding decisions outside the shared backend package.

### `@vibetree/cli`

`packages/cli` is kept as a thin command-line client. It does not directly manage git worktrees or PTYs; it calls the backend REST/WebSocket API.

Useful commands include:

- `vibetree worktrees list`
- `vibetree worktrees add <branch>`
- `vibetree worktrees remove <branch>`
- `vibetree status`
- `vibetree run <branch> ["prompt"]`

The CLI still expects a reachable backend URL and token. Because the standalone server app was removed, using the CLI against the desktop embedded backend may need a small future workflow for endpoint/token discovery.

## Shell Session Lifecycle

`ShellSessionManager` owns PTY sessions:

- Session identity is based on `worktreePath + terminalId`.
- Starting the same worktree/terminal attaches to the existing session.
- PTY output is buffered from the first byte.
- Client disconnects remove listeners but do not kill the PTY.
- Reconnects can restore scrollback from `shell:start` or `shell:get-buffer`.
- Desktop mode disables idle cleanup so sessions live until app quit or explicit termination.

## Build And Test

Common commands:

```bash
pnpm install
pnpm build:deps
pnpm dev:desktop
pnpm --filter @vibetree/desktop test:run
pnpm --filter @vibetree/desktop test:e2e
pnpm --filter @vibetree/cli typecheck
pnpm typecheck
```

`pnpm build` runs Turborepo builds for all remaining workspace packages.

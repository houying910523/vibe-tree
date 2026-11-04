# VibeTree 项目架构

最后更新：2026-11-04

本文记录当前清理后的项目结构。这个 fork 的主使用方式是 desktop app；CLI 包暂时保留；浏览器/PWA、独立 server app、官网站点、共享 UI/auth 包和 Docker 部署文件已移除。

## 1. 当前模块

```text
apps/
  desktop/       Electron 桌面端，内嵌本地后端
packages/
  core/          Git/worktree、PTY session、协议 adapter、共享类型
  server-core/   可嵌入 HTTP/WebSocket 后端
  cli/           调用后端 API 的命令行客户端
docs/            项目说明和开发文档
scripts/         本地维护脚本
```

保留边界：

- `apps/desktop` 是唯一应用入口。
- `packages/core` 不依赖 Electron、React、Express。
- `packages/server-core` 提供 REST/WebSocket 后端，由桌面 main 进程嵌入。
- `packages/cli` 只作为 API client 保留，不直接操作本地仓库或 PTY。

## 2. 桌面运行链路

```text
Electron Main
  embedded-server.ts
        |
        v
@vibetree/server-core
  Express + WebSocket + ShellManager
        |
        v
@vibetree/core
  git worktree + ShellSessionManager + OutputBuffer
        ^
        |
Electron Renderer
  React UI + WebSocketAdapter
```

启动流程：

1. `apps/desktop/src/main/index.ts` 初始化 Electron main 侧服务。
2. `apps/desktop/src/main/embedded-server.ts` 启动 `createVibeTreeServer`。
3. server 绑定 `127.0.0.1` 的随机端口，并生成每次启动独立的 static token。
4. renderer 通过 preload IPC 获取后端 endpoint。
5. renderer 用 `WebSocketAdapter` 处理 shell、git、agent state 等业务流量。
6. 原生能力继续走 IPC，例如打开目录、菜单事件、通知、IDE 打开、设置和诊断。

## 3. 核心领域

### Project

Project 表示一个 Git 仓库根路径。桌面端使用 `apps/desktop/src/renderer/contexts/ProjectContext.tsx` 保存项目列表、当前项目和选中的 worktree。最近项目由 Electron main 侧持久化。

### Worktree

Worktree 来自 `git worktree list --porcelain`，核心类型在 `packages/core/src/types/index.ts`。

主要操作在 `packages/core/src/utils/git.ts`：

- `listWorktrees(projectPath)`
- `addWorktree(projectPath, branchName)`
- `removeWorktree(projectPath, worktreePath, branchName)`
- `getGitStatus(worktreePath)`
- `getGitDiff(worktreePath, filePath?)`
- `getGitDiffStaged(worktreePath, filePath?)`

### Shell Session

Shell session 是后端持久资源，由 `packages/core/src/services/ShellSessionManager.ts` 管理。

关键行为：

- session id 默认由 `worktreePath + terminalId` 生成。
- 同一个 worktree + terminalId 重连会复用已有 PTY。
- PTY 输出写入有界 `OutputBuffer`。
- 客户端断开只移除 listener，不会杀掉 PTY。
- 重连后通过 `shell:start` 响应或 `shell:get-buffer` 恢复 scrollback。
- 桌面模式会保持 session 到应用退出或显式关闭。

## 4. 包职责

### `packages/core`

```text
packages/core/src/
  adapters/       WebSocketAdapter 和通信抽象
  services/       ShellSessionManager、OutputBuffer
  types/          Worktree、GitStatus、ShellSession 等共享类型
  utils/          git、shell、process、network、hooks、项目配置等工具
```

这个包承载跨桌面 UI、后端和 CLI 共用的业务语义。

### `packages/server-core`

```text
packages/server-core/src/
  api/            REST 与 WebSocket 路由
  auth/           token/auth helpers
  services/       ShellManager、AgentStateTracker
  config.ts       typed server config
  server.ts       createVibeTreeServer
```

`server-core` 不直接决定运行在哪里。桌面 app 负责注入 `node-pty` 的 `spawn`，并决定 host、port、token、idle cleanup 等运行参数。

### `packages/cli`

CLI 保留为薄客户端：

- REST API 用于查询项目、worktree 和状态。
- WebSocket API 用于启动/复用 shell session、发送 prompt、订阅输出。
- 默认 `terminalId` 为 `cli`，因此不会和桌面主终端默认 session 混在一起。

当前限制：独立 server app 已删除，CLI 仍需要一个可访问的后端 endpoint 和 token。后续若要把 CLI 与桌面内嵌 server 顺滑打通，需要补一个明确的 endpoint/token 发现方式。

## 5. 桌面端主要目录

```text
apps/desktop/src/
  main/           Electron main、embedded server、设置、诊断、通知
  preload/        安全暴露给 renderer 的 IPC bridge
  renderer/       React UI、状态上下文、后端 adapter、组件
```

重要入口：

- `main/index.ts`
- `main/embedded-server.ts`
- `preload/index.ts`
- `renderer/App.tsx`
- `renderer/services/backend.ts`
- `renderer/components/ClaudeTerminal.tsx`
- `renderer/components/ProjectWorkspace.tsx`

## 6. Worktree Hooks

项目可以通过 `.vibetree/git-hook.yml` 配置 worktree 生命周期命令：

```yml
worktree:
  add:
    post-hook: pnpm install
  remove:
    pre-hook: pkill -f vite
```

实现位于 `packages/core/src/utils/worktree-hooks.ts`。如果 `git-hook.yml` 没有配置对应阶段，仍会回退兼容旧的：

```text
.vibetree/hooks/post-create
.vibetree/hooks/pre-remove
```

hook 运行失败会记录并返回 warning，但不会阻塞 worktree 删除。

## 7. 验证命令

常用本地验证：

```bash
pnpm install
pnpm build:deps
pnpm --filter @vibetree/desktop typecheck
pnpm --filter @vibetree/desktop test:run
pnpm --filter @vibetree/cli typecheck
pnpm typecheck
```

桌面 E2E：

```bash
pnpm --filter @vibetree/desktop test:e2e
```

全量构建：

```bash
pnpm build
```

## 8. 已清理模块

本轮面向桌面使用方式，删除了以下模块或部署入口：

- `apps/web`
- `apps/server`
- `apps/site`
- `packages/ui`
- `packages/auth`
- 根目录 Docker/nginx 部署文件
- desktop Playwright Docker 配置
- site 部署 workflow

CLI 按用户要求保留。

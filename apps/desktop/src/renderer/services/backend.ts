import { WebSocketAdapter } from '@vibetree/core';
import type {
  ShellStartResult,
  ShellWriteResult,
  ShellResizeResult,
  Worktree,
  GitStatus,
  WorktreeAddResult,
  WorktreeHookFinishedEvent,
  WorktreeRemoveResult,
  WorktreeGitOperationResult
} from '@vibetree/core';

/**
 * Shell and git operations go to the server embedded in the main process,
 * over the same WebSocket protocol the web client uses. The adapter is a
 * lazy singleton: the first call fetches the endpoint (port + token) from
 * the preload bridge and connects.
 */
let adapterPromise: Promise<WebSocketAdapter> | null = null;

async function createAdapter(): Promise<WebSocketAdapter> {
  const { url } = await window.electronAPI.server.getEndpoint();
  const adapter = new WebSocketAdapter(url, undefined, () => {
    // The embedded server only goes away when the app quits; if the socket
    // drops for any other reason, reconnect lazily on the next call
    adapterPromise = null;
  });
  await adapter.connect();
  return adapter;
}

export function getAdapter(): Promise<WebSocketAdapter> {
  if (!adapterPromise) {
    adapterPromise = createAdapter().catch((error) => {
      adapterPromise = null;
      throw error;
    });
  }
  return adapterPromise;
}

type Unsubscribe = () => void;

/**
 * Subscriptions must survive reconnects, so event listeners are registered
 * through a helper that re-attaches automatically when a new adapter is
 * created after a drop.
 */
function subscribe(attach: (adapter: WebSocketAdapter) => Unsubscribe): Unsubscribe {
  let disposed = false;
  let detach: Unsubscribe = () => {};

  getAdapter().then((adapter) => {
    if (!disposed) {
      detach = attach(adapter);
    }
  });

  return () => {
    disposed = true;
    detach();
  };
}

// shortcut: tolerate a hot-reloaded renderer with an older core adapter, remove when deps always rebuild before reload.
type GitOperationAdapter = {
  mergeWorktreeIntoRoot?: (
    projectPath: string,
    worktreePath: string
  ) => Promise<WorktreeGitOperationResult>;
  rebaseWorktreeOntoRoot?: (
    projectPath: string,
    worktreePath: string
  ) => Promise<WorktreeGitOperationResult>;
  sendMessage<T>(type: string, payload: unknown): Promise<T>;
};

async function getGitOperationAdapter(): Promise<GitOperationAdapter> {
  return (await getAdapter()) as unknown as GitOperationAdapter;
}

export const backend = {
  shell: {
    start: async (
      worktreePath: string,
      cols?: number,
      rows?: number,
      forceNew?: boolean,
      terminalId?: string
    ): Promise<ShellStartResult> => {
      const adapter = await getAdapter();
      return adapter.startShell(worktreePath, cols, rows, forceNew, terminalId);
    },
    write: async (processId: string, data: string): Promise<ShellWriteResult> => {
      const adapter = await getAdapter();
      return adapter.writeToShell(processId, data);
    },
    resize: async (processId: string, cols: number, rows: number): Promise<ShellResizeResult> => {
      const adapter = await getAdapter();
      return adapter.resizeShell(processId, cols, rows);
    },
    status: async (processId: string): Promise<{ running: boolean }> => {
      const adapter = await getAdapter();
      return adapter.getShellStatus(processId);
    },
    getBuffer: async (processId: string): Promise<{ success: boolean; buffer: string | null }> => {
      const adapter = await getAdapter();
      return adapter.getShellBuffer(processId);
    },
    terminate: async (processId: string): Promise<{ success: boolean; error?: string }> => {
      const adapter = await getAdapter();
      return adapter.terminateShell(processId);
    },
    terminateForWorktree: async (
      worktreePath: string
    ): Promise<{ success: boolean; count: number }> => {
      const adapter = await getAdapter();
      return adapter.terminateShellsForWorktree(worktreePath);
    },
    getWorktreeSessions: async (): Promise<Record<string, number>> => {
      const adapter = await getAdapter();
      return adapter.getWorktreeSessions();
    },
    onOutput: (processId: string, callback: (data: string) => void): Unsubscribe =>
      subscribe((adapter) => adapter.onShellOutput(processId, callback)),
    onExit: (processId: string, callback: (code: number) => void): Unsubscribe =>
      subscribe((adapter) => adapter.onShellExit(processId, callback)),
    onSessionsChanged: (callback: (sessions: Record<string, number>) => void): Unsubscribe =>
      subscribe((adapter) => adapter.onSessionsChanged(callback))
  },
  git: {
    listWorktrees: async (projectPath: string): Promise<Worktree[]> => {
      const adapter = await getAdapter();
      return adapter.listWorktrees(projectPath);
    },
    addWorktree: async (projectPath: string, branchName: string): Promise<WorktreeAddResult> => {
      const adapter = await getAdapter();
      return adapter.addWorktree(projectPath, branchName);
    },
    onWorktreeHookFinished: (callback: (event: WorktreeHookFinishedEvent) => void): Unsubscribe =>
      subscribe((adapter) => adapter.onWorktreeHookFinished(callback)),
    removeWorktree: async (
      projectPath: string,
      worktreePath: string,
      branchName: string
    ): Promise<WorktreeRemoveResult> => {
      const adapter = await getAdapter();
      return adapter.removeWorktree(projectPath, worktreePath, branchName);
    },
    mergeWorktreeIntoRoot: async (
      projectPath: string,
      worktreePath: string
    ): Promise<WorktreeGitOperationResult> => {
      const adapter = await getGitOperationAdapter();
      return typeof adapter.mergeWorktreeIntoRoot === 'function'
        ? adapter.mergeWorktreeIntoRoot(projectPath, worktreePath)
        : adapter.sendMessage('git:worktree:merge', { projectPath, worktreePath });
    },
    rebaseWorktreeOntoRoot: async (
      projectPath: string,
      worktreePath: string
    ): Promise<WorktreeGitOperationResult> => {
      const adapter = await getGitOperationAdapter();
      return typeof adapter.rebaseWorktreeOntoRoot === 'function'
        ? adapter.rebaseWorktreeOntoRoot(projectPath, worktreePath)
        : adapter.sendMessage('git:worktree:rebase', { projectPath, worktreePath });
    },
    status: async (worktreePath: string): Promise<GitStatus[]> => {
      const adapter = await getAdapter();
      return adapter.getGitStatus(worktreePath);
    },
    diff: async (worktreePath: string, filePath?: string): Promise<string> => {
      const adapter = await getAdapter();
      return adapter.getGitDiff(worktreePath, filePath);
    },
    diffStaged: async (worktreePath: string, filePath?: string): Promise<string> => {
      const adapter = await getAdapter();
      return adapter.getGitDiffStaged(worktreePath, filePath);
    }
  }
};

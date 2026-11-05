import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';

/**
 * Regression test for duplicated keystrokes: concurrent runs of the
 * shell-start effect (StrictMode double-invoke, fast worktree switches)
 * used to leak xterm onData listeners, so one keypress was written to the
 * PTY once per leaked listener.
 */

vi.mock('@xterm/xterm', () => {
  interface Disposable {
    dispose: () => void;
  }

  class FakeTerminal {
    static instances: FakeTerminal[] = [];
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};
    element = document.createElement('div');
    textarea = document.createElement('textarea');
    private dataHandlers: Array<(data: string) => void> = [];

    constructor() {
      FakeTerminal.instances.push(this);
    }

    onData(handler: (data: string) => void): Disposable {
      this.dataHandlers.push(handler);
      return {
        dispose: () => {
          this.dataHandlers = this.dataHandlers.filter((h) => h !== handler);
        }
      };
    }

    attachCustomKeyEventHandler() {}

    emitData(data: string) {
      // Copy: handlers may unsubscribe while iterating
      [...this.dataHandlers].forEach((handler) => handler(data));
    }

    get liveDataHandlerCount() {
      return this.dataHandlers.length;
    }

    onBell(): Disposable {
      return { dispose: () => {} };
    }
    onKey(): Disposable {
      return { dispose: () => {} };
    }
    open() {}
    loadAddon() {}
    focus() {}
    blur() {}
    clear() {}
    write() {}
    writeln() {}
    dispose() {}
  }

  return { Terminal: FakeTerminal };
});

vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {} }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/addon-serialize', () => ({
  SerializeAddon: class {
    serialize() {
      return '';
    }
  }
}));
vi.mock('@xterm/addon-unicode11', () => ({
  Unicode11Addon: class {
    activate() {}
  }
}));
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));
vi.mock('./SchedulerDialog', () => ({ SchedulerDialog: () => null }));

const { shellWrite, shellStart, startResolvers } = vi.hoisted(() => {
  const startResolvers: Array<() => void> = [];
  return {
    startResolvers,
    shellWrite: vi.fn(),
    shellStart: vi.fn(
      () =>
        new Promise((resolve) => {
          const index = startResolvers.length;
          startResolvers.push(() =>
            resolve({ success: true, processId: `pid-${index}`, isNew: true })
          );
        })
    )
  };
});

vi.mock('../services/backend', () => ({
  backend: {
    shell: {
      start: (...args: unknown[]) => shellStart(...(args as [])),
      write: (...args: unknown[]) => shellWrite(...(args as [])),
      resize: vi.fn(async () => ({ success: true })),
      onOutput: vi.fn(() => () => {}),
      onExit: vi.fn(() => () => {}),
      status: vi.fn(async () => ({ running: true }))
    }
  }
}));

import { Terminal as XTermTerminal } from '@xterm/xterm';
import { Terminal } from './Terminal';

interface FakeTerminalStatics {
  instances: Array<{
    emitData: (data: string) => void;
    liveDataHandlerCount: number;
  }>;
}

const FakeTerminal = XTermTerminal as unknown as FakeTerminalStatics;

describe('Terminal input listener lifecycle', () => {
  beforeEach(() => {
    FakeTerminal.instances.length = 0;
    startResolvers.length = 0;
    shellWrite.mockClear();
    shellStart.mockClear();
    const api = window.electronAPI as unknown as Record<string, unknown>;
    api.terminalSettings = {
      get: vi.fn(async () => null),
      onChange: vi.fn(() => () => {})
    };
    api.ide = {
      detect: vi.fn(async () => []),
      open: vi.fn(async () => ({ success: true }))
    };
    (
      window.electronAPI.claudeNotification.enable as ReturnType<typeof vi.fn>
    ).mockClear();
    (
      window.electronAPI.claudeNotification.disable as ReturnType<typeof vi.fn>
    ).mockClear();
    (
      window.electronAPI.claudeNotification.markUserInput as ReturnType<typeof vi.fn>
    ).mockClear();
  });

  it('does not leak input listeners when the worktree changes mid-start', async () => {
    const { rerender } = render(
      <Terminal worktreePath="/tmp/repo-a" terminalId="term-1" isVisible />
    );

    // First start is in flight (its promise is still pending) when the
    // worktree switches, which used to let the stale run register listeners
    await waitFor(() => expect(shellStart).toHaveBeenCalledTimes(1));
    rerender(<Terminal worktreePath="/tmp/repo-b" terminalId="term-1" isVisible />);
    await waitFor(() => expect(shellStart).toHaveBeenCalledTimes(2));

    // Resolve the stale run first, then the current one
    await act(async () => {
      startResolvers[0]();
    });
    await act(async () => {
      startResolvers[1]();
    });

    await waitFor(() => {
      const live = FakeTerminal.instances.reduce((sum, term) => sum + term.liveDataHandlerCount, 0);
      expect(live).toBeGreaterThan(0);
    });

    const liveHandlers = FakeTerminal.instances.reduce(
      (sum, term) => sum + term.liveDataHandlerCount,
      0
    );
    expect(liveHandlers).toBe(1);

    FakeTerminal.instances.forEach((term) => term.emitData('x'));
    expect(shellWrite).toHaveBeenCalledTimes(1);
    expect(shellWrite).toHaveBeenCalledWith('pid-1', 'x');
  });

  it('runs the initial command when the shell is new', async () => {
    render(
      <Terminal
        worktreePath="/tmp/repo-a"
        terminalId="term-1"
        initialCommand="codex"
        isVisible
      />
    );

    await waitFor(() => expect(shellStart).toHaveBeenCalledTimes(1));
    await act(async () => {
      startResolvers[0]();
    });

    await waitFor(() => expect(shellWrite).toHaveBeenCalledWith('pid-0', 'codex\r'));
    expect(window.electronAPI.claudeNotification.enable).toHaveBeenCalledWith('pid-0', 'codex');
    expect(window.electronAPI.claudeNotification.markUserInput).toHaveBeenCalledWith('pid-0');
  });

  it('enables notifications when a user manually starts Codex', async () => {
    render(<Terminal worktreePath="/tmp/repo-a" terminalId="term-1" isVisible />);

    await waitFor(() => expect(shellStart).toHaveBeenCalledTimes(1));
    await act(async () => {
      startResolvers[0]();
    });

    await waitFor(() => expect(FakeTerminal.instances[0].liveDataHandlerCount).toBe(1));
    await act(async () => {
      FakeTerminal.instances[0].emitData('codex');
      FakeTerminal.instances[0].emitData('\r');
    });

    await waitFor(() =>
      expect(window.electronAPI.claudeNotification.enable).toHaveBeenCalledWith('pid-0', 'codex')
    );
    expect(window.electronAPI.claudeNotification.markUserInput).toHaveBeenCalledWith('pid-0');
  });

  it('does not run the initial command when reattaching to an existing shell', async () => {
    shellStart.mockResolvedValueOnce({
      success: true,
      processId: 'pid-existing',
      isNew: false,
      buffer: ''
    });

    const onProcessIdChange = vi.fn();

    render(
      <Terminal
        worktreePath="/tmp/repo-a"
        terminalId="term-1"
        initialCommand="codex"
        onProcessIdChange={onProcessIdChange}
        isVisible
      />
    );

    await waitFor(() => expect(shellStart).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onProcessIdChange).toHaveBeenCalledWith('pid-existing'));
    expect(shellWrite).not.toHaveBeenCalled();
  });
});

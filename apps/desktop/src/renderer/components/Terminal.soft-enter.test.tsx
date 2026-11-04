import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';

const SOFT_ENTER_SEQUENCE = '\u001b[13;2u';

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
    private customKeyEventHandler: ((event: KeyboardEvent) => boolean) | null = null;

    constructor(options: Record<string, unknown> = {}) {
      this.options = options;
      FakeTerminal.instances.push(this);
    }

    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      this.customKeyEventHandler = handler;
    }

    dispatchKeyEvent(
      type: 'keydown' | 'keypress',
      overrides: Partial<
        Pick<KeyboardEvent, 'key' | 'keyCode' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>
      >
    ) {
      const preventDefault = vi.fn();
      const event = {
        type,
        key: 'Enter',
        keyCode: 13,
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        preventDefault,
        ...overrides
      } as unknown as KeyboardEvent;

      const allowed = this.customKeyEventHandler?.(event) ?? true;
      return { allowed, preventDefault };
    }

    onData(handler: (data: string) => void): Disposable {
      this.dataHandlers.push(handler);
      return {
        dispose: () => {
          this.dataHandlers = this.dataHandlers.filter((entry) => entry !== handler);
        }
      };
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

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  }
}));
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

const { shellWrite, shellStart, shellGetForegroundProcess, outputListeners } = vi.hoisted(() => {
  const outputListeners = new Map<string, (data: string) => void>();
  return {
    outputListeners,
    shellWrite: vi.fn(),
    shellStart: vi.fn(async () => ({ success: true, processId: 'pid-1', isNew: true })),
    shellGetForegroundProcess: vi.fn(async () => ({ pid: 1, command: '/bin/zsh' }))
  };
});

vi.mock('../services/backend', () => ({
  backend: {
    shell: {
      start: (...args: unknown[]) => shellStart(...(args as [])),
      write: (...args: unknown[]) => shellWrite(...(args as [])),
      resize: vi.fn(async () => ({ success: true })),
      onOutput: vi.fn((processId: string, handler: (data: string) => void) => {
        outputListeners.set(processId, handler);
        return () => outputListeners.delete(processId);
      }),
      onExit: vi.fn(() => () => {})
    }
  }
}));

import { Terminal as XTermTerminal } from '@xterm/xterm';
import { Terminal } from './Terminal';

interface FakeTerminalStatics {
  instances: Array<{
    options: Record<string, unknown>;
    dispatchKeyEvent: (
      type: 'keydown' | 'keypress',
      overrides: Partial<KeyboardEvent>
    ) => {
      allowed: boolean;
      preventDefault: ReturnType<typeof vi.fn>;
    };
  }>;
}

const FakeTerminal = XTermTerminal as unknown as FakeTerminalStatics;

describe('Terminal soft enter', () => {
  beforeEach(() => {
    FakeTerminal.instances.length = 0;
    outputListeners.clear();
    shellWrite.mockClear();
    shellStart.mockClear();
    shellGetForegroundProcess.mockReset();
    shellGetForegroundProcess.mockResolvedValue({ pid: 1, command: '/bin/zsh' });

    const api = window.electronAPI as unknown as Record<string, unknown>;
    api.terminalSettings = {
      get: vi.fn(async () => null),
      onChange: vi.fn(() => () => {})
    };
    api.ide = {
      detect: vi.fn(async () => []),
      open: vi.fn(async () => ({ success: true }))
    };
    api.shell = {
      getForegroundProcess: shellGetForegroundProcess,
      openExternal: vi.fn(async () => {})
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('allows Option-drag selection when terminal apps enable mouse mode', async () => {
    render(<Terminal worktreePath="/tmp/repo" terminalId="term-1" isVisible />);

    await waitFor(() => expect(shellStart).toHaveBeenCalledTimes(1));

    expect(FakeTerminal.instances[0].options.macOptionClickForcesSelection).toBe(true);
  });

  it('sends a soft-enter sequence once Pi or Codex becomes the foreground app', async () => {
    shellGetForegroundProcess
      .mockResolvedValueOnce({ pid: 1, command: '/bin/zsh' })
      .mockResolvedValueOnce({
        pid: 2,
        command: 'node /opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js'
      });

    render(<Terminal worktreePath="/tmp/repo" terminalId="term-1" isVisible />);

    await waitFor(() => expect(shellStart).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(shellGetForegroundProcess).toHaveBeenCalledTimes(1));

    await act(async () => {
      outputListeners.get('pid-1')?.('ready');
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    await waitFor(() => expect(shellGetForegroundProcess).toHaveBeenCalledTimes(2));

    const keyDownResult = FakeTerminal.instances[0].dispatchKeyEvent('keydown', {
      key: 'Enter',
      shiftKey: true
    });
    const keyPressResult = FakeTerminal.instances[0].dispatchKeyEvent('keypress', {
      key: 'Enter',
      keyCode: 13,
      shiftKey: true
    });

    expect(keyDownResult.allowed).toBe(false);
    expect(keyDownResult.preventDefault).toHaveBeenCalledTimes(1);
    expect(keyPressResult.allowed).toBe(false);
    expect(keyPressResult.preventDefault).toHaveBeenCalledTimes(1);
    expect(shellWrite).toHaveBeenCalledTimes(1);
    expect(shellWrite).toHaveBeenCalledWith('pid-1', SOFT_ENTER_SEQUENCE);
  });

  it('does not override Shift+Enter for regular shells', async () => {
    render(<Terminal worktreePath="/tmp/repo" terminalId="term-1" isVisible />);

    await waitFor(() => expect(shellStart).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(shellGetForegroundProcess).toHaveBeenCalledTimes(1));

    const result = FakeTerminal.instances[0].dispatchKeyEvent('keydown', {
      key: 'Enter',
      shiftKey: true
    });

    expect(result.allowed).toBe(true);
    expect(result.preventDefault).not.toHaveBeenCalled();
    expect(shellWrite).not.toHaveBeenCalled();
  });
});

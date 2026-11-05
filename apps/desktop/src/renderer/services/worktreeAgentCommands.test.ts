import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const configs = new Map<string, { agentCommand?: string }>();
  return {
    configs,
    get: vi.fn(async (path: string) => configs.get(path) ?? {}),
    update: vi.fn(async (path: string, updates: { agentCommand?: string }) => {
      const next = { ...(configs.get(path) ?? {}), ...updates };
      if (!next.agentCommand) delete next.agentCommand;
      configs.set(path, next);
      return next;
    })
  };
});

vi.mock('./backend', () => ({
  backend: {
    projectConfig: {
      get: mocks.get,
      update: mocks.update
    }
  }
}));

describe('worktreeAgentCommands', () => {
  beforeEach(() => {
    mocks.configs.clear();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('restores agent commands from the worktree config after the module reloads', async () => {
    const { setAgentCommandForWorktree } = await import('./worktreeAgentCommands');
    await setAgentCommandForWorktree('/repo/feature', 'codex');

    vi.resetModules();
    const { getAgentCommandForWorktree } = await import('./worktreeAgentCommands');

    await expect(getAgentCommandForWorktree('/repo/feature')).resolves.toBe('codex');
    expect(mocks.update).toHaveBeenCalledWith('/repo/feature', { agentCommand: 'codex' });
    expect(mocks.get).toHaveBeenCalledWith('/repo/feature');
  });

  it('clears persisted agent commands from the worktree config', async () => {
    const {
      clearAgentCommandForWorktree,
      getAgentCommandForWorktree,
      setAgentCommandForWorktree
    } = await import('./worktreeAgentCommands');

    await setAgentCommandForWorktree('/repo/feature', 'pi');
    await clearAgentCommandForWorktree('/repo/feature');

    await expect(getAgentCommandForWorktree('/repo/feature')).resolves.toBeUndefined();
    expect(mocks.update).toHaveBeenLastCalledWith('/repo/feature', { agentCommand: undefined });
  });
});

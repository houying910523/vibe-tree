import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RightPaneView } from './RightPaneView';

const mocks = vi.hoisted(() => ({
  getAgentCommandForWorktree: vi.fn()
}));

vi.mock('@/services/worktreeAgentCommands', () => ({
  getAgentCommandForWorktree: mocks.getAgentCommandForWorktree
}));

vi.mock('./TerminalGrid', () => ({
  TerminalGrid: ({
    cacheKey,
    initialCommand,
    isVisible = true
  }: {
    cacheKey?: string;
    initialCommand?: string;
    isVisible?: boolean;
  }) => (
    <div
      data-testid={cacheKey?.endsWith(':agent') ? 'agent-grid' : 'terminal-grid'}
      data-visible={isVisible}
    >
      {initialCommand}
    </div>
  )
}));

vi.mock('./GitDiffView', () => ({
  GitDiffView: () => <div data-testid="git-diff-view" />
}));

describe('RightPaneView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens persisted agent worktrees on the Agent tab with the saved command', async () => {
    mocks.getAgentCommandForWorktree.mockResolvedValue('codex');

    render(<RightPaneView worktreePath="/repo/feature" />);

    expect(await screen.findByTestId('agent-grid')).toHaveTextContent('codex');
    expect(screen.getByRole('tab', { name: /agent/i })).toHaveAttribute('aria-selected', 'true');
    expect(mocks.getAgentCommandForWorktree).toHaveBeenCalledWith('/repo/feature');
  });

  it('defaults the project root worktree Agent tab to codex', async () => {
    mocks.getAgentCommandForWorktree.mockResolvedValue(undefined);

    render(<RightPaneView worktreePath="/repo" isProjectRootWorktree />);

    expect(await screen.findByTestId('agent-grid')).toHaveTextContent('codex');
    expect(screen.getByRole('tab', { name: /agent/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('does not mount a terminal before the worktree config is loaded', () => {
    mocks.getAgentCommandForWorktree.mockReturnValue(new Promise(() => {}));

    render(<RightPaneView worktreePath="/repo/feature" />);

    expect(screen.queryByTestId('terminal-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-grid')).not.toBeInTheDocument();
  });

  it('switches tabs from the global keyboard shortcut', async () => {
    mocks.getAgentCommandForWorktree.mockResolvedValue(undefined);

    render(<RightPaneView worktreePath="/repo/feature" />);

    expect(await screen.findByTestId('terminal-grid')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', metaKey: true }));
    });

    expect(screen.getByRole('tab', { name: /changes/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('git-diff-view')).toBeInTheDocument();
  });

  it('keeps the Agent terminal mounted after it has been opened', async () => {
    mocks.getAgentCommandForWorktree.mockResolvedValue(undefined);

    render(<RightPaneView worktreePath="/repo/feature" />);

    await screen.findByTestId('terminal-grid');
    fireEvent.mouseDown(screen.getByRole('tab', { name: /agent/i }), { button: 0 });
    const agentGrid = screen.getByTestId('agent-grid');

    fireEvent.mouseDown(screen.getByRole('tab', { name: /terminal/i }), { button: 0 });
    expect(screen.getByTestId('agent-grid')).toBe(agentGrid);
    expect(agentGrid).toHaveAttribute('data-visible', 'false');

    fireEvent.mouseDown(screen.getByRole('tab', { name: /agent/i }), { button: 0 });
    expect(screen.getByTestId('agent-grid')).toBe(agentGrid);
    expect(agentGrid).toHaveAttribute('data-visible', 'true');
  });
});

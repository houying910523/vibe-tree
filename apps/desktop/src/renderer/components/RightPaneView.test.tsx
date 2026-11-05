import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RightPaneView } from './RightPaneView';
import { RIGHT_PANE_TAB_SHORTCUT_EVENT } from './rightPaneTabs';

const mocks = vi.hoisted(() => ({
  getAgentCommandForWorktree: vi.fn()
}));

vi.mock('@/services/worktreeAgentCommands', () => ({
  getAgentCommandForWorktree: mocks.getAgentCommandForWorktree
}));

vi.mock('./TerminalGrid', () => ({
  TerminalGrid: ({ initialCommand }: { initialCommand?: string }) => (
    <div data-testid={initialCommand ? 'agent-grid' : 'terminal-grid'}>{initialCommand}</div>
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

  it('switches tabs from the global right pane shortcut event', async () => {
    mocks.getAgentCommandForWorktree.mockResolvedValue(undefined);

    render(<RightPaneView worktreePath="/repo/feature" />);

    expect(await screen.findByTestId('terminal-grid')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent(RIGHT_PANE_TAB_SHORTCUT_EVENT, { detail: 'git-diff' }));
    });

    expect(screen.getByRole('tab', { name: /changes/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('git-diff-view')).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorktreePanelDialogs } from './WorktreePanelDialogs';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  toastUpdate: vi.fn(),
  toastDismiss: vi.fn(),
  terminateForWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  cleanupWorktreeTerminals: vi.fn(),
  clearAgentCommandForWorktree: vi.fn()
}));

vi.mock('../ui/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));

vi.mock('@/services/backend', () => ({
  backend: {
    shell: {
      terminateForWorktree: mocks.terminateForWorktree
    },
    git: {
      removeWorktree: mocks.removeWorktree
    }
  }
}));

vi.mock('../TerminalGrid', () => ({
  cleanupWorktreeTerminals: mocks.cleanupWorktreeTerminals
}));

vi.mock('@/services/worktreeAgentCommands', () => ({
  clearAgentCommandForWorktree: mocks.clearAgentCommandForWorktree
}));

const worktreeToDelete = {
  path: '/repo/feature',
  branch: 'refs/heads/feature',
  head: 'abc123'
};

function renderDeleteDialog() {
  return render(
    <WorktreePanelDialogs
      projectPath="/repo"
      selectedWorktree="/repo/feature"
      worktrees={[
        worktreeToDelete,
        { path: '/repo/main', branch: 'refs/heads/main', head: 'def456' }
      ]}
      showNewBranchDialog={false}
      onShowNewBranchDialogChange={vi.fn()}
      onCreateBranch={vi.fn()}
      worktreeToDelete={worktreeToDelete}
      onCancelDelete={vi.fn()}
      onSelectWorktree={vi.fn()}
      onReloadWorktrees={vi.fn()}
    />
  );
}

describe('WorktreePanelDialogs deletion toast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.toast.mockReturnValue({
      id: 'delete-toast',
      update: mocks.toastUpdate,
      dismiss: mocks.toastDismiss
    });
    mocks.terminateForWorktree.mockResolvedValue({ success: true, count: 1 });
  });

  it('auto-closes the deletion toast after all steps succeed', async () => {
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    mocks.removeWorktree.mockResolvedValue({ hook: null });

    renderDeleteDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Permanently' }));

    await waitFor(() => {
      expect(mocks.toastUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          title: 'Deletion Complete',
          variant: 'default'
        })
      );
    });

    const dismissCall = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 2500);
    expect(dismissCall).toBeDefined();
    (dismissCall?.[0] as () => void)();
    expect(mocks.toastDismiss).toHaveBeenCalled();

    setTimeoutSpy.mockRestore();
  });

  it('keeps the deletion toast open when a deletion step fails', async () => {
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    mocks.removeWorktree.mockResolvedValue({
      hook: null,
      warning: 'failed to delete branch feature'
    });

    renderDeleteDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Permanently' }));

    await waitFor(() => {
      expect(mocks.toastUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          title: 'Deletion Failed',
          variant: 'destructive'
        })
      );
    });

    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 2500);
    expect(mocks.toastDismiss).not.toHaveBeenCalled();

    setTimeoutSpy.mockRestore();
  });
});

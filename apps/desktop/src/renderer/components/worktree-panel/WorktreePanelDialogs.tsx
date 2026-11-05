import { useCallback, useState } from 'react';
import { Code2, Terminal } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { DeletionReportingToast } from '../DeletionReportingDialog';
import { cleanupWorktreeTerminals } from '../TerminalGrid';
import { useToast } from '../ui/use-toast';
import { backend } from '@/services/backend';
import { clearAgentCommandForWorktree, type AgentCommand } from '@/services/worktreeAgentCommands';
import type { Worktree, WorktreeDeletionStep } from './types';
import { getDeletionBranchName } from './utils';

const DELETION_TOAST_DURATION = 2_147_483_647;
const DELETION_SUCCESS_DISMISS_DELAY = 2500;

interface WorktreePanelDialogsProps {
  projectPath: string;
  selectedWorktree: string | null;
  worktrees: Worktree[];
  showNewBranchDialog: boolean;
  onShowNewBranchDialogChange: (open: boolean) => void;
  onCreateBranch: (branchName: string, agentCommand: AgentCommand) => Promise<boolean>;
  worktreeToDelete: Worktree | null;
  onCancelDelete: () => void;
  onSelectWorktree: (path: string) => void;
  onReloadWorktrees: () => void;
}

export function WorktreePanelDialogs({
  projectPath,
  selectedWorktree,
  worktrees,
  showNewBranchDialog,
  onShowNewBranchDialogChange,
  onCreateBranch,
  worktreeToDelete,
  onCancelDelete,
  onSelectWorktree,
  onReloadWorktrees
}: WorktreePanelDialogsProps) {
  const { toast } = useToast();
  const [newBranchName, setNewBranchName] = useState('');
  const [agentCommand, setAgentCommand] = useState<AgentCommand>('codex');

  const handleCreateBranch = useCallback(async () => {
    const created = await onCreateBranch(newBranchName, agentCommand);
    if (!created) return;

    onShowNewBranchDialogChange(false);
    setNewBranchName('');
  }, [agentCommand, newBranchName, onCreateBranch, onShowNewBranchDialogChange]);

  const confirmDeleteWorktree = useCallback(async () => {
    if (!worktreeToDelete) return;

    const deletingWorktree = worktreeToDelete;
    const branchName = getDeletionBranchName(deletingWorktree);
    onCancelDelete();

    const deletionSteps: WorktreeDeletionStep[] = [
      { message: 'Killing terminal processes...', status: 'pending' },
      { message: 'Running pre-remove hook...', status: 'pending' },
      { message: 'Removing worktree directory...', status: 'pending' },
      { message: 'Deleting git branch...', status: 'pending' }
    ];
    const deletionToast = toast({
      title: 'Deleting Worktree',
      description: (
        <DeletionReportingToast
          branchName={branchName}
          worktreePath={deletingWorktree.path}
          steps={deletionSteps}
        />
      ),
      duration: DELETION_TOAST_DURATION
    });
    const renderDeletionToast = (isComplete = false) => {
      const hasErrors = deletionSteps.some((step) => step.status === 'error');
      deletionToast.update({
        id: deletionToast.id,
        title: isComplete
          ? hasErrors
            ? 'Deletion Failed'
            : 'Deletion Complete'
          : 'Deleting Worktree',
        description: (
          <DeletionReportingToast
            branchName={branchName}
            worktreePath={deletingWorktree.path}
            steps={deletionSteps.map((step) => ({ ...step }))}
          />
        ),
        duration: DELETION_TOAST_DURATION,
        variant: hasErrors ? 'destructive' : 'default'
      });
    };
    const updateDeletionStep = (index: number, updates: Partial<WorktreeDeletionStep>) => {
      deletionSteps[index] = { ...deletionSteps[index], ...updates };
      renderDeletionToast();
    };

    try {
      updateDeletionStep(0, { status: 'in-progress' });
      try {
        const result = await backend.shell.terminateForWorktree(deletingWorktree.path);
        updateDeletionStep(0, {
          status: 'success',
          message: `Killed ${result.count} terminal process(es)`
        });
      } catch (error) {
        updateDeletionStep(0, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to kill terminal processes'
        });
      }

      cleanupWorktreeTerminals(deletingWorktree.path);
      try {
        await clearAgentCommandForWorktree(deletingWorktree.path);
      } catch (error) {
        console.warn('Failed to clear worktree agent command:', error);
      }

      updateDeletionStep(1, { status: 'in-progress' });
      updateDeletionStep(2, { status: 'in-progress' });
      updateDeletionStep(3, { status: 'in-progress' });

      try {
        const result = await backend.git.removeWorktree(
          projectPath,
          deletingWorktree.path,
          branchName
        );

        if (!result.hook) {
          updateDeletionStep(1, { status: 'success', message: 'No pre-remove hook configured' });
        } else if (result.hook.ok) {
          updateDeletionStep(1, { status: 'success', message: 'Pre-remove hook completed' });
        } else {
          updateDeletionStep(1, {
            status: 'error',
            error: result.hook.timedOut
              ? 'Pre-remove hook timed out (deletion continued)'
              : `Pre-remove hook exited with code ${result.hook.exitCode} (deletion continued)`
          });
        }

        updateDeletionStep(2, { status: 'success' });

        const branchWarning =
          result.warning && result.warning.includes('failed to delete branch')
            ? result.warning
            : undefined;
        if (branchWarning) {
          updateDeletionStep(3, { status: 'error', error: branchWarning });
        } else {
          updateDeletionStep(3, { status: 'success' });
        }
      } catch (error) {
        updateDeletionStep(1, { status: 'error' });
        updateDeletionStep(2, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to remove worktree'
        });
        updateDeletionStep(3, { status: 'error' });
      }

      if (selectedWorktree === deletingWorktree.path) {
        const remainingWorktrees = worktrees.filter(
          (worktree) => worktree.path !== deletingWorktree.path
        );
        if (remainingWorktrees.length > 0) {
          onSelectWorktree(remainingWorktrees[0].path);
        }
      }

      onReloadWorktrees();
    } catch (error) {
      console.error('Unexpected error during deletion:', error);
      deletionSteps.push({
        message: 'Unexpected deletion error',
        status: 'error',
        error: error instanceof Error ? error.message : 'An unexpected error occurred'
      });
    } finally {
      renderDeletionToast(true);
      if (!deletionSteps.some((step) => step.status === 'error')) {
        setTimeout(() => deletionToast.dismiss(), DELETION_SUCCESS_DISMISS_DELAY);
      }
    }
  }, [
    onCancelDelete,
    onReloadWorktrees,
    onSelectWorktree,
    projectPath,
    selectedWorktree,
    toast,
    worktreeToDelete,
    worktrees
  ]);

  return (
    <>
      <Dialog open={showNewBranchDialog} onOpenChange={onShowNewBranchDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Feature Branch</DialogTitle>
            <DialogDescription>
              Creates a git worktree on its own branch, so an agent can work there in isolation
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Input
              placeholder="feature-name"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateBranch();
                }
              }}
            />
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Agent tool</div>
              <Tabs
                value={agentCommand}
                onValueChange={(value) => setAgentCommand(value as AgentCommand)}
              >
                <TabsList className="grid w-full grid-cols-2 h-9">
                  <TabsTrigger value="codex" className="h-7 gap-1.5 text-xs">
                    <Code2 className="h-3.5 w-3.5" />
                    Codex
                  </TabsTrigger>
                  <TabsTrigger value="pi" className="h-7 gap-1.5 text-xs">
                    <Terminal className="h-3.5 w-3.5" />
                    Pi
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onShowNewBranchDialogChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateBranch} disabled={!newBranchName.trim()}>
              Create Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!worktreeToDelete} onOpenChange={(open) => !open && onCancelDelete()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Worktree</DialogTitle>
            <DialogDescription>
              This will permanently delete the worktree and branch. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {worktreeToDelete && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
                <p className="text-sm">
                  <strong>Branch:</strong> {getDeletionBranchName(worktreeToDelete)}
                </p>
                <p className="text-sm">
                  <strong>Path:</strong> {worktreeToDelete.path}
                </p>
                <p className="text-sm text-destructive mt-2">
                  Both the worktree directory and git branch will be permanently deleted.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onCancelDelete}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmDeleteWorktree}
            >
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}

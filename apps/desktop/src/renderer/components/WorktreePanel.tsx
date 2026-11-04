import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { useToast } from './ui/use-toast';
import { WorktreePanelDialogs } from './worktree-panel/WorktreePanelDialogs';
import { WorktreePanelList } from './worktree-panel/WorktreePanelList';
import type { Worktree } from './worktree-panel/types';
import { useWorktreePanelState } from './worktree-panel/useWorktreePanelState';
import { useWorktreePanelWidth } from './worktree-panel/useWorktreePanelWidth';

interface WorktreePanelProps {
  projectPath: string;
  selectedWorktree: string | null;
  onSelectWorktree: (path: string) => void;
  onWorktreesChange?: (worktrees: Worktree[]) => void;
  initialWorktrees?: Worktree[];
}

export function WorktreePanel({
  projectPath,
  selectedWorktree,
  onSelectWorktree,
  onWorktreesChange,
  initialWorktrees
}: WorktreePanelProps) {
  const { toast } = useToast();
  const { panelWidth, isResizing, handleResizeMouseDown } = useWorktreePanelWidth();
  const [showNewBranchDialog, setShowNewBranchDialog] = useState(false);
  const [worktreeToDelete, setWorktreeToDelete] = useState<Worktree | null>(null);
  const { worktrees, refreshing, loadWorktrees, handleCreateBranch } = useWorktreePanelState({
    projectPath,
    onSelectWorktree,
    onWorktreesChange,
    initialWorktrees,
    toast
  });

  useEffect(() => {
    const openDialog = () => setShowNewBranchDialog(true);
    window.addEventListener('vibetree:new-worktree', openDialog);
    return () => window.removeEventListener('vibetree:new-worktree', openDialog);
  }, []);

  const handleDeleteWorktree = useCallback(
    (worktree: Worktree) => {
      if (worktrees.length <= 1) {
        toast({
          title: 'Error',
          description: 'Cannot delete the only remaining worktree',
          variant: 'destructive'
        });
        return;
      }

      setWorktreeToDelete(worktree);
    },
    [toast, worktrees.length]
  );

  return (
    <div
      className="border-r border-border/60 bg-muted/30 flex flex-col h-full relative"
      style={{ width: `${panelWidth}px` }}
    >
      <div className="h-10 pl-3 pr-1.5 border-b border-border/60 flex-shrink-0 flex items-center justify-between gap-2">
        <h3
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate"
          title={projectPath}
        >
          Worktrees
        </h3>
        <div className="flex gap-0.5 text-muted-foreground">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={loadWorktrees}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => setShowNewBranchDialog(true)}
            data-testid="add-worktree-button"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <WorktreePanelList
        projectPath={projectPath}
        worktrees={worktrees}
        selectedWorktree={selectedWorktree}
        onSelectWorktree={onSelectWorktree}
        onDeleteWorktree={handleDeleteWorktree}
        onReloadWorktrees={loadWorktrees}
      />

      <WorktreePanelDialogs
        projectPath={projectPath}
        selectedWorktree={selectedWorktree}
        worktrees={worktrees}
        showNewBranchDialog={showNewBranchDialog}
        onShowNewBranchDialogChange={setShowNewBranchDialog}
        onCreateBranch={handleCreateBranch}
        worktreeToDelete={worktreeToDelete}
        onCancelDelete={() => setWorktreeToDelete(null)}
        onSelectWorktree={onSelectWorktree}
        onReloadWorktrees={loadWorktrees}
      />

      <div
        className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 ${
          isResizing ? 'bg-blue-500' : 'bg-transparent'
        } transition-colors`}
        onMouseDown={handleResizeMouseDown}
        title="Drag to resize"
      />
    </div>
  );
}

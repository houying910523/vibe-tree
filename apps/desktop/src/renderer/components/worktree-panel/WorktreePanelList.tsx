import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, GitBranch, Trash2 } from 'lucide-react';
import { backend } from '@/services/backend';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/dropdown-menu';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { useToast } from '../ui/use-toast';
import type { Worktree } from './types';
import {
  canDeleteWorktree,
  getWorktreeBranchName,
  getWorktreeDisplayName,
  sortWorktrees
} from './utils';

interface WorktreePanelListProps {
  projectPath: string;
  worktrees: Worktree[];
  selectedWorktree: string | null;
  onSelectWorktree: (path: string) => void;
  onDeleteWorktree: (worktree: Worktree) => void;
  onReloadWorktrees: () => void;
}

export function WorktreePanelList({
  projectPath,
  worktrees,
  selectedWorktree,
  onSelectWorktree,
  onDeleteWorktree,
  onReloadWorktrees
}: WorktreePanelListProps) {
  const { toast } = useToast();
  const [changeCounts, setChangeCounts] = useState<Record<string, number>>({});
  const [worktreeSessionCounts, setWorktreeSessionCounts] = useState<Record<string, number>>({});
  const [operatingWorktree, setOperatingWorktree] = useState<string | null>(null);
  const sortedWorktrees = useMemo(() => sortWorktrees(worktrees), [worktrees]);

  useEffect(() => {
    let cancelled = false;

    const refreshStatuses = async () => {
      const entries = await Promise.all(
        worktrees.map(async (worktree) => {
          try {
            const status = await backend.git.status(worktree.path);
            return [worktree.path, status.length] as const;
          } catch {
            return [worktree.path, -1] as const;
          }
        })
      );

      if (cancelled) return;

      const next: Record<string, number> = {};
      for (const [path, count] of entries) {
        if (count >= 0) next[path] = count;
      }
      setChangeCounts(next);
    };

    refreshStatuses();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshStatuses();
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [worktrees]);

  useEffect(() => {
    backend.shell.getWorktreeSessions().then(setWorktreeSessionCounts);
    const unsubscribe = backend.shell.onSessionsChanged((sessions) => {
      setWorktreeSessionCounts(sessions);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleWorktreeGitOperation = useCallback(
    async (worktree: Worktree, operation: 'merge' | 'rebase') => {
      setOperatingWorktree(worktree.path);
      try {
        const result =
          operation === 'merge'
            ? await backend.git.mergeWorktreeIntoRoot(projectPath, worktree.path)
            : await backend.git.rebaseWorktreeOntoRoot(projectPath, worktree.path);

        toast({
          title: operation === 'merge' ? 'Merge complete' : 'Rebase complete',
          description:
            operation === 'merge'
              ? `Merged ${result.sourceBranch} into ${result.targetBranch}`
              : `Rebased ${result.sourceBranch} onto ${result.targetBranch}`
        });
        onReloadWorktrees();
      } catch (error) {
        toast({
          title: operation === 'merge' ? 'Merge failed' : 'Rebase failed',
          description: `${error instanceof Error ? error.message : 'Git command failed'}。命令已中断，请在终端中手动处理。`,
          variant: 'destructive'
        });
      } finally {
        setOperatingWorktree(null);
      }
    },
    [onReloadWorktrees, projectPath, toast]
  );

  const renderWorktreeStatus = useCallback(
    (worktree: Worktree, canShowActions: boolean) => {
      const changeCount = changeCounts[worktree.path];

      return (
        <span
          className={`ml-auto flex items-center gap-1.5 flex-shrink-0 transition-opacity ${
            canShowActions ? 'group-hover:opacity-0' : ''
          }`}
        >
          {worktreeSessionCounts[worktree.path] > 0 && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-green-500"
              data-testid="live-session-dot"
              aria-label="Live session"
            />
          )}
          {changeCount !== undefined &&
            (changeCount > 0 ? (
              <span
                className="min-w-5 h-4 px-1 inline-flex items-center justify-center rounded-full border text-[10px] font-medium tabular-nums"
                title={`${changeCount} changed file${changeCount === 1 ? '' : 's'}`}
              >
                {changeCount}
              </span>
            ) : (
              <Check className="h-3 w-3 opacity-40" aria-label="Clean worktree" />
            ))}
        </span>
      );
    },
    [changeCounts, worktreeSessionCounts]
  );

  return (
    <ScrollArea className="flex-1 h-0">
      <div className="p-2">
        {sortedWorktrees.map((worktree) => {
          const branchName = getWorktreeBranchName(worktree);
          const isSelected = selectedWorktree === worktree.path;
          const canShowActions = canDeleteWorktree(worktree, worktrees.length);

          return (
            <div key={worktree.path} className="relative group">
              <button
                onClick={() => onSelectWorktree(worktree.path)}
                className={`w-full text-left px-2 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
                  isSelected
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
                data-worktree-branch={branchName}
              >
                <GitBranch className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="font-mono text-[13px] font-medium truncate">
                  {getWorktreeDisplayName(worktree)}
                </span>
                {renderWorktreeStatus(worktree, canShowActions)}
              </button>
              {canShowActions && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                      data-testid="worktree-actions-button"
                      aria-label="Open worktree actions"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      disabled={!!operatingWorktree}
                      onSelect={() => handleWorktreeGitOperation(worktree, 'merge')}
                    >
                      Merge
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!!operatingWorktree}
                      onSelect={() => handleWorktreeGitOperation(worktree, 'rebase')}
                    >
                      Rebase
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => onDeleteWorktree(worktree)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> 删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

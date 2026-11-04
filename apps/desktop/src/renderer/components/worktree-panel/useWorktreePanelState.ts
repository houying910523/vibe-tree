import { useCallback, useEffect, useState } from 'react';
import { backend } from '@/services/backend';
import { setAgentCommandForWorktree, type AgentCommand } from '@/services/worktreeAgentCommands';
import type { Worktree } from './types';

type ToastFn = (props: {
  title: string;
  description: string;
  variant?: 'default' | 'destructive';
}) => void;

interface UseWorktreePanelStateArgs {
  projectPath: string;
  onSelectWorktree: (path: string) => void;
  onWorktreesChange?: (worktrees: Worktree[]) => void;
  initialWorktrees?: Worktree[];
  toast: ToastFn;
}

export function useWorktreePanelState({
  projectPath,
  onSelectWorktree,
  onWorktreesChange,
  initialWorktrees,
  toast
}: UseWorktreePanelStateArgs) {
  const [worktrees, setWorktrees] = useState<Worktree[]>(initialWorktrees || []);
  const [refreshing, setRefreshing] = useState(false);

  const loadWorktrees = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await backend.git.listWorktrees(projectPath);
      const trees = result.map((worktree) => ({
        path: worktree.path,
        head: worktree.head,
        branch: worktree.branch ?? ''
      }));
      setWorktrees(trees);
      onWorktreesChange?.(trees);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load worktrees. Make sure this is a git repository.',
        variant: 'destructive'
      });
    }
    setRefreshing(false);
  }, [onWorktreesChange, projectPath, toast]);

  useEffect(() => {
    loadWorktrees();
  }, [loadWorktrees]);

  useEffect(() => {
    if (initialWorktrees && initialWorktrees.length > 0) {
      setWorktrees(initialWorktrees);
    }
  }, [initialWorktrees]);

  useEffect(() => {
    const unsubscribe = backend.git.onWorktreeHookFinished((event) => {
      if (event.projectPath !== projectPath) return;

      if (event.hook.ok) {
        toast({
          title: 'Setup hook complete',
          description: `Setup hook finished for branch ${event.branch}`
        });
        return;
      }

      toast({
        title: 'Setup hook failed',
        description: event.hook.timedOut
          ? `Setup hook timed out for branch ${event.branch}.`
          : `Setup hook exited with code ${event.hook.exitCode} for branch ${event.branch}.`,
        variant: 'destructive'
      });
    });

    return () => {
      unsubscribe();
    };
  }, [projectPath, toast]);

  const handleCreateBranch = useCallback(
    async (branchName: string, agentCommand: AgentCommand) => {
      if (!branchName.trim()) return false;

      try {
        const result = await backend.git.addWorktree(projectPath, branchName);
        setAgentCommandForWorktree(result.path, agentCommand);
        if (result.hook && !result.hook.ok) {
          toast({
            title: 'Worktree created, setup hook failed',
            description: result.hook.timedOut
              ? 'The configured worktree setup hook timed out.'
              : `The configured worktree setup hook exited with code ${result.hook.exitCode}.`,
            variant: 'destructive'
          });
        } else {
          toast({
            title: 'Success',
            description: result.hook
              ? `Created worktree for branch ${result.branch} (setup hook ran)`
              : result.hookStarted
                ? `Created worktree for branch ${result.branch} (setup hook running)`
                : `Created worktree for branch ${result.branch}`
          });
        }
        loadWorktrees();
        onSelectWorktree(result.path);
        return true;
      } catch (error) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to create worktree',
          variant: 'destructive'
        });
        return false;
      }
    },
    [loadWorktrees, onSelectWorktree, projectPath, toast]
  );

  return {
    worktrees,
    refreshing,
    loadWorktrees,
    handleCreateBranch
  };
}

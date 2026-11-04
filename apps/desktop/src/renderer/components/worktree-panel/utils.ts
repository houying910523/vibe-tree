import { isProtectedBranch } from '@/utils/worktree';
import type { Worktree } from './types';

const BRANCH_PREFIX = 'refs/heads/';
const PINNED_BRANCHES = new Set(['main', 'master']);

export function getWorktreeBranchName(worktree: Pick<Worktree, 'branch' | 'head'>) {
  return worktree.branch
    ? worktree.branch.replace(BRANCH_PREFIX, '')
    : worktree.head.substring(0, 8);
}

export function getWorktreeDisplayName(worktree: Pick<Worktree, 'branch' | 'head'>) {
  return worktree.branch
    ? getWorktreeBranchName(worktree)
    : `detached (${worktree.head.substring(0, 8)})`;
}

export function getDeletionBranchName(worktree: Pick<Worktree, 'branch'>) {
  return worktree.branch.replace(BRANCH_PREFIX, '');
}

export function canDeleteWorktree(worktree: Pick<Worktree, 'branch'>, worktreeCount: number) {
  return worktreeCount > 1 && !!worktree.branch && !isProtectedBranch(worktree.branch);
}

export function sortWorktrees(worktrees: Worktree[]) {
  return [...worktrees].sort((a, b) => {
    const branchA = getWorktreeBranchName(a);
    const branchB = getWorktreeBranchName(b);
    const branchAPinned = PINNED_BRANCHES.has(branchA);
    const branchBPinned = PINNED_BRANCHES.has(branchB);

    if (branchAPinned !== branchBPinned) {
      return branchAPinned ? -1 : 1;
    }

    return branchA.localeCompare(branchB);
  });
}

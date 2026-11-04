export interface Worktree {
  path: string;
  branch: string;
  head: string;
}

export interface WorktreeDeletionStep {
  message: string;
  status: 'pending' | 'in-progress' | 'success' | 'error';
  error?: string;
}

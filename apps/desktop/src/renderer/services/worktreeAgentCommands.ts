export type AgentCommand = 'codex' | 'pi';

const worktreeAgentCommands = new Map<string, AgentCommand>();

export function setAgentCommandForWorktree(worktreePath: string, command: AgentCommand): void {
  worktreeAgentCommands.set(worktreePath, command);
}

export function getAgentCommandForWorktree(worktreePath: string): AgentCommand | undefined {
  return worktreeAgentCommands.get(worktreePath);
}

export function clearAgentCommandForWorktree(worktreePath: string): void {
  worktreeAgentCommands.delete(worktreePath);
}

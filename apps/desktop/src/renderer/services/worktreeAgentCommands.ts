import { backend } from './backend';

export type AgentCommand = 'codex' | 'pi';

const worktreeAgentCommands = new Map<string, AgentCommand>();

function isAgentCommand(value: unknown): value is AgentCommand {
  return value === 'codex' || value === 'pi';
}

export async function setAgentCommandForWorktree(
  worktreePath: string,
  command: AgentCommand
): Promise<void> {
  worktreeAgentCommands.set(worktreePath, command);
  await backend.projectConfig.update(worktreePath, { agentCommand: command });
}

export async function getAgentCommandForWorktree(
  worktreePath: string
): Promise<AgentCommand | undefined> {
  const cached = worktreeAgentCommands.get(worktreePath);
  if (cached) return cached;

  const config = await backend.projectConfig.get(worktreePath);
  if (!isAgentCommand(config.agentCommand)) return undefined;

  worktreeAgentCommands.set(worktreePath, config.agentCommand);
  return config.agentCommand;
}

export async function clearAgentCommandForWorktree(worktreePath: string): Promise<void> {
  const command = await getAgentCommandForWorktree(worktreePath);
  worktreeAgentCommands.delete(worktreePath);
  if (command) {
    await backend.projectConfig.update(worktreePath, { agentCommand: undefined });
  }
}

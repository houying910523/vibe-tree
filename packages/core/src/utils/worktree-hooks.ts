import { spawn, type SpawnOptions } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import type { HookResult } from '../types';

export type WorktreeHookName = 'post-create' | 'pre-remove';

const HOOK_TIMEOUT_MS = 120000;
const MAX_OUTPUT_LENGTH = 65536;
const HOOK_CONFIG_PATH = path.join('.vibetree', 'git-hook.yml');
const FALLBACK_PATH_SEGMENTS =
  process.platform === 'win32'
    ? [
        process.env.PATH || '',
        process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : '',
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'pnpm') : '',
        'C:\\Program Files\\nodejs'
      ]
    : [process.env.PATH || '', '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];

export interface WorktreeHookContext {
  projectPath: string;
  worktreePath: string;
  branch: string;
}

function isInsideProject(projectPath: string, candidatePath: string): boolean {
  const realProject = fs.realpathSync(projectPath);
  return candidatePath === realProject || candidatePath.startsWith(realProject + path.sep);
}

function resolveProjectFile(projectPath: string, relativePath: string): string | null {
  const candidatePath = path.join(projectPath, relativePath);

  let realCandidatePath: string;
  try {
    realCandidatePath = fs.realpathSync(candidatePath);
  } catch {
    return null;
  }

  if (!isInsideProject(projectPath, realCandidatePath)) {
    console.warn(`Ignoring ${relativePath} outside project: ${realCandidatePath}`);
    return null;
  }

  return realCandidatePath;
}

function readConfiguredWorktreeHookCommand(
  projectPath: string,
  name: WorktreeHookName,
  log: boolean = true
): string | null {
  const configPath = resolveProjectFile(projectPath, HOOK_CONFIG_PATH);
  if (!configPath) return null;

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = parse(raw) as {
      worktree?: {
        add?: { 'post-hook'?: unknown };
        remove?: { 'pre-hook'?: unknown };
      };
    } | null;

    const configuredCommand =
      name === 'post-create'
        ? parsed?.worktree?.add?.['post-hook']
        : parsed?.worktree?.remove?.['pre-hook'];

    if (typeof configuredCommand !== 'string') {
      if (log) console.log(`[worktree-hook] No configured ${name} hook found in ${configPath}`);
      return null;
    }

    const trimmedCommand = configuredCommand.trim();
    if (trimmedCommand.length === 0) {
      if (log) {
        console.log(`[worktree-hook] Ignoring empty configured ${name} hook in ${configPath}`);
      }
      return null;
    }

    if (log) console.log(`[worktree-hook] Loaded configured ${name} hook from ${configPath}`);
    return trimmedCommand;
  } catch (error) {
    if (log) {
      console.warn(
        `Ignoring malformed ${HOOK_CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return null;
  }
}

function buildHookEnv(name: WorktreeHookName, context: WorktreeHookContext): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: FALLBACK_PATH_SEGMENTS.filter(Boolean).join(path.delimiter),
    VIBETREE_HOOK: name,
    VIBETREE_PROJECT_PATH: context.projectPath,
    VIBETREE_WORKTREE_PATH: context.worktreePath,
    VIBETREE_BRANCH: context.branch
  };
}

function summarizeHookOutput(output: string): string {
  if (!output) return '(no output)';
  return output.length > 2000 ? `${output.slice(0, 2000)}…` : output;
}

function runHookProcess(
  command: string,
  args: string[],
  options: SpawnOptions,
  name: WorktreeHookName,
  context: WorktreeHookContext,
  timeoutMs: number,
  launchErrorPrefix: string
): Promise<HookResult> {
  return new Promise((resolve) => {
    let output = '';
    let timedOut = false;
    let settled = false;

    const finish = (result: HookResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.log(
        `[worktree-hook] Finished ${name} for ${context.worktreePath} ok=${result.ok} exitCode=${result.exitCode} timedOut=${result.timedOut} output=${JSON.stringify(summarizeHookOutput(result.output))}`
      );
      resolve(result);
    };

    const append = (chunk: Buffer | string) => {
      if (output.length >= MAX_OUTPUT_LENGTH) return;
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      output += text.slice(0, MAX_OUTPUT_LENGTH - output.length);
    };

    console.log(
      `[worktree-hook] Starting ${name} for ${context.worktreePath} command=${JSON.stringify(command)} args=${JSON.stringify(args)} cwd=${JSON.stringify(context.worktreePath)} shell=${options.shell === true} branch=${JSON.stringify(context.branch)}`
    );

    const child = spawn(command, args, {
      cwd: context.worktreePath,
      detached: process.platform !== 'win32',
      env: buildHookEnv(name, context),
      ...options
    });

    const timer = setTimeout(() => {
      timedOut = true;
      console.warn(
        `[worktree-hook] ${name} timed out after ${timeoutMs}ms for ${context.worktreePath}`
      );
      if (process.platform !== 'win32' && child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      } else {
        child.kill('SIGKILL');
      }
    }, timeoutMs);

    child.stdout?.on('data', append);
    child.stderr?.on('data', append);

    child.on('error', (error) => {
      console.warn(
        `[worktree-hook] Failed to start ${name} for ${context.worktreePath}: ${error.message}`
      );
      finish({
        name,
        ok: false,
        exitCode: null,
        timedOut: false,
        output: `${launchErrorPrefix}${error.message}`
      });
    });

    child.on('close', (code) => {
      finish({
        name,
        ok: !timedOut && code === 0,
        exitCode: code,
        timedOut,
        output: output.trim()
      });
    });
  });
}

/**
 * Find a legacy executable lifecycle hook for a project.
 *
 * Hooks live at .vibetree/hooks/<name> in the main repository, following the
 * git-hooks trust model: creating an executable file there is the opt-in.
 */
export function findWorktreeHook(projectPath: string, name: WorktreeHookName): string | null {
  const hooksDir = path.join(projectPath, '.vibetree', 'hooks');

  let realHooksDir: string;
  try {
    realHooksDir = fs.realpathSync(hooksDir);
  } catch {
    return null;
  }

  // Refuse a hooks directory symlinked outside the project: a hostile
  // checkout should not be able to point hooks at arbitrary scripts
  if (!isInsideProject(projectPath, realHooksDir)) {
    console.warn(`Ignoring .vibetree/hooks outside project: ${realHooksDir}`);
    return null;
  }

  const hookPath = path.join(realHooksDir, name);
  try {
    const stat = fs.statSync(hookPath);
    if (!stat.isFile()) return null;
    // On POSIX the executable bit is the explicit opt-in
    if (process.platform !== 'win32') {
      fs.accessSync(hookPath, fs.constants.X_OK);
    }
    return hookPath;
  } catch {
    return null;
  }
}

export function hasWorktreeHook(projectPath: string, name: WorktreeHookName): boolean {
  return (
    readConfiguredWorktreeHookCommand(projectPath, name, false) !== null ||
    findWorktreeHook(projectPath, name) !== null
  );
}

/**
 * Run a legacy executable lifecycle hook with the worktree as cwd. Output
 * (both streams) is captured and capped; the hook is killed after a timeout
 * so a hung script cannot wedge worktree operations.
 */
export function runWorktreeHook(
  hookPath: string,
  name: WorktreeHookName,
  context: WorktreeHookContext,
  timeoutMs: number = HOOK_TIMEOUT_MS
): Promise<HookResult> {
  return runHookProcess(hookPath, [], {}, name, context, timeoutMs, 'Failed to run hook: ');
}

function runConfiguredWorktreeHook(
  command: string,
  name: WorktreeHookName,
  context: WorktreeHookContext,
  timeoutMs: number = HOOK_TIMEOUT_MS
): Promise<HookResult> {
  return runHookProcess(
    command,
    [],
    { shell: true },
    name,
    context,
    timeoutMs,
    'Failed to run configured hook: '
  );
}

/**
 * Find and run a hook if the project defines one. Prefers .vibetree/git-hook.yml
 * command configuration, then falls back to the legacy executable script.
 * Returns undefined when no hook exists, so callers can tell "no hook" from
 * "hook ran".
 */
export async function runWorktreeHookIfPresent(
  name: WorktreeHookName,
  context: WorktreeHookContext,
  timeoutMs?: number
): Promise<HookResult | undefined> {
  const configuredCommand = readConfiguredWorktreeHookCommand(context.projectPath, name);
  if (configuredCommand) {
    console.log(`[worktree-hook] Running configured ${name} hook for ${context.worktreePath}`);
    return runConfiguredWorktreeHook(configuredCommand, name, context, timeoutMs);
  }

  const hookPath = findWorktreeHook(context.projectPath, name);
  if (!hookPath) {
    console.log(`[worktree-hook] No ${name} hook configured for ${context.worktreePath}`);
    return undefined;
  }

  console.log(
    `[worktree-hook] Running legacy ${name} hook at ${hookPath} for ${context.worktreePath}`
  );
  return runWorktreeHook(hookPath, name, context, timeoutMs);
}

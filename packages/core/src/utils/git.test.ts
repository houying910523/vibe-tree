import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  addWorktree,
  executeGitCommand,
  mergeWorktreeIntoRoot,
  rebaseWorktreeOntoRoot
} from './git';

async function writeAndCommit(
  repoPath: string,
  fileName: string,
  content: string,
  message: string
) {
  fs.writeFileSync(path.join(repoPath, fileName), content);
  await executeGitCommand(['add', fileName], repoPath);
  await executeGitCommand(['commit', '-m', message], repoPath);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function waitFor(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForFile(filePath: string): Promise<void> {
  await waitFor(() => fs.existsSync(filePath), filePath);
}

describe('worktree branch operations', () => {
  let tmpDir: string;
  let projectPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibetree-git-'));
    projectPath = path.join(tmpDir, 'repo');
    fs.mkdirSync(projectPath);

    await executeGitCommand(['init', '-b', 'main'], projectPath);
    await executeGitCommand(['config', 'user.email', 'test@example.com'], projectPath);
    await executeGitCommand(['config', 'user.name', 'Test User'], projectPath);
    await writeAndCommit(projectPath, 'README.md', 'root\n', 'initial');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('merges the selected worktree branch into the root branch', async () => {
    const featurePath = path.join(tmpDir, 'repo-feature');
    await executeGitCommand(['worktree', 'add', '-b', 'feature', featurePath], projectPath);
    await writeAndCommit(featurePath, 'feature.txt', 'feature\n', 'feature commit');

    const result = await mergeWorktreeIntoRoot(projectPath, featurePath);

    expect(result).toMatchObject({ success: true, sourceBranch: 'feature', targetBranch: 'main' });
    expect(fs.readFileSync(path.join(projectPath, 'feature.txt'), 'utf8')).toBe('feature\n');
  });

  it('rebases the selected worktree branch onto the root branch', async () => {
    const featurePath = path.join(tmpDir, 'repo-feature');
    await executeGitCommand(['worktree', 'add', '-b', 'feature', featurePath], projectPath);
    await writeAndCommit(featurePath, 'feature.txt', 'feature\n', 'feature commit');
    await writeAndCommit(projectPath, 'root.txt', 'root change\n', 'root commit');

    const result = await rebaseWorktreeOntoRoot(projectPath, featurePath);
    const mainHead = (await executeGitCommand(['rev-parse', 'main'], projectPath)).trim();
    const mergeBase = (
      await executeGitCommand(['merge-base', 'feature', 'main'], projectPath)
    ).trim();

    expect(result).toMatchObject({ success: true, sourceBranch: 'feature', targetBranch: 'main' });
    expect(mergeBase).toBe(mainHead);
  });

  it('returns after creating the worktree while the post-create hook continues', async () => {
    const markerPath = path.join(tmpDir, 'post-create-finished');
    const configPath = path.join(projectPath, '.vibetree', 'git-hook.yml');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      `worktree:\n  add:\n    post-hook: sleep 1 && printf done > ${shellQuote(markerPath)}\n`
    );

    const hookEvents: unknown[] = [];
    const result = await addWorktree(projectPath, 'async-hook', {
      onHookFinished: (event) => hookEvents.push(event)
    });

    expect(result).toMatchObject({ branch: 'async-hook', hookStarted: true });
    expect(fs.existsSync(markerPath)).toBe(false);

    await waitForFile(markerPath);
    expect(fs.readFileSync(markerPath, 'utf8')).toBe('done');
    await waitFor(() => hookEvents.length === 1, 'hook completion event');
    expect(hookEvents[0]).toMatchObject({
      projectPath,
      worktreePath: result.path,
      branch: 'async-hook',
      hook: { name: 'post-create', ok: true, exitCode: 0 }
    });
  });
});

describe('executeGitCommand locking', () => {
  let tmpDir: string;
  let oldPath: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibetree-git-locking-'));
    oldPath = process.env.PATH;
  });

  afterEach(() => {
    process.env.PATH = oldPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function importWithFakeGit(script: string) {
    const binDir = path.join(tmpDir, 'bin');
    fs.mkdirSync(binDir);
    const gitPath = path.join(binDir, 'git');
    fs.writeFileSync(gitPath, script);
    fs.chmodSync(gitPath, 0o755);
    process.env.PATH = [binDir, oldPath].filter(Boolean).join(path.delimiter);
    vi.resetModules();
    return import('./git');
  }

  it('runs status without optional git locks', async () => {
    const markerPath = path.join(tmpDir, 'optional-locks');
    const { executeGitCommand } = await importWithFakeGit(`#!/bin/sh
printf '%s' "$GIT_OPTIONAL_LOCKS" > '${markerPath}'
`);

    await executeGitCommand(['status', '--porcelain=v1'], tmpDir);

    expect(fs.readFileSync(markerPath, 'utf8')).toBe('0');
  });

  it('serializes mutating git commands', async () => {
    const lockPath = path.join(tmpDir, 'fake-git.lock');
    const racePath = path.join(tmpDir, 'race');
    const { executeGitCommand } = await importWithFakeGit(`#!/bin/sh
if [ -e '${lockPath}' ]; then
  printf race > '${racePath}'
  exit 1
fi
touch '${lockPath}'
sleep 0.1
rm '${lockPath}'
`);

    await Promise.all([
      executeGitCommand(['merge', 'refs/heads/a'], tmpDir),
      executeGitCommand(['merge', 'refs/heads/b'], tmpDir)
    ]);

    expect(fs.existsSync(racePath)).toBe(false);
  });
});

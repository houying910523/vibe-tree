import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeGitCommand, mergeWorktreeIntoRoot, rebaseWorktreeOntoRoot } from './git';

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
});

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitDiffView } from './GitDiffView';

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  diff: vi.fn(),
  diffStaged: vi.fn(),
  diffView: vi.fn()
}));

vi.mock('../services/backend', () => ({
  backend: {
    git: {
      status: mocks.status,
      diff: mocks.diff,
      diffStaged: mocks.diffStaged
    }
  }
}));

vi.mock('@git-diff-view/react', () => ({
  DiffModeEnum: { Split: 'split' },
  DiffView: (props: { data: { hunks: string[] } }) => mocks.diffView(props)
}));

describe('GitDiffView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status.mockResolvedValue([
      { path: 'Makefile', status: 'UU', staged: true, modified: true }
    ]);
    mocks.diffView.mockImplementation((props: { data: { hunks: string[] } }) => (
      <div data-testid="diff-view">{props.data.hunks[0]}</div>
    ));
  });

  it('shows a local fallback for combined merge-conflict diffs', async () => {
    mocks.diff.mockResolvedValue(`diff --cc Makefile
index 0a16334f7,88de3be15..000000000
--- a/Makefile
+++ b/Makefile
@@@ -2,10 -2,8 +2,14 @@@
+<<<<<<< HEAD
+=======
+>>>>>>> branch
`);

    render(<GitDiffView worktreePath="/repo" />);

    expect(await screen.findByText('Merge conflict diff is not supported')).toBeInTheDocument();
    expect(mocks.diffView).not.toHaveBeenCalled();
  });

  it('keeps the diff tab mounted when the diff renderer throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.diff.mockResolvedValue(`diff --git a/Makefile b/Makefile
--- a/Makefile
+++ b/Makefile
@@ -1 +1 @@
-old
+new
`);
    mocks.diffView.mockImplementation(() => {
      throw new Error('renderer failed');
    });

    render(<GitDiffView worktreePath="/repo" />);

    expect(await screen.findByText('Unable to render this diff')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('/repo')).toBeInTheDocument();
    });
    consoleError.mockRestore();
  });
});

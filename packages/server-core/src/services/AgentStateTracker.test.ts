import { describe, expect, it } from 'vitest';
import { AgentStateTracker } from './AgentStateTracker';

describe('AgentStateTracker', () => {
  it('uses Codex patterns after a Codex command is submitted', () => {
    const tracker = new AgentStateTracker();

    tracker.register('session-1', '/tmp/worktree');
    tracker.handleInput('session-1', 'codex\r');
    tracker.handleOutput('session-1', 'Worked for 28m 38s • 21:27');

    expect(tracker.getStates()['session-1']).toEqual({
      worktreePath: '/tmp/worktree',
      state: 'done'
    });
  });
});

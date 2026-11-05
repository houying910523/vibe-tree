import { describe, it, expect } from 'vitest';
import {
  AGENT_NOTIFICATION_CONFIGS,
  AgentActivityMonitor,
  getAgentNotificationConfigForCommand,
  stripAnsi
} from './agent-activity';

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);

describe('stripAnsi', () => {
  it('removes CSI sequences and control characters', () => {
    expect(stripAnsi(`${ESC}[31mred${ESC}[0m`)).toBe('red');
    expect(stripAnsi(`${ESC}]0;title${BEL}text`)).toBe('text');
    expect(stripAnsi('plain')).toBe('plain');
  });
});

describe('AgentActivityMonitor', () => {
  it('fires completed only after user input marked the session working', () => {
    const monitor = new AgentActivityMonitor();

    // Replayed scrollback with a completion hint must not fire
    expect(monitor.processOutput('press ↵ send')).toBeNull();

    monitor.markUserInput();
    expect(monitor.processOutput('press ↵ send')).toBe('completed');
  });

  it('fires question when the CLI asks for confirmation', () => {
    const monitor = new AgentActivityMonitor();
    monitor.markUserInput();
    expect(monitor.processOutput('Do you want to proceed? [y/N]')).toBe('question');
  });

  it('fires only once per prompt', () => {
    const monitor = new AgentActivityMonitor();
    monitor.markUserInput();
    expect(monitor.processOutput('↵ send')).toBe('completed');
    // Redraws of the same completed prompt stay silent
    expect(monitor.processOutput('other output')).toBeNull();
    expect(monitor.processOutput('↵ send')).toBeNull();

    // The next prompt re-arms it
    monitor.markUserInput();
    expect(monitor.processOutput('↵ send')).toBe('completed');
  });

  it('prioritizes question over completion in the same chunk', () => {
    const monitor = new AgentActivityMonitor();
    monitor.markUserInput();
    expect(monitor.processOutput('Do you want to proceed? [y/N]\n↵ send')).toBe('question');
  });

  it('ignores ANSI-decorated noise', () => {
    const monitor = new AgentActivityMonitor();
    monitor.markUserInput();
    expect(monitor.processOutput(`${ESC}[2K${ESC}[1G`)).toBeNull();
    expect(monitor.processOutput(`${ESC}[32m↵ send${ESC}[0m`)).toBe('completed');
  });

  it('uses configured Codex patterns', () => {
    const monitor = new AgentActivityMonitor(AGENT_NOTIFICATION_CONFIGS.codex);
    monitor.markUserInput();
    expect(monitor.processOutput('Worked for 28m 38s • 21:27')).toBe('completed');

    monitor.markUserInput();
    expect(monitor.processOutput('Would you like to run the following command?')).toBe('question');
  });
});

describe('agent notification configs', () => {
  it('detects commands for supported agents', () => {
    expect(getAgentNotificationConfigForCommand('codex')?.kind).toBe('codex');
    expect(getAgentNotificationConfigForCommand('/usr/local/bin/claude --continue')?.kind).toBe(
      'claude'
    );
    expect(getAgentNotificationConfigForCommand('python script.py')).toBeNull();
  });

  it('matches Codex completion and question output', () => {
    const codex = AGENT_NOTIFICATION_CONFIGS.codex;

    expect(codex.completionPatterns.some((pattern) => pattern.test('Worked for 28m 38s • 21:27')))
      .toBe(true);
    expect(
      codex.questionPatterns.some((pattern) =>
        pattern.test('Would you like to run the following command?')
      )
    ).toBe(true);
    expect(
      codex.questionPatterns.some((pattern) =>
        pattern.test('Would you like to run the folloing command?')
      )
    ).toBe(true);
  });
});

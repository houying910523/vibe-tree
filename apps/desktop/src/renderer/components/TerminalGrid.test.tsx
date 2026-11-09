import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TerminalGrid } from './TerminalGrid';

vi.mock('react-reverse-portal', () => ({
  createHtmlPortalNode: () => ({}),
  InPortal: ({ children }: { children: ReactNode }) => children,
  OutPortal: () => null
}));

vi.mock('./Terminal', () => ({
  Terminal: ({ terminalId }: { terminalId?: string }) => (
    <div data-testid="terminal" data-terminal-id={terminalId} />
  )
}));

vi.mock('@/services/backend', () => ({
  backend: { shell: {} }
}));

describe('TerminalGrid', () => {
  it('renders Agent and regular terminal portals only once when both tabs stay mounted', async () => {
    render(
      <>
        <TerminalGrid worktreePath="/repo" />
        <TerminalGrid worktreePath="/repo" cacheKey="/repo:agent" initialCommand="codex" />
      </>
    );

    await waitFor(() => expect(screen.getAllByTestId('terminal')).toHaveLength(2));
  });
});

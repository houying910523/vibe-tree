import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TitleBar } from './TitleBar';

describe('TitleBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggles window maximize on titlebar double click', () => {
    render(<TitleBar theme="dark" onThemeToggle={vi.fn()} />);

    fireEvent.doubleClick(screen.getByTestId('titlebar'));

    expect(window.electronAPI.window.toggleMaximized).toHaveBeenCalledTimes(1);
  });

  it('does not maximize when double clicking a titlebar control', () => {
    render(<TitleBar theme="dark" onThemeToggle={vi.fn()} />);

    fireEvent.doubleClick(screen.getByTitle('Toggle theme'));

    expect(window.electronAPI.window.toggleMaximized).not.toHaveBeenCalled();
  });

  it('does not maximize when double clicking child controls', () => {
    render(
      <TitleBar theme="dark" onThemeToggle={vi.fn()}>
        <button>Project</button>
      </TitleBar>
    );

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Project' }));

    expect(window.electronAPI.window.toggleMaximized).not.toHaveBeenCalled();
  });
});

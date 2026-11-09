import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectSelector } from './ProjectSelector';

const recentProjects = [
  { path: '/projects/alpha', name: 'alpha', lastOpened: 2000 },
  { path: '/projects/beta', name: 'beta', lastOpened: 1000 }
];

describe('ProjectSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(window.electronAPI.recentProjects.get).mockResolvedValue(recentProjects);
    vi.mocked(window.electronAPI.recentProjects.remove).mockResolvedValue();
  });

  it('opens a recent project only after it is selected', async () => {
    const onSelectProject = vi.fn();
    render(<ProjectSelector onSelectProject={onSelectProject} />);

    expect(onSelectProject).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /alpha/i }));

    expect(onSelectProject).toHaveBeenCalledWith('/projects/alpha');
  });

  it('removes a recent project from the start page list', async () => {
    render(<ProjectSelector onSelectProject={vi.fn()} canRemoveRecentProjects />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Remove alpha from recent projects' })
    );

    await waitFor(() => {
      expect(window.electronAPI.recentProjects.remove).toHaveBeenCalledWith('/projects/alpha');
      expect(screen.queryByText('/projects/alpha')).not.toBeInTheDocument();
    });
    expect(screen.getByText('/projects/beta')).toBeInTheDocument();
  });

  it('keeps filesystem selection available', async () => {
    const onSelectProject = vi.fn();
    vi.mocked(window.electronAPI.dialog.selectDirectory).mockResolvedValue('/projects/new');
    render(<ProjectSelector onSelectProject={onSelectProject} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Project Folder' }));

    await waitFor(() => expect(onSelectProject).toHaveBeenCalledWith('/projects/new'));
  });
});

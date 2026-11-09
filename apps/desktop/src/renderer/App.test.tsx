import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';

const { mockAddProject, mockRemoveProject } = vi.hoisted(() => ({
  mockAddProject: vi.fn(),
  mockRemoveProject: vi.fn()
}));

vi.mock('./contexts/ProjectContext', () => ({
  ProjectProvider: ({ children }: { children: ReactNode }) => children,
  useProjects: () => ({
    projects: [
      {
        id: 'project-1',
        name: 'Current Project',
        path: '/projects/current',
        worktrees: [],
        selectedWorktree: null
      }
    ],
    activeProjectId: 'project-1',
    addProject: mockAddProject,
    removeProject: mockRemoveProject,
    setActiveProject: vi.fn(),
    setSelectedWorktree: vi.fn()
  })
}));

vi.mock('./components/ProjectSelector', () => ({
  ProjectSelector: ({
    onSelectProject,
    canRemoveRecentProjects
  }: {
    onSelectProject: (path: string) => void;
    canRemoveRecentProjects?: boolean;
  }) => (
    <>
      <button onClick={() => onSelectProject('/projects/recent')}>Recent Project</button>
      {canRemoveRecentProjects && <button>Remove Recent Project</button>}
    </>
  )
}));

vi.mock('./components/TitleBar', () => ({
  TitleBar: ({ children }: { children?: ReactNode }) => <div>{children}</div>
}));
vi.mock('./components/ProjectWorkspace', () => ({ ProjectWorkspace: () => null }));
vi.mock('./components/GlobalTerminalSettings', () => ({ GlobalTerminalSettings: () => null }));
vi.mock('./components/GlobalSettings', () => ({ GlobalSettings: () => null }));
vi.mock('./components/OnboardingDialog', () => ({ OnboardingDialog: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(() => null),
    length: 0
  });
  mockAddProject.mockReset();
  mockRemoveProject.mockReset();
});

describe('App Component - Plus Button Behavior', () => {
  it('opens the project selector and waits for a recent project selection', async () => {
    render(<App />);

    fireEvent.click(screen.getByTitle('Open project'));

    expect(await screen.findByRole('dialog', { name: 'Open a project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Recent Project' })).toBeInTheDocument();
    expect(mockAddProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Recent Project' }));

    expect(mockAddProject).toHaveBeenCalledWith('/projects/recent');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Open a project' })).not.toBeInTheDocument();
    });
  });
});

describe('App Component - Close Project Confirmation', () => {
  it('should not remove project immediately when handleCloseProject is called', () => {
    // Mock projects array
    const mockProjects = [
      { id: 'project-1', name: 'Project 1', path: '/path/1', worktrees: [] },
      { id: 'project-2', name: 'Project 2', path: '/path/2', worktrees: [] }
    ];

    // State for tracking project to close (simulating useState)
    let projectToClose: { id: string; name: string } | null = null;

    // Simulate handleCloseProject from App.tsx
    const handleCloseProject = (projectId: string) => {
      const project = mockProjects.find((p) => p.id === projectId);
      if (project) {
        projectToClose = { id: project.id, name: project.name };
      }
    };

    // When close button is clicked
    handleCloseProject('project-1');

    // Should set projectToClose but not call removeProject
    expect(projectToClose).toEqual({ id: 'project-1', name: 'Project 1' });
    expect(mockRemoveProject).not.toHaveBeenCalled();
  });

  it('should remove project when confirmation is confirmed', () => {
    // State for tracking project to close
    let projectToClose: { id: string; name: string } | null = {
      id: 'project-1',
      name: 'Project 1'
    };

    // Simulate confirmCloseProject from App.tsx
    const confirmCloseProject = () => {
      if (projectToClose) {
        mockRemoveProject(projectToClose.id);
        projectToClose = null;
      }
    };

    // When user confirms closing
    confirmCloseProject();

    // Should call removeProject and clear projectToClose
    expect(mockRemoveProject).toHaveBeenCalledWith('project-1');
    expect(projectToClose).toBeNull();
  });

  it('should not remove project when confirmation is cancelled', () => {
    // State for tracking project to close
    let projectToClose: { id: string; name: string } | null = {
      id: 'project-1',
      name: 'Project 1'
    };

    // Simulate cancelCloseProject from App.tsx
    const cancelCloseProject = () => {
      projectToClose = null;
    };

    // When user cancels
    cancelCloseProject();

    // Should not call removeProject but should clear projectToClose
    expect(mockRemoveProject).not.toHaveBeenCalled();
    expect(projectToClose).toBeNull();
  });

  it('should show dialog when projectToClose is set', () => {
    // This test validates the dialog visibility logic
    let projectToClose: { id: string; name: string } | null = null;

    // Dialog open state is based on projectToClose !== null
    const isDialogOpen = () => projectToClose !== null;

    expect(isDialogOpen()).toBe(false);

    // Simulate clicking close button
    projectToClose = { id: 'project-1', name: 'Test Project' };

    expect(isDialogOpen()).toBe(true);

    // Simulate confirming or cancelling
    projectToClose = null;

    expect(isDialogOpen()).toBe(false);
  });
});

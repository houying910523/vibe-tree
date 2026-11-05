export const RIGHT_PANE_TAB_SHORTCUT_EVENT = 'vibetree:select-right-pane-tab';

export const RIGHT_PANE_TABS = ['agent', 'terminal', 'git-diff'] as const;

export type RightPaneTab = (typeof RIGHT_PANE_TABS)[number];

export function isRightPaneTab(value: string): value is RightPaneTab {
  return RIGHT_PANE_TABS.includes(value as RightPaneTab);
}

export function getRightPaneTabForShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key'>
): RightPaneTab | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;

  switch (event.key) {
    case '1':
      return 'agent';
    case '2':
      return 'terminal';
    case '3':
      return 'git-diff';
    default:
      return null;
  }
}

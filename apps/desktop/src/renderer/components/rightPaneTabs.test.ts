import { describe, expect, it } from 'vitest';
import { getRightPaneTabForShortcut } from './rightPaneTabs';

describe('right pane tab shortcuts', () => {
  it('maps Alt+1/2/3 to the visible tab order', () => {
    expect(getRightPaneTabForShortcut(keyboardEvent('1'))).toBe('agent');
    expect(getRightPaneTabForShortcut(keyboardEvent('2'))).toBe('terminal');
    expect(getRightPaneTabForShortcut(keyboardEvent('3'))).toBe('git-diff');
  });

  it('ignores modified or unrelated keys', () => {
    expect(getRightPaneTabForShortcut(keyboardEvent('1', { metaKey: true }))).toBeNull();
    expect(getRightPaneTabForShortcut(keyboardEvent('4'))).toBeNull();
  });
});

function keyboardEvent(
  key: string,
  overrides: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {}
) {
  return {
    key,
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides
  };
}

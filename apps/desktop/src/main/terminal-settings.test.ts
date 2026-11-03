import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/vibetree-test')
  }
}));

vi.mock('fs');

describe('TerminalSettingsManager', () => {
  const mockFs = vi.mocked(fs);
  const storagePath = path.join('/tmp/vibetree-test', 'terminal-settings.json');

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('{}');
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.mkdirSync.mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('uses a CJK-capable font stack by default', async () => {
    const { terminalSettingsManager, DEFAULT_TERMINAL_FONT_FAMILY } =
      await import('./terminal-settings');

    terminalSettingsManager.initialize();

    expect(terminalSettingsManager.getSettings().fontFamily).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
    expect(DEFAULT_TERMINAL_FONT_FAMILY).toContain('Meslo LG S for Powerline');
    expect(DEFAULT_TERMINAL_FONT_FAMILY).toContain('PingFang SC');
    expect(DEFAULT_TERMINAL_FONT_FAMILY).toContain('Microsoft YaHei UI');
  });

  it('migrates the original default font stack', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({ fontFamily: 'Menlo, Monaco, "Courier New", monospace' })
    );

    const { terminalSettingsManager, DEFAULT_TERMINAL_FONT_FAMILY } =
      await import('./terminal-settings');

    terminalSettingsManager.initialize();

    expect(terminalSettingsManager.getSettings().fontFamily).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
  });

  it('migrates the CJK-only default font stack', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        fontFamily:
          'Menlo, Monaco, "SF Mono", Consolas, "Cascadia Mono", "Courier New", "Noto Sans Mono CJK SC", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei UI", "WenQuanYi Micro Hei", "Apple Color Emoji", "Segoe UI Emoji", monospace'
      })
    );

    const { terminalSettingsManager, DEFAULT_TERMINAL_FONT_FAMILY } =
      await import('./terminal-settings');

    terminalSettingsManager.initialize();

    expect(terminalSettingsManager.getSettings().fontFamily).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
  });

  it('keeps a user-selected font stack', async () => {
    const customFont = '"Fira Code", monospace';
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ fontFamily: customFont }));

    const { terminalSettingsManager } = await import('./terminal-settings');

    terminalSettingsManager.initialize();

    expect(terminalSettingsManager.getSettings().fontFamily).toBe(customFont);
  });

  it('resets to the CJK-capable font stack', async () => {
    const { terminalSettingsManager, DEFAULT_TERMINAL_FONT_FAMILY } =
      await import('./terminal-settings');

    terminalSettingsManager.initialize();
    terminalSettingsManager.updateSettings({ fontFamily: '"Fira Code", monospace' });
    terminalSettingsManager.resetToDefaults();

    expect(terminalSettingsManager.getSettings().fontFamily).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
    const lastWrite = mockFs.writeFileSync.mock.calls.at(-1);
    expect(lastWrite?.[0]).toBe(storagePath);
    expect(JSON.parse(lastWrite?.[1] as string).fontFamily).toBe(DEFAULT_TERMINAL_FONT_FAMILY);
  });
});

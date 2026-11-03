import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  cursorBlink: boolean;
  scrollback: number;
  tabStopWidth: number;
  setLocaleVariables: boolean;
}

export type TerminalSettingsUpdate = Partial<TerminalSettings>;

export const DEFAULT_TERMINAL_FONT_FAMILY =
  '"Meslo LG S for Powerline", Menlo, Monaco, "SF Mono", Consolas, "Cascadia Mono", "Courier New", "Noto Sans Mono CJK SC", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei UI", "WenQuanYi Micro Hei", "Apple Color Emoji", "Segoe UI Emoji", monospace';

const LEGACY_DEFAULT_TERMINAL_FONT_FAMILIES = [
  'Menlo, Monaco, "Courier New", monospace',
  'Menlo, Monaco, "SF Mono", Consolas, "Cascadia Mono", "Courier New", "Noto Sans Mono CJK SC", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei UI", "WenQuanYi Micro Hei", "Apple Color Emoji", "Segoe UI Emoji", monospace'
];

const DEFAULT_SETTINGS: TerminalSettings = {
  fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
  fontSize: 14,
  cursorBlink: true,
  scrollback: 10000,
  tabStopWidth: 4,
  setLocaleVariables: true
};

class TerminalSettingsManager {
  private settings: TerminalSettings = { ...DEFAULT_SETTINGS };
  private storageFile!: string;
  private _initialized = false;

  constructor() {
    // Defer initialization until app is ready
  }

  /**
   * Initialize the settings manager (must be called when app is ready)
   * Loads settings from disk
   */
  public initialize() {
    if (this._initialized) {
      return; // Already initialized
    }
    this._initialized = true;

    this.storageFile = path.join(app.getPath('userData'), 'terminal-settings.json');
    this.loadSettings();
  }

  private loadSettings() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const data = fs.readFileSync(this.storageFile, 'utf8');
        const loadedSettings = JSON.parse(data);

        // Merge with defaults to ensure all properties exist
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...loadedSettings
        };
        if (LEGACY_DEFAULT_TERMINAL_FONT_FAMILIES.includes(this.settings.fontFamily)) {
          this.settings.fontFamily = DEFAULT_TERMINAL_FONT_FAMILY;
        }
      }
    } catch (error) {
      console.error('Failed to load terminal settings:', error);
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  private saveSettings() {
    try {
      const dir = path.dirname(this.storageFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storageFile, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('Failed to save terminal settings:', error);
    }
  }

  getSettings(): TerminalSettings {
    return { ...this.settings };
  }

  updateSettings(updates: TerminalSettingsUpdate) {
    this.settings = {
      ...this.settings,
      ...updates
    };
    this.saveSettings();
  }

  resetToDefaults() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveSettings();
  }

  // Get list of common monospace fonts for the UI
  getAvailableFonts(): string[] {
    return [
      DEFAULT_TERMINAL_FONT_FAMILY,
      '"Cascadia Code", Menlo, Monaco, "Noto Sans Mono CJK SC", "PingFang SC", "Microsoft YaHei UI", monospace',
      '"Fira Code", Menlo, Monaco, "Noto Sans Mono CJK SC", "PingFang SC", "Microsoft YaHei UI", monospace',
      '"JetBrains Mono", Menlo, Monaco, "Noto Sans Mono CJK SC", "PingFang SC", "Microsoft YaHei UI", monospace',
      '"Source Code Pro", Menlo, Monaco, "Noto Sans Mono CJK SC", "PingFang SC", "Microsoft YaHei UI", monospace',
      '"SF Mono", Monaco, Menlo, monospace',
      'Consolas, "Microsoft YaHei UI", "Noto Sans Mono CJK SC", monospace',
      '"IBM Plex Mono", Monaco, Menlo, monospace',
      '"Roboto Mono", Monaco, Menlo, monospace',
      '"Ubuntu Mono", Monaco, Menlo, monospace',
      'monospace'
    ];
  }
}

export const terminalSettingsManager = new TerminalSettingsManager();

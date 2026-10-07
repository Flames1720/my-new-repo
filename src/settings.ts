import type { SettingsState } from './types';

const SETTINGS_KEY = 'world-wildlife-settings-v1';

export const defaultSettings: SettingsState = {
  sensitivityX: 1.0,
  sensitivityY: 1.0,
  invertY: false,
  graphics: 'high',
  weatherMode: 'dynamic',
  chunkRadius: 6,
  characterGender: 'male',
  characterOutfit: 'explorer',
  lodDetail: 'ultra',
};

class SettingsManager {
  current: SettingsState = { ...defaultSettings };
  private listeners: Array<(s: SettingsState) => void> = [];

  constructor() {
    this.load();
  }

  load(): SettingsState {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.current = { ...defaultSettings, ...parsed };
      }
    } catch {
      this.current = { ...defaultSettings };
    }
    return this.current;
  }

  save(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.current));
    } catch {}
    for (const fn of this.listeners) fn(this.current);
  }

  update(partial: Partial<SettingsState>): void {
    this.current = { ...this.current, ...partial };
    this.save();
  }

  subscribe(fn: (s: SettingsState) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }
}

export const settings = new SettingsManager();

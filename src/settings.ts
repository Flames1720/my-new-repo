import type { SettingsState } from './types';

const SETTINGS_KEY = 'world-wildlife-settings-v1';

export const defaultSettings: SettingsState = {
  sensitivityX: 360,
  sensitivityY: 150,
  invertY: false,
  cameraAcceleration: 'fixed',
  cameraAccelerationStrength: 0.65,
  cameraAccelerationThreshold: 1.0,
  graphics: 'high',
  weatherMode: 'dynamic',
  chunkRadius: 6,
  characterGender: 'male',
  characterOutfit: 'explorer',
  characterModel: 'quaternius-adventurer',
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
        // Migrate older multiplier-based camera settings into degree-based values.
        if (typeof parsed.sensitivityX !== 'number' || parsed.sensitivityX <= 3) {
          this.current.sensitivityX = defaultSettings.sensitivityX;
        }
        if (typeof parsed.sensitivityY !== 'number' || parsed.sensitivityY <= 3) {
          this.current.sensitivityY = defaultSettings.sensitivityY;
        }
        if (!['fixed', 'distance', 'speed'].includes(this.current.cameraAcceleration)) {
          this.current.cameraAcceleration = defaultSettings.cameraAcceleration;
        }
        if (!Number.isFinite(this.current.cameraAccelerationStrength)) {
          this.current.cameraAccelerationStrength = defaultSettings.cameraAccelerationStrength;
        }
        this.current.cameraAccelerationStrength = Math.max(0, Math.min(2, this.current.cameraAccelerationStrength));
        if (!Number.isFinite(this.current.cameraAccelerationThreshold)) {
          this.current.cameraAccelerationThreshold = defaultSettings.cameraAccelerationThreshold;
        }
        this.current.cameraAccelerationThreshold = Math.max(0.5, Math.min(2, this.current.cameraAccelerationThreshold));
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

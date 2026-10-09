/**
 * Procedural Web Audio API sound synthesizer.
 * Completely self-contained, instant loading, 0 external audio files needed.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private heartbeatNode: OscillatorNode | null = null;
  private heartbeatGain: GainNode | null = null;
  private ambientNode: OscillatorNode | null = null;
  private ambientEnabled = false;
  private isMuted: boolean = false;
  private initialized: boolean = false;

  public init() {
    if (this.initialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.9, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.ambientGain.connect(this.masterGain);

      if (this.ambientEnabled) this.startAmbientDrone();
      this.initialized = true;
    } catch {
      // AudioContext not allowed or not supported yet
    }
  }

  public setAmbientEnabled(enabled: boolean): void {
    this.ambientEnabled = enabled;
    if (!this.ctx) return;
    if (enabled) this.startAmbientDrone();
    else if (this.ambientNode) {
      try {
        this.ambientNode.stop();
        this.ambientNode.disconnect();
      } catch {
        // An oscillator that has already stopped needs no extra cleanup.
      }
      this.ambientNode = null;
    }
  }

  public setVolumes(master: number, sfx: number) {
    if (!this.ctx || !this.masterGain || !this.sfxGain) return;
    this.masterGain.gain.setValueAtTime(master, this.ctx.currentTime);
    this.sfxGain.gain.setValueAtTime(sfx, this.ctx.currentTime);
  }

  // Gunshots
  public playGunshot(type: 'pistol' | 'shotgun' | 'rifle') {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    if (type === 'pistol') {
      // Sharp 9mm report
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);

      oscGain.gain.setValueAtTime(0.8, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.16);

      // Noise blast
      this.playNoise(0.12, 1800, 0.7);
    } else if (type === 'shotgun') {
      // Heavy 12ga blast with bass thump
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.28);

      oscGain.gain.setValueAtTime(1.0, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.33);

      this.playNoise(0.25, 950, 0.95);

      // Shell pump mechanical slide after 0.4s
      setTimeout(() => {
        this.playMechanicalClick(180, 0.05);
        setTimeout(() => this.playMechanicalClick(320, 0.06), 140);
      }, 350);
    } else if (type === 'rifle') {
      // Rapid assault rifle report
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(550, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);

      oscGain.gain.setValueAtTime(0.75, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      osc.connect(oscGain);
      oscGain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.12);

      this.playNoise(0.09, 2400, 0.65);
    }
  }

  public playDryFire() {
    if (!this.ctx || !this.sfxGain) return;
    this.playMechanicalClick(800, 0.04);
  }

  public playReload() {
    if (!this.ctx || !this.sfxGain) return;
    // Mag drop
    this.playMechanicalClick(350, 0.08);
    // Mag insert
    setTimeout(() => this.playMechanicalClick(520, 0.07), 600);
    // Bolt rack
    setTimeout(() => {
      this.playMechanicalClick(750, 0.09);
      setTimeout(() => this.playMechanicalClick(950, 0.06), 110);
    }, 1100);
  }

  // Tactical hitmarker
  public playHitmarker(headshot: boolean) {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (headshot) {
      // High-pitched crunchy ping
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    } else {
      // Snappy body hit marker tick
      osc.type = 'sine';
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(500, now + 0.04);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
    }

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + (headshot ? 0.12 : 0.05));
  }

  // Zombie sounds
  public playZombieGrowl(pitchMultiplier: number = 1.0) {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110 * pitchMultiplier, now);
    osc.frequency.linearRampToValueAtTime(75 * pitchMultiplier, now + 0.4);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.52);
  }

  public playZombieAttack() {
    if (!this.ctx || !this.sfxGain) return;
    // Whoosh / claw swipe
    this.playNoise(0.2, 500, 0.45);
  }

  public playZombieDeath() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.45);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.52);
  }

  // Player damage
  public playPlayerHurt() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.25);

    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);

    this.playNoise(0.18, 700, 0.5);
  }

  // Pickup sound
  public playPickup() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.setValueAtTime(780, now + 0.08);
    osc.frequency.setValueAtTime(1040, now + 0.16);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  // Explosive barrel boom
  public playExplosion() {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.8);

    gain.gain.setValueAtTime(1.0, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.95);

    this.playNoise(0.7, 450, 0.9);
  }

  // Low health heartbeat
  public updateHeartbeat(healthRatio: number) {
    if (!this.ctx || !this.masterGain) return;
    if (healthRatio <= 0.35 && healthRatio > 0) {
      if (!this.heartbeatNode) {
        this.heartbeatGain = this.ctx.createGain();
        this.heartbeatGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        this.heartbeatGain.connect(this.masterGain);

        this.heartbeatNode = this.ctx.createOscillator();
        this.heartbeatNode.type = 'sine';
        this.heartbeatNode.frequency.setValueAtTime(55, this.ctx.currentTime);
        this.heartbeatNode.connect(this.heartbeatGain);
        this.heartbeatNode.start();
      }
    } else {
      if (this.heartbeatNode) {
        try {
          this.heartbeatNode.stop();
          this.heartbeatNode.disconnect();
        } catch {
          // ignore
        }
        this.heartbeatNode = null;
        this.heartbeatGain = null;
      }
    }
  }

  // Internal noise generator for thuds / muzzle explosions
  private playNoise(duration: number, filterFreq: number, volume: number) {
    if (!this.ctx || !this.sfxGain) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    whiteNoise.start(now);
  }

  private playMechanicalClick(freq: number, duration: number) {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  private startAmbientDrone() {
    if (!this.ctx || !this.ambientGain || !this.ambientEnabled || this.ambientNode) return;
    // Low atmospheric rumble and eerie wind
    const osc = this.ctx.createOscillator();
    this.ambientNode = osc;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(45, this.ctx.currentTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(120, this.ctx.currentTime);

    osc.connect(filter);
    filter.connect(this.ambientGain);
    osc.start();
  }
}

export const survivalSound = new SoundEngine();

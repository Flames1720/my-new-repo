import * as THREE from 'three';
import { WATER_LEVEL } from './terrain';
import type { WeatherKind } from './types';

export class WeatherSystem {
  currentWeather: WeatherKind = 'clear';
  private rainGroup = new THREE.Group();
  private rainGeometry: THREE.BufferGeometry | null = null;
  private rainMaterial: THREE.PointsMaterial | null = null;
  private rainPoints: THREE.Points | null = null;
  private rainPositions: Float32Array = new Float32Array(0);
  private rainVelocities: Float32Array = new Float32Array(0);
  private count = 1000;
  private weatherTimer = 0;
  private lightningTimer = 0;
  private lightningFlash = 0;
  rainIntensity = 0; // 0 to 1

  constructor(scene: THREE.Scene) {
    this.initRain(scene);
  }

  private initRain(scene: THREE.Scene): void {
    const count = this.count;
    this.rainPositions = new Float32Array(count * 3);
    this.rainVelocities = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * 45;
      this.rainPositions[i * 3 + 1] = Math.random() * 25 + 2;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 45;
      this.rainVelocities[i] = 18 + Math.random() * 12;
    }

    this.rainGeometry = new THREE.BufferGeometry();
    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));

    // Semi-transparent blue-white rain streaks
    this.rainMaterial = new THREE.PointsMaterial({
      color: 0xbed6ea,
      size: 0.16,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.rainPoints = new THREE.Points(this.rainGeometry, this.rainMaterial);
    this.rainGroup.add(this.rainPoints);
    this.rainGroup.name = 'weather-rain';
    scene.add(this.rainGroup);
  }

  setWeather(weather: WeatherKind): void {
    this.currentWeather = weather;
  }

  update(
    dt: number,
    playerPosition: THREE.Vector3,
    weatherMode: 'dynamic' | 'clear' | 'rain',
    worldTime: number
  ): { rainOpacity: number; skyDim: number; lightningFlash: number } {
    if (weatherMode === 'clear') {
      this.currentWeather = 'clear';
    } else if (weatherMode === 'rain') {
      this.currentWeather = 'rain';
    } else {
      // Dynamic: cycles every few game hours
      this.weatherTimer += dt;
      if (this.weatherTimer > 90) {
        this.weatherTimer = 0;
        const roll = Math.random();
        if (roll < 0.55) this.currentWeather = 'clear';
        else if (roll < 0.8) this.currentWeather = 'overcast';
        else if (roll < 0.95) this.currentWeather = 'rain';
        else this.currentWeather = 'storm';
      }
    }

    const targetIntensity =
      this.currentWeather === 'rain' ? 0.85 : this.currentWeather === 'storm' ? 1.0 : this.currentWeather === 'overcast' ? 0.1 : 0.0;
    this.rainIntensity += (targetIntensity - this.rainIntensity) * Math.min(1, dt * 2.0);

    if (this.rainMaterial) {
      this.rainMaterial.opacity = this.rainIntensity * 0.65;
    }

    // Update rain drops position relative to player
    if (this.rainIntensity > 0.05 && this.rainGeometry) {
      this.rainGroup.position.x = playerPosition.x;
      this.rainGroup.position.z = playerPosition.z;

      const pos = this.rainPositions;
      const count = this.count;
      for (let i = 0; i < count; i++) {
        pos[i * 3 + 1] -= this.rainVelocities[i] * dt;
        // slight wind drift
        pos[i * 3] += 1.8 * dt;
        if (pos[i * 3 + 1] < 0) {
          pos[i * 3 + 1] = 22 + Math.random() * 4;
          pos[i * 3] = (Math.random() - 0.5) * 45;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 45;
        }
      }
      this.rainGeometry.attributes.position.needsUpdate = true;
    }

    // Lightning during storms
    if (this.currentWeather === 'storm') {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 6 + Math.random() * 14;
        this.lightningFlash = 1.0;
      }
    }
    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 4.5);
    }

    return {
      rainOpacity: this.rainIntensity,
      skyDim: this.rainIntensity * 0.45,
      lightningFlash: this.lightningFlash,
    };
  }
}

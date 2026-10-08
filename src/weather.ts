import * as THREE from 'three';
import { WATER_LEVEL, clamp } from './terrain';
import type { WeatherKind } from './types';

export interface WeatherEffects {
  rainOpacity: number;
  skyDim: number;
  lightningFlash: number;
  windVector: THREE.Vector2;
  windSpeed: number;
  gustStrength: number;
  cloudBaseAltitude: number;
  waveHeight: number;
  waveSpeed: number;
}

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

  // Geographical atmospheric state
  windVector = new THREE.Vector2(0.7071, -0.7071);
  windSpeed = 4.5; // m/s
  gustStrength = 0;
  cloudBaseAltitude = 105.0; // Altitude where only the very highest alpine peaks intersect clouds
  waveEnergy = 0.4;
  private gustTimer = 0;

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
  ): WeatherEffects {
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

    // Wind dynamics & gust variations
    this.gustTimer += dt;
    const baseSpeed =
      this.currentWeather === 'storm' ? 16.0 : this.currentWeather === 'rain' ? 9.5 : this.currentWeather === 'overcast' ? 6.0 : 3.5;
    const gust = Math.sin(this.gustTimer * 0.8) * Math.cos(this.gustTimer * 0.35) * (this.currentWeather === 'storm' ? 6.5 : 2.5);
    this.windSpeed = Math.max(1.0, baseSpeed + Math.max(0, gust));
    this.gustStrength = Math.max(0, gust);

    // Prevailing direction with slight atmospheric veer
    const windAngle = -Math.PI / 4 + Math.sin(this.gustTimer * 0.05) * 0.25;
    this.windVector.set(Math.cos(windAngle), Math.sin(windAngle)).normalize();

    // Geographical Cloud Base Altitude:
    // In clear weather: high clouds at 110m, summits rise in open sun.
    // In overcast / rain: clouds sink to 85m - 92m, where only the highest alpine crags touch them.
    // In storms: thunderheads dip to 72m, summits soar above into the sky.
    const targetCloudBase =
      this.currentWeather === 'storm' ? 72.0 : this.currentWeather === 'rain' ? 82.0 : this.currentWeather === 'overcast' ? 90.0 : 110.0;
    this.cloudBaseAltitude += (targetCloudBase - this.cloudBaseAltitude) * Math.min(1, dt * 0.5);

    // Wind waves: wave energy scales with wind speed and duration
    const targetWaveEnergy = clamp((this.windSpeed - 2.0) / 14.0, 0.15, 1.2);
    this.waveEnergy += (targetWaveEnergy - this.waveEnergy) * Math.min(1, dt * 1.5);
    const waveHeight = 0.15 + this.waveEnergy * 0.45;
    const waveSpeed = 1.0 + this.waveEnergy * 1.8;

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
        // Wind drift along windVector
        pos[i * 3] += this.windVector.x * this.windSpeed * 0.25 * dt;
        pos[i * 3 + 2] += this.windVector.y * this.windSpeed * 0.25 * dt;
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
      windVector: this.windVector,
      windSpeed: this.windSpeed,
      gustStrength: this.gustStrength,
      cloudBaseAltitude: this.cloudBaseAltitude,
      waveHeight,
      waveSpeed,
    };
  }
}


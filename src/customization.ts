import * as THREE from 'three';

/**
 * Character Appearance Studio
 * ---------------------------
 * The production character (Kenney CC0 adventurer) uses a single 256x256
 * texture atlas. A companion zone-map image (`/assets/adventurer-zones.png`)
 * marks every texel with a body-part zone id (encoded as red / 25), so each
 * region — skin, hair, eyes, beard, shirt, pants, shoes, lips — can be
 * recolored at runtime while preserving the original painted shading.
 */

export interface CharacterCustomization {
  skinTone: number; // index into SKIN_TONES
  hairColor: number; // index into HAIR_COLORS
  eyeColor: number; // index into EYE_COLORS
  shirtColor: number; // index into CLOTHES_COLORS
  pantsColor: number; // index into CLOTHES_COLORS
  shoeColor: number; // index into SHOE_COLORS
  beard: boolean;
}

export const DEFAULT_CUSTOMIZATION: CharacterCustomization = {
  skinTone: 1,
  hairColor: 2,
  eyeColor: 1,
  shirtColor: 0,
  pantsColor: 3,
  shoeColor: 0,
  beard: true,
};

export interface SwatchOption {
  name: string;
  color: number;
}

export const SKIN_TONES: SwatchOption[] = [
  { name: 'Porcelain', color: 0xf6dcc5 },
  { name: 'Sand', color: 0xf3c5a0 },
  { name: 'Honey', color: 0xdca171 },
  { name: 'Amber', color: 0xb97a4e },
  { name: 'Bronze', color: 0x8d5732 },
  { name: 'Ebony', color: 0x5f3a22 },
];

export const HAIR_COLORS: SwatchOption[] = [
  { name: 'Raven Black', color: 0x241f1d },
  { name: 'Chestnut', color: 0x4a2e1c },
  { name: 'Copper', color: 0x8a4520 },
  { name: 'Golden Blond', color: 0xc9a24a },
  { name: 'Ash Grey', color: 0x8f8c88 },
  { name: 'Arctic White', color: 0xe8e6e2 },
];

export const EYE_COLORS: SwatchOption[] = [
  { name: 'Deep Brown', color: 0x4a2e18 },
  { name: 'Ocean Blue', color: 0x2b6fb3 },
  { name: 'Forest Green', color: 0x3d7a45 },
  { name: 'Hazel', color: 0x7a5a28 },
  { name: 'Storm Grey', color: 0x6b7683 },
];

export const CLOTHES_COLORS: SwatchOption[] = [
  { name: 'Expedition Ivory', color: 0xd8dbe2 },
  { name: 'Azure Tunic', color: 0x2b6ca3 },
  { name: 'Forest Ranger', color: 0x2e6b35 },
  { name: 'Terracotta', color: 0xc25a2b },
  { name: 'Glacial Blue', color: 0x5486ad },
  { name: 'Lagos Emerald', color: 0x138a4b },
  { name: 'Sunset Crimson', color: 0xa8352f },
  { name: 'Midnight', color: 0x232a35 },
  { name: 'Goldenrod', color: 0xd9a52e },
  { name: 'Plum', color: 0x6a3d7a },
];

export const SHOE_COLORS: SwatchOption[] = [
  { name: 'Cloud White', color: 0xeceae4 },
  { name: 'Trail Brown', color: 0x6b4a2e },
  { name: 'Charcoal', color: 0x33373d },
  { name: 'Brick Red', color: 0x9c3b30 },
  { name: 'Pine', color: 0x2f5240 },
];

/** Named style presets — one tap applies a full coordinated look. */
export interface StylePreset {
  name: string;
  look: Partial<CharacterCustomization>;
}

export const STYLE_PRESETS: Record<string, StylePreset> = {
  explorer: { name: 'Explorer', look: { shirtColor: 0, pantsColor: 3, shoeColor: 0 } },
  ranger: { name: 'Forest Ranger', look: { shirtColor: 2, pantsColor: 7, shoeColor: 1 } },
  scout: { name: 'Autumn Scout', look: { shirtColor: 3, pantsColor: 7, shoeColor: 1 } },
  arctic: { name: 'Arctic Scout', look: { shirtColor: 4, pantsColor: 7, shoeColor: 2 } },
  lagos: { name: 'Lagos Pioneer', look: { shirtColor: 5, pantsColor: 7, shoeColor: 3 } },
};

// Atlas zone ids (match adventurer-zones.png, red channel / 25)
const ZONE = { HAIR: 1, SKIN: 2, BEARD: 3, EYES: 4, SHOE: 5, SHIRT: 7, PANTS: 8, LIPS: 9 } as const;

// Mean luminance of each zone in the source atlas — used to preserve painted shading.
const ZONE_LUM: Record<number, number> = { 1: 66.2, 2: 170.2, 3: 147.8, 4: 97.4, 5: 212.2, 7: 202.5, 8: 133.6, 9: 133.6 };
// Max brightening gain so dark zones (hair) don't blow out when tinted light
const MAX_GAIN = 2.1;

const ATLAS_URL = '/assets/adventurer-atlas.png';
const ZONES_URL = '/assets/adventurer-zones.png';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

export class CharacterStylist {
  private atlas: ImageData | null = null;
  private zones: Uint8Array | null = null;
  private textureCache = new Map<string, THREE.CanvasTexture>();
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.load();
  }

  private async load() {
    try {
      const [atlasImg, zonesImg] = await Promise.all([loadImage(ATLAS_URL), loadImage(ZONES_URL)]);
      const size = 256;

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

      ctx.drawImage(atlasImg, 0, 0, size, size);
      this.atlas = ctx.getImageData(0, 0, size, size);

      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(zonesImg, 0, 0, size, size);
      const zoneData = ctx.getImageData(0, 0, size, size).data;
      this.zones = new Uint8Array(size * size);
      for (let i = 0; i < size * size; i++) {
        this.zones[i] = Math.round(zoneData[i * 4] / 25);
      }
    } catch (err) {
      console.warn('[CharacterStylist] Atlas/zone assets unavailable; customization disabled.', err);
    }
  }

  get available(): boolean {
    return this.atlas !== null && this.zones !== null;
  }

  /** Build (or fetch cached) a customized canvas texture for the character. */
  buildTexture(custom: CharacterCustomization): THREE.CanvasTexture | null {
    if (!this.atlas || !this.zones) return null;
    const key = JSON.stringify(custom);
    const cached = this.textureCache.get(key);
    if (cached) return cached;

    const size = 256;
    const src = this.atlas.data;
    const out = new ImageData(size, size);
    const dst = out.data;

    const skin = hexToRgb(SKIN_TONES[custom.skinTone]?.color ?? SKIN_TONES[1].color);
    const hair = hexToRgb(HAIR_COLORS[custom.hairColor]?.color ?? HAIR_COLORS[2].color);
    const eyes = hexToRgb(EYE_COLORS[custom.eyeColor]?.color ?? EYE_COLORS[1].color);
    const shirt = hexToRgb(CLOTHES_COLORS[custom.shirtColor]?.color ?? CLOTHES_COLORS[0].color);
    const pants = hexToRgb(CLOTHES_COLORS[custom.pantsColor]?.color ?? CLOTHES_COLORS[3].color);
    const shoe = hexToRgb(SHOE_COLORS[custom.shoeColor]?.color ?? SHOE_COLORS[0].color);

    for (let i = 0; i < size * size; i++) {
      const o = i * 4;
      const r = src[o], g = src[o + 1], b = src[o + 2];
      dst[o] = r;
      dst[o + 1] = g;
      dst[o + 2] = b;
      dst[o + 3] = src[o + 3];

      const zone = this.zones[i];
      let target: [number, number, number] | null = null;
      switch (zone) {
        case ZONE.SKIN:
          target = skin;
          break;
        case ZONE.BEARD:
          // Clean-shaven style repaints the beard with the chosen skin tone
          target = custom.beard ? hair : skin;
          break;
        case ZONE.HAIR:
          target = hair;
          break;
        case ZONE.EYES:
          target = eyes;
          break;
        case ZONE.SHOE:
          target = shoe;
          break;
        case ZONE.SHIRT:
          target = shirt;
          break;
        case ZONE.PANTS:
          target = pants;
          break;
        default:
          break;
      }

      if (target) {
        // Luminance-preserving tint: keep the painted folds/shadows of the atlas
        const lum = (r + g + b) / 3;
        const k = Math.min(MAX_GAIN, lum / (ZONE_LUM[zone] || 180));
        dst[o] = Math.min(255, Math.round(target[0] * k));
        dst[o + 1] = Math.min(255, Math.round(target[1] * k));
        dst[o + 2] = Math.min(255, Math.round(target[2] * k));
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d')!.putImageData(out, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false; // glTF UV convention
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;

    // Keep the cache bounded
    if (this.textureCache.size > 24) {
      const oldest = this.textureCache.keys().next().value;
      if (oldest) {
        this.textureCache.get(oldest)?.dispose();
        this.textureCache.delete(oldest);
      }
    }
    this.textureCache.set(key, texture);
    return texture;
  }
}

export const stylist = new CharacterStylist();

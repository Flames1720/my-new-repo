/** Choose dry, gently sloping clearings outside building districts. */
export function findSanctuarySites(options: {
  originX: number; originZ: number; limit: number;
  height: (x: number, z: number) => number;
  wet: (x: number, z: number) => boolean;
  buildingDistrict: (x: number, z: number) => boolean;
}) {
  const sites: Array<{ id: string; label: string; x: number; z: number; radius: number }> = [];
  const radius = 10;
  for (let ring = 40; ring < options.limit - radius && sites.length < 8; ring += 22) {
    for (let sector = 0; sector < 24 && sites.length < 8; sector++) {
      const angle = sector * Math.PI / 12 + ring * 0.017;
      const x = options.originX + Math.cos(angle) * ring;
      const z = options.originZ + Math.sin(angle) * ring;
      if (Math.abs(x) + radius >= options.limit || Math.abs(z) + radius >= options.limit) continue;
      if (sites.some(s => Math.hypot(s.x - x, s.z - z) < 55)) continue;
      const centerHeight = options.height(x, z);
      let valid = true;
      for (let dx = -radius; dx <= radius && valid; dx += 2) {
        for (let dz = -radius; dz <= radius; dz += 2) {
          if (dx * dx + dz * dz > radius * radius) continue;
          if (options.wet(x + dx, z + dz) || options.buildingDistrict(x + dx, z + dz)
            || Math.abs(options.height(x + dx, z + dz) - centerHeight) > 2.5) { valid = false; break; }
        }
      }
      if (valid) sites.push({ id: `clearing-${sites.length + 1}`, label: `CLEARING ${sites.length + 1}`, x, z, radius });
    }
  }
  return sites;
}

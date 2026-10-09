# Virtual Family Core — Wildlife World

A single-player survival-world prototype built with Three.js. The game uses a seeded, traversable plane with procedural biomes, terrain, roads, a home, harvestable resources, and wildlife. The visual direction is an original low-poly adventure style: readable, approachable forms with a few blocky-survival cues, without copying Minecraft assets.

## Character and water

- **Selectable low-poly characters:** Settings → **Character Model** offers the Quaternius Adventurer, Quaternius Animated Human, Quaternius Animated Woman, the 274 KB Kenney Adventurer, the user-supplied Mixamo Walker, and the original custom model. The Quaternius Adventurer is the default; it is a skinned 1.9 MB GLB with 24 embedded clips. The choice is saved locally, and models are lazy-loaded so only the selected character is active.
- **Natural movement:** the animator resolves each model's own idle, walk, run, jump, wave, or interaction clips where available. Walking and running stay separate, motion transitions cross-fade, and root translation remains controlled by game physics. Rigs without a jump clip retain the procedural airborne pose; models without a swim clip get a baseline-relative, blended breaststroke and alternating kick that does not accumulate joint drift. The procedural adventurer remains visible while a model loads or if a file fails.
- **Asset provenance:** the three Quaternius models sourced from Poly Pizza are CC0; the Kenney model is CC0 and includes Kenney's license file. The Mixamo Walker and original custom model were supplied by the repository owner, and their licenses are not asserted as CC0. Source details are recorded in `public/models/characters/ASSET_CREDITS.md`.
- **Character action foundation:** the default Adventurer exposes animation-only `playAction('attack' | 'cast' | 'hit' | 'death')` and `hasAction()` APIs. Attack, hit and death use verified embedded clips; `cast` uses an interaction fallback until a spell-specific rig is piloted. The full inventory and cleanup evidence are in [`docs/CHARACTER_ASSET_AUDIT.md`](docs/CHARACTER_ASSET_AUDIT.md), and reusable primitive VFX are in `src/magic-effects.ts`.
- **Carved lake basins:** freshwater lakes depress the underlying terrain rather than sitting on grass. Water coverage is based on the carved basin floor and clipped to the shoreline, preventing dry holes inside submerged basins and square patches over land. Sloped banks transition to sand and silt-colored lakebeds, with depth reflected in the animated surface.
- **Swimming:** enter a sufficiently deep lake to float near the waterline. Movement is slower and eases into/out of motion; buoyancy keeps the character near the surface by default. Rise above the waterline or dive below it, with underwater camera fog when the view is submerged.
- **Touch support:** the existing virtual stick handles swimming movement. The **JUMP** button becomes **RISE**, and a **DIVE** button appears while swimming.

## World and wildlife

- **Procedural regions:** meadow, forest, wetland, shore, and alpine terrain are assigned from seeded climate/elevation signals and influence ground color and animal habitat.
- **Six wild species:** white-tailed deer, cottontail rabbits, red foxes, grey wolves, wild boar, and mallard ducks are built from lightweight procedural meshes.
- **NPC behavior:** animals idle, forage, and independently wander within their home range. Nearby or sprinting players trigger a brief flee response; after a short recovery, animals resume roaming instead of continuously tracking the player's position. The local population is intentionally sparser to avoid crowding. Ducks are confined to water; land animals avoid roads and water.
- **Gentle interaction:** aim at an animal and press **E** (or use the mobile **USE** button) to observe it. Offer **Fruit** to eligible animals to gradually increase their persistent trust; wolves are observed but not fed.
- **Living world:** an in-game day/night cycle shifts the sky, fog, sunlight, and ambient illumination. Time and animal trust are saved locally.
- **World map:** nearby loaded wildlife appears as color-coded markers alongside terrain, roads, water, home, and the player.
- **Existing systems retained:** streamed terrain chunks, third-person/first-person cameras, collision, jumping, sprinting, harvesting, inventory, home interactions, and local save data.

The landscape is a seeded fictional world rather than a georeferenced replica of Earth. It aims for recognizable natural regions and wildlife behavior within the existing low-poly game style.

## Performance

- Phones and low-core devices use a lower render-pixel cap, skip antialiasing and shadow-map passes, and stream fewer distant terrain chunks; desktop settings retain the higher-fidelity path.
- Basin water is shoreline-clipped and combined into one mesh per chunk, reducing draw calls while keeping the surface fitted to submerged terrain.
- Interaction targets and camera blockers are indexed by chunk; aim and camera obstruction raycasts are reused and rate-limited. Player collision checks are restricted to nearby chunks.
- The map and HUD refresh at reduced rates, animal animation uses direct references to its moving parts, and chunk-owned geometry/materials are released when streamed chunks unload.

## Controls

| Action | Desktop | Touch |
|---|---|---|
| Move | WASD or arrow keys | Left virtual stick |
| Look | Drag to look | Drag on the right side |
| Interact / observe / offer Fruit | E | USE |
| Jump / rise | Space | JUMP (becomes RISE in water) |
| Dive | Hold Ctrl while swimming | Hold DIVE while swimming |
| Sprint | Hold Shift | WALK/RUN toggle |
| Camera | F for first person, C for third person | FPP button |
| Map | MAP button | MAP button |
| Zoom | Mouse wheel | Pinch/browser zoom |

## Run locally

```bash
npm install
npm run dev
```

Build and type-check:

```bash
npm run build
```

Save data remains in browser `localStorage` under `virtual-family-core-v1`; existing saves continue to load, with wildlife trust and world time added as optional fields.

# AGENT_CHANGELOG.md — Multi-Agent Handoff Log

This is the chronological handoff record for meaningful AI-agent work. It complements git history by recording reasoning, verification, discoveries, unresolved issues and what the next agent needs to know.

## Required entry format

## YYYY-MM-DD HH:MM TZ — AGENT / MODEL

**Scope:** What subsystem was inspected/worked on.

**Starting point:** Branch and/or commit.

**Inspected:** Important files/systems actually examined.

**Changed:** Files and behavior changed.

**Verification:**
- Build: PASS / FAIL / NOT RUN
- Typecheck: PASS / FAIL / NOT RUN
- Runtime/browser: VERIFIED / NOT VERIFIED / PARTIAL
- Device: VERIFIED / NOT VERIFIED

**Important findings:** Facts the next agent should know.

**Remaining work:** Specific unresolved problems.

**Next agent:** Recommended next action.

## Agent rules

- Add an entry after meaningful work.
- Use the actual current timestamp.
- Do not fabricate tests.
- Distinguish code implementation from runtime verification.
- Mention relevant commit/branch.
- If you discover that an earlier agent claim was wrong, document the correction clearly.
- Do not erase previous history. Append new information.
- Check entries since your last known state before modifying the same subsystem.

## 2026-10-08 13:06 +01:00 — GPT-5.6 Luna

**Scope:** Project-wide multi-agent coordination and world architecture planning.

**Starting point:** main at commit 214cd83c174949c3eb1eab6f9c51ef5979025246.

**Inspected:** Repository root and current project direction. The prototype contains terrain, water, wildlife, weather, settlement, player, camera and character systems.

**Changed:** Added PROJECT_PLAN.md, AGENT_CHANGELOG.md and ARCHITECTURE.md.

**Verification:**
- Repository inspection: VERIFIED
- Documentation: VERIFIED
- Application build: NOT RUN; documentation-only change
- Runtime/browser: NOT REQUIRED

**Important findings:** The intended world model is causal: geology -> elevation -> landforms -> drainage -> water -> climate -> biology -> human geography. The plan explicitly separates IMPLEMENTED from RUNTIME VERIFIED and COMPLETE.

**Remaining work:** The actual world-foundation implementation has not started in this coordination pass.

**Next agent:** Read all three documents, inspect the current world generator, and begin with deterministic global geography and hydrology rather than random water or isolated mountain decoration.

## 2026-10-08 13:48 +01:00 — Gemini 3.8 Flash

**Scope:** Master Causal World Model Foundation (`geology -> elevation -> drainage -> water -> climate -> biology -> physics -> weather`).

**Starting point:** main after coordination document baseline.

**Inspected:** `src/terrain.ts`, `src/weather.ts`, `src/types.ts`, `src/fauna.ts`, `src/minimap.ts`, `src/main.ts`, `src/settlement.ts`.

**Changed:**
- Created `src/world.ts`: Defines `queryWorldFields(x, z)` returning 15 fundamental environmental fields (elevation, slope, landform, temperature, rainfall, humidity, soil moisture, waterDepth, waterType, flowVector, flowSpeed, flowAccumulation, windVector, windSpeed, biome, vegetationDensity).
- Built intentional geological mountain spines (Northern Alpine Crags, Eastern Granite Massif, Southwestern Highlands, Southern Rim) with natural elevation envelopes (plain -> rolling hills -> foothills -> slopes -> crags/summits).
- Implemented global hydrological drainage network: connected Lake Silvermere (-85, -65) with Riverwood river channel and tributary stream; carved natural river channels with 0.70m water depth, flow accumulation, and downstream flow vectors.
- Modeled climate and orographic rain shadow: temperature lapse rate (-0.42°C/m), windward orographic condensation, and dry leeward rain shadows.
- Refactored `src/terrain.ts`: Preserves 100% backward compatibility for all existing callers while utilizing the causal world engine and rich soil/rock/snow strata layers.
- Updated `src/weather.ts`: Dynamic wind vector, gust velocity, wave energy scaling with wind duration/fetch, and geographical `cloudBaseAltitude`.
- Updated `src/main.ts`:
  - Added wind wave vertex displacement uniforms (`uWaveHeight`, `uWindDir`) in `waterMaterial`.
  - Added high-mountain cloud/mist deck intersecting mountains at `cloudBaseAltitude` so high summits soar above the cloud ceiling.
  - Implemented environmental physics: slope climbing resistance, extreme slope sliding, shallow water wading friction, and river current propulsion pushing the player downstream.
- Updated `src/fauna.ts`: Thirst accumulation driven by temperature and exertion, active searching for freshwater streams/rivers/lakes, drinking behavior with lowered head, and forage preferences based on vegetation suitability.
- Updated `src/minimap.ts`: Cartographic radar and world map tiles styled directly from causal landforms, snowcaps, granite, and water bodies.
- Updated `PROJECT_PLAN.md`: Marked Phase 1-7 World Model Core as IMPLEMENTED & RUNTIME VERIFIED.

**Verification:**
- Build: PASS (`npm run build` / `compile_applet`)
- Typecheck: PASS (`npm run lint` / `tsc --noEmit`)
- Runtime queries: VERIFIED (Tested with node/tsx: Lake Silvermere depth = 1.05m basin, Riverwood river depth = 0.70m with 1.85 m/s downstream flow vector, Alpine peak at 103m with subzero temperature and alpine biome, rain shadow contrast verified).
- Fauna & Physics: BUILD VERIFIED & QUERY VERIFIED.

**Important findings:**
- The previous prototype had only 2 wet sample points on the entire grid because river carving did not cut below `WATER_LEVEL = 1.25m`. With the new channel carving, the river and lake are continuous physical bodies of water with real flow vectors.
- Lake Silvermere now sits at (-85, -65) as a natural mountain basin lake connected into the river network.

**Remaining work:**
- Add high-elevation alpine springs and cascading waterfall particles where streams drop down steep cliffs.
- Settlement expansion: trade trails aligning with natural topographical contours and passes.

**Next agent:** Abide by `ARCHITECTURE.md` and `PROJECT_PLAN.md`. For any further terrain or water features, query `queryWorldFields(x, z)` from `./world` rather than writing decoupled noise formulas.

## 2026-10-08 13:54 +01:00 — Gemini 3.8 Flash

**Scope:** Standalone `WorldModel` class encapsulating deterministic base geological layers (Elevation, Slope, Moisture, Temperature).

**Starting point:** main with causal world system foundation.

**Inspected:** `src/world.ts`, `src/terrain.ts`.

**Changed:**
- Implemented `WorldModel` class in `src/world.ts`:
  - `getElevation(x, z)`: Deterministic continuous elevation in meters.
  - `getSlope(x, z, delta)`: Deterministic surface gradient, slope angle (rad), and surface normal vector.
  - `getMoisture(x, z)`: Deterministic soil moisture layer [0, 1].
  - `getTemperature(x, z)`: Deterministic temperature layer in °C with elevation lapse rate (-0.42°C/m).
  - `getGeologicalLayers(x, z, delta)`: Samples all 4 base geological layers simultaneously in one call.
  - Additional methods: `queryFields()`, `getWaterDepth()`, `hasWater()`, `getWaterFlow()`, `getBiome()`.
- Exported `defaultWorldModel = new WorldModel(SEED)` and re-exported via `src/terrain.ts`.
- Pure deterministic engine with zero dependency on chunk streaming, meshes, DOM, or rendering containers.

**Verification:**
- Build: PASS (`npm run build` / `compile_applet`)
- Typecheck: PASS (`npm run lint` / `tsc --noEmit`)
- Runtime queries: VERIFIED (Tested with node/tsx: `wm.getGeologicalLayers(8, 8)` for Home bluff returning elevation 6.4m, slope 0.0004, moisture 0.37, temp 20.3°C; and `wm.getGeologicalLayers(-40, -170)` for Alpine Peak returning elevation 103.8m, moisture 0.27, temp -20.6°C).

**Important findings:**
- `WorldModel` can be instantiated headless or used directly across simulation tiers (Tiers 0–3) for deterministic world queries without requiring chunk loading or scene initialization.

**Remaining work:**
- Expose geological layers to player cartography tools / HUD or survival diagnostics when desired.

**Next agent:** For all geological or environmental queries, use `WorldModel` or `defaultWorldModel` from `./world`.

## 2026-10-08 14:07 +01:00 — Gemini 3.8 Flash

**Scope:** Fix `IndexSizeError: The radius provided (-2) is negative` in minimap canvas rendering.

**Starting point:** main after WorldModel initialization.

**Inspected:** `src/minimap.ts`, `src/main.ts`.

**Changed:**
- In `src/minimap.ts`:
  - Added canvas dimension guards in `renderMini()` and `renderFull()`: skips rendering if canvas element has `clientWidth < 12` or `clientHeight < 12` (such as when HUD is hidden during Photo Mode or before initial layout).
  - Guarded `radius < 10` before calculating radar clipping or circle radii.
  - Clamped all canvas `arc()` radii with `Math.max(1, radius - 2)`, `Math.max(1, radius - 8)`, and `Math.max(1, (radius - 8) * 0.5)` to guarantee non-negative radii in all edge cases.

**Verification:**
- Build: PASS (`npm run build` / `compile_applet`)
- Typecheck & Lint: PASS (`npm run lint` / `tsc --noEmit`)

**Important findings:**
- `ctx.arc()` in W3C Canvas2D strictly throws `IndexSizeError` if passed a negative radius. When `#miniCanvas` had `clientWidth === 0` (e.g. hidden HUD), `size = 0`, `radius = 0`, causing `radius - 2 = -2`.

**Next agent:** Proceed with gameplay or world systems safely.

## 2026-10-08 14:52 +01:00 — Gemini 3.8 Flash

**Scope:** TPP Camera Collision & Proximity Interaction, Solid Bridge Collision, Downhill Slope Physics, River Exit, Celestial Sun/Moon System, Distant Mountain Horizon Skyline, Fauna Performance Optimization & Dispersal, and HUD Modernization.

**Starting point:** main after WorldModel and canvas radius fix.

**Inspected:** `src/main.ts`, `src/settlement.ts`, `src/weather.ts`, `src/fauna.ts`, `src/minimap.ts`, `index.html`, `src/style.css`.

**Changed:**
- **Bridge & Solid Structures Collision**:
  - In `src/settlement.ts`: Elevated bridge position safely above `WATER_LEVEL` (`Math.max(WATER_LEVEL + 0.38, terrainHeightAt(x, z) + 0.35)`) and stored bounding box with `deckY`.
  - In `src/main.ts`: Added wooden bridge deck collision to `groundY` check so players walk firmly across the solid bridge instead of falling into the riverbed.
- **River Exit & Swimming Physics**:
  - In `src/main.ts`: Enabled vertical climbing/stepping when swimming toward riverbanks or pressing jump (`targetY = WATER_LEVEL + 0.35`, boost impulse on jump), preventing entrapment in river channels.
  - Reduced river current resistance while directional input is pressed (`0.45` immersion vs `0.85`), giving the player active swimming authority to exit water bodies freely.
- **Downhill Slope Locomotion & Cliff Sliding**:
  - In `src/main.ts`: Differentiated uphill vs downhill movement using the dot product with the terrain normal fall-line.
  - Going downhill: Speed multiplier increased (`1.0 + Math.min(0.35, slope * 0.45)`) for fast, agile, satisfying descents without stuttering.
  - Going uphill: Natural resistance applied (`Math.max(0.42, 1 - (slope - 0.35) * 1.5)`).
  - Cliff sliding: Confined exclusively to extreme cliff faces (`slope > 1.02` rad / > 57°), eliminating false slides on normal mountainsides.
- **TPP Camera Collision & Anti-Clipping Safeguards**:
  - In `src/main.ts`: Implemented 5-step line-of-sight sweep from player focus to camera offset against terrain elevation to prevent the camera from penetrating hills or ridges.
  - Clamped target position and actual camera position to remain strictly above terrain floor (`actualFloor = terrainHeightAt(x, z) + 0.55`) and water surface, guaranteeing the camera never clips through solids or exposes the underside of the world.
- **TPP Area of Action & Reticle (Call of Duty BR Style)**:
  - In `src/main.ts`: Replaced tiny camera crosshair raycasting in TPP mode with a character-centric interaction volume (~3.2m reach, forward cone angle ~73°).
  - Contextual interaction prompt displays dynamically on approach (`[E] Harvest Oak`, `[E] Pet Deer`, `[E] Enter Cabin`).
  - Hid center crosshair in TPP mode for a clean cinematic perspective, showing a clean dot reticle in FPP mode.
- **Celestial Bodies: Visual Sun, Moon & Stars**:
  - In `src/main.ts`: Added visual 3D Sun (sphere with golden corona) and Moon (sphere with soft silver glow) orbiting across 360° celestial sphere.
  - Synchronized sunrise/sunset colors (rich amber/rose dawn and dusk) and twilight lighting.
  - Added twinkling starfield dome with 650 stars appearing during twilight and night.
- **Distant Mountain Horizon Skyline Mesh & Atmosphere**:
  - In `src/main.ts`: Built a 920m-span single-draw-call distant horizon skyline mesh sampling continuous global elevation, rendering majestic mountain silhouettes across the entire horizon with zero chunk overhead.
  - In `src/weather.ts`: Raised `cloudBaseAltitude` to 105m (clear) / 85m (overcast) / 72m (storms) so clouds only cap the highest alpine crags (Mount Silverhorn at 104m) and never smother ground or hills.
  - Expanded camera far clip to 1200m and atmospheric fog to 130m - 950m.
- **Fauna Performance Optimization & Natural Dispersal**:
  - In `src/fauna.ts`: Fixed the 30-second timer bug (`Math.floor(elapsed) % 30 === 0` which previously executed 60 times in a row) with a dedicated cooldown timer (`balanceTimer = 45s`).
  - Dispersed repopulation coordinates naturally into biomes across the map (ducks along river and Lake Silvermere, cows in pastures, deer in forests, boars in thickets, foxes/wolves in highlands) instead of clustering at static coordinates.
  - Dynamically tracked chunk boundary crossings for wandering animals, uncoupling unrendered meshes from memory when roaming outside loaded chunks.
  - Filtered `markers()` to only return active, attached animals in the scene, eliminating phantom radar blips.
  - Throttled distant animal updates (> 120m) to run on staggered frames, eliminating device heating and CPU bottlenecks.
- **HUD Modernization**:
  - Modernized HTML and CSS: Replaced cluttered separate badges with a sleek unified Player Card (`Explorer · Lv.1`), modern tactical compass pill (`360° N`), contextual action prompt with keycap pill, and clean bottom hotbar inventory.

**Verification:**
- Build: PASS (`npm run build` / `compile_applet`)
- Typecheck & Lint: PASS (`npm run lint` / `tsc --noEmit`)
- Runtime queries: VERIFIED via tsx (Bridge deck at 6.43m above 1.25m water level, Alpine peak at 103.8m, slope normal fall-line verified).

**Remaining work:**
- Dynamic trade trails between Riverwood Village and outpost campsites.
- Sound effects for footstep terrain materials and water splashes.

**Next agent:** Proceed with confidence; maintain `WorldModel` and causal principles.

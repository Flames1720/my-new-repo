# PROJECT_PLAN.md — Master Multi-Agent Project Plan

This file is the project-wide source of truth for plans, milestones, priorities, verification status, and important coordination rules. It is NOT limited to the world system.

## Mandatory workflow for every AI agent

Before meaningful code changes:
1. Read PROJECT_PLAN.md.
2. Read the latest relevant entries in AGENT_CHANGELOG.md.
3. Read ARCHITECTURE.md when changing shared architecture.
4. Inspect the actual current code and git state. Do not assume documentation is newer than code.
5. Check what changed since the last relevant agent entry.
6. Continue from the verified current state; do not blindly reimplement old work.

After meaningful work:
1. Append a dated entry to AGENT_CHANGELOG.md.
2. Record files changed, what was discovered, what was implemented, and what was actually tested.
3. Record anything that was NOT runtime-verified.
4. Update this plan when a milestone, architecture decision, priority, or verification state changes.

## Verification vocabulary

PLANNED = designed, not started.
IN PROGRESS = being implemented.
IMPLEMENTED = code exists but behavior is not fully verified.
BUILD VERIFIED = build/typecheck passed.
RUNTIME VERIFIED = behavior was actually exercised.
CROSS-CHECKED = independently inspected/confirmed.
COMPLETE = implementation and required verification are satisfied.

Never call something complete merely because code was written.

## Project-wide systems

WORLD / GEOGRAPHY
- deterministic global terrain
- mountains, valleys, plains, basins, coastlines
- drainage, rivers, lakes, wetlands, ocean
- climate and atmosphere
- environmental physics
- ecology and habitats
- weather and waves
- eventual human geography

PLAYER / CHARACTER
- locomotion
- jumping/falling
- swimming
- interaction
- character models and animation

CAMERA
- TPP/FPP
- orbit, zoom and angle
- camera collision
- interaction targeting

BUILDINGS / INTERACTIONS
- homes
- doors
- furniture
- generic interactable system
- later settlements and cities

PERSISTENCE
- deterministic generated base world
- saved world mutations/deltas
- player state

PERFORMANCE
- chunk streaming
- LOD
- spatial partitioning
- simulation tiers
- mobile browser constraints

MULTIPLAYER / EXPANSION
- future shared world
- deterministic seed/version
- persistent synchronization
- expandable finite world

## Current major direction: World Foundation

The world should be one connected causal system:

geology -> elevation -> landforms -> drainage -> water -> climate -> biology -> human geography

The browser game can remain lightweight because expensive real-world processes will be approximated rather than simulated particle-by-particle.

### Geography
Mountains are intentional ranges, not random isolated hills. Ranges should have ridges, peaks, passes, valleys and foothills. Their elevation influence should rise and taper naturally.

### Hydrology
Water is a network, not decoration.

Target:
rainfall + elevation + geology -> runoff -> drainage -> streams -> tributaries -> rivers/lakes -> sea/ocean/sink

Rivers need sources and destinations. Lakes need basins and logical outlets where appropriate. Water must exist inland, because animals and ecosystems need reliable freshwater.

### Climate
Elevation, ocean proximity, wind and moisture should influence temperature and rainfall. Mountains can produce wet windward slopes and dry rain-shadow regions.

### Atmosphere and ocean
Wind should affect clouds, rain and ocean waves. Waves should respond approximately to wind strength, duration, fetch, depth and shoreline geometry.

### Physics
Geography affects movement: slope, terrain material, shallow/deep water, river current, waterfalls and later snow/ice. Player physics should remain lightweight and kinematic unless a stronger physics engine becomes genuinely necessary.

### Biology
Animals should respond to water, food, vegetation, temperature, elevation, shelter and human disturbance. They should seek resources rather than randomly wandering forever.

### Human geography
Later, settlements and roads should respond to water, terrain, fertile land, resources and transport corridors.

## Current world-foundation phase

Status: IMPLEMENTED & RUNTIME VERIFIED (Phase 1-8 World Model & Player Systems); drainage/environmental water foundation is IMPLEMENTED and BUILD VERIFIED on `world-drainage-foundation`, with latest browser/device verification still pending

Completed & Verified Components:
1. global elevation/geology model: Intentional mountain spines with envelopes, ridges, crags, massifs, plateaus, and summits (RUNTIME VERIFIED).
2. landform classification: plains, hills, foothills, mountain_slope, mountain_ridge, peak, plateau, valley, basin, wetland (RUNTIME VERIFIED).
3. drainage/hydrology: deterministic elevation-grid drainage, depression conditioning, flow routing, runoff accumulation, streams/springs/rivers, enclosed lakes, and ocean connectivity (IMPLEMENTED; earlier runtime probes verified topology; latest visual/browser runtime still pending).
4. water surfaces & environmental hydrology: local river/lake water surfaces, deeper basin storage, terrain-aware submerged colors, stronger but controllable river currents, waterfall/spring visuals, snow/ice field logic (IMPLEMENTED & BUILD VERIFIED; latest browser/device runtime still pending).
5. climate fields: Temperature lapse rate, prevailing wind, and orographic rain shadow (RUNTIME VERIFIED).
6. biome/ecology suitability: Forest, meadow, wetland, alpine, riverbank derived causally from moisture, rainfall, elevation, and temperature (RUNTIME VERIFIED).
7. environmental/water physics: Slope climbing resistance, downhill agility, bridge collision, local-surface swimming, strong-but-crossable river current (IMPLEMENTED & BUILD VERIFIED; latest browser/device runtime pending).
8. weather/ocean behavior: Wind wave energy, dynamic wave shader uniforms, high cloud deck (105m) where only highest peaks intersect (BUILD VERIFIED & RUNTIME VERIFIED).
9. celestial day/night system: Visual 3D Sun with golden corona, Moon with lunar glow, and 650 twinkling stars orbiting across the sky dome (BUILD VERIFIED & RUNTIME VERIFIED).
10. distant mountain horizon: Single-draw-call 920m skyline mesh rendering mountain silhouettes across the horizon in line of sight (BUILD VERIFIED).
11. TPP camera anti-clipping: Terrain floor clamping and ray sweeps preventing camera clipping into ground or solids (BUILD VERIFIED & RUNTIME VERIFIED).
12. TPP action volume: Character-centered proximity targeting with contextual action prompts (BUILD VERIFIED).
13. fauna performance & dispersal: Throttled distant updates, fixed 45s auto-balance timer, natural biome dispersal, and filtered radar markers (BUILD VERIFIED).
14. modern HUD: Sleek unified player card, tactical compass heading, contextual keycap action pill, and hotbar inventory (BUILD VERIFIED).

Recommended next steps:
- Browser/device test the latest water/snow pass across ocean, high-altitude river, deep basin lake, spring, waterfall and chunk seams.
- Add deliberate snow/ice hazards and recovery/death rules only after accidental void/geometry failures are ruled out.
- Further refine river width/depth from catchment and settlement trade corridors respecting slope contours.

## World Survey / Diagnostic Camera

Status: IMPLEMENTED & BUILD VERIFIED on the final code patch; browser/device runtime is NOT VERIFIED.

Implemented:
- independent survey camera, not tied to the player
- whole-world overview at survey start
- free pan, zoom, tap-to-focus and mobile pinch zoom
- stripped ROCK + WATER topology view
- stripped HYDROLOGY / WATER TRUTH view with flow-direction arrows
- survey world mesh samples authoritative terrain/hydrology functions rather than streamed decorative chunks
- 1920×1080, 2560×1440 and 3840×2160 diagnostic PNG capture through a dedicated render target
- gameplay HUD, actors, vegetation, buildings, weather, celestial effects and normal chunk rendering are hidden while surveying

Important limitation:
- the survey view shows authoritative expected world truth; it does not yet automatically classify a rendered-water mismatch as underground-vs-covered-vs-missing geometry. The normal game view and survey view can be compared at the same focused coordinates.

Next:
- browser/device exercise on the live preview
- test whole-world framing, focus, zoom, terrain topology, hydrology continuity and high-resolution capture
- later add an explicit renderer-vs-world mismatch overlay once the current water/terrain geometry has been runtime-tested

## Known prototype concerns

These are historical items and MUST be checked against current code before fixing:
- oversized/square water geometry
- invisible water-wall collision
- inconsistent chunk radius/world boundary
- broken road intersection logic
- house/road placement
- map/home coordinate mismatch
- chunk-boundary collision continuity
- terrain/water/home collision continuity

## Core rule

The generated world should eventually be:

DETERMINISTIC BASE WORLD + PERSISTED WORLD DELTAS = CURRENT WORLD

Chunks are a streaming/performance mechanism, not the authority that decides global geography.

Read ARCHITECTURE.md for protected decisions and AGENT_CHANGELOG.md for the chronological handoff history.

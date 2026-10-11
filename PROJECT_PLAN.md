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

## Voxel / Geological Volume Foundation

Status: IMPLEMENTED & BUILD VERIFIED on `world-drainage-foundation`; physical/device runtime NOT VERIFIED.

Implemented:
- `src/voxel.ts` adds a deterministic 3D voxel material model over the existing global world fields.
- Base volume is procedural rather than fully stored; sparse voxel edits are the persistent representation for future digging/building.
- Layered materials now include grass, topsoil, loam, clay, sand, gravel, weathered rock, stone, granite, shale, bedrock, snow, ice and water.
- Water can occupy voxel cells above the carved terrain bed, providing the physical-volume model needed for later caves, trenches and excavation.
- Each streamed chunk owns a `VoxelChunk` handle, while the existing smooth gameplay surface remains the current visual surface for this migration step.
- WORLD Survey receives a one-time low-resolution vertical geological volume mesh so the finite world has visible depth during lifted/side-on inspection.

Architecture decision:
- The deterministic geological/hydrological model remains the geographic authority.
- Voxels are the physical material representation and sparse mutation layer.
- Do NOT replace the global drainage grid with chunk-local voxel simulation.

Next voxel milestones:
1. runtime-check the survey volume on the physical phone, especially 90° side view and terrain layers.
2. add local voxel surface/cut-face remeshing around edits.
3. switch nearby gameplay ground/collision to voxel truth without sacrificing mobile performance.
4. add a deliberate DIG interaction and persist edits through `voxelEdits`.
5. add caves/overhangs and water-volume interaction only after the local voxel renderer/collision is verified.

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

### Latest World Survey inspection pass
- Status: IMPLEMENTED and Vercel BUILD VERIFIED on `world-drainage-foundation`; physical-device runtime remains NOT VERIFIED.
- WORLD survey materializes the finite world at LOD0 once and freezes simulation; rendering is now redraw-on-change rather than continuously repainting an idle survey.
- WORLD survey opening is now non-blocking/batched with a visible `CALCULATING…` → `RENDERING…` → `OPENING…` loader and progress feedback; physical-device runtime verification remains pending.
- Survey pitch now reaches 0 radians for a true 90° side-on/lifted inspection, while yaw remains freely rotatable and zoom remains available.
- Diagnostic filters are reversible: tapping the active TERRAIN or HYDROLOGY control returns to WORLD, with an explicit WORLD button also present.
- Survey mode hides the 920m distant-horizon terrain mesh so no second procedural world appears outside the finite world boundary.


### Zombie-survival display-mode and lobby polish — 2026-10-10
- Scope: `feature/zombie-survival-world-v2`; use native landscape fullscreen as a mandatory entry gate, pause/re-gate if fullscreen/orientation is lost, and make the survival lobby feel like an outbreak deployment screen rather than a centered explanatory card.
- Implemented: animated rotating-phone onboarding; accessible/inert background while gated; loadout cards wired to the existing starting-weapon select; full-stage lobby composition with an animated infected silhouette; pulsing sanctuary dome, rising green energy bands and moving perimeter lights (amber while weakening); brief shot flash and a distinct registered-hit reticle tint.
- Verification: TypeScript and Vite production build pass; browser smoke test entered fullscreen, selected the shotgun, and started a real survival run. Browser preview is not a substitute for physical Android/iOS testing; verify orientation lock, comfort/reach, active-view barrier readability and performance on devices.
- Animation backlog is recorded in README: hit-stagger/knockback and boss slam telegraph-impact, sanctuary collapse/relocation set-piece, pickup pull-in, and richer weapon hand/shell handling.

### Mobile WebView entry-gate hardening — 2026-10-10
- The user-provided phone screenshot showed an unstyled portrait gate with HUD content leaking into view. Added inline critical styling and background-layer hiding so the mandatory entry gate remains full-screen and the phone-rotation cue remains visible even if external stylesheets fail.
- Built a static production preview (compiled CSS/JS) on port 4173. Local/public HTML and hashed CSS returned HTTP 200, and the production preview was visually checked in the browser. Still request a fresh physical-device WebView check from the user before calling mobile rendering verified.


### Survival run design continuation — 2026-10-10
- Status: IMPLEMENTED & BUILD VERIFIED; browser verification is PARTIAL on `feature/zombie-survival-world-v2`.
- Added illustrated, flip-to-inspect Wildcards with two starter cards, two active slots, data-driven definitions, local loadout persistence and one activation button per equipped active card.
- Added unified paused Settings/Resume/Quit behavior, a detailed defeat/victory result surface, duration and best-time persistence, XP/level feedback, wave event banners and procedural event cues.
- Remaining verification: complete a long browser run through defeat/results/redeploy/quit, and verify physical mobile safe-area/touch ergonomics.


### Mobile landscape UI regression pass — 2026-10-11
- Branch: `feature/zombie-survival-world-v2`; **RUNTIME VERIFIED in emulated mobile Chromium**; physical-phone validation and final user approval pending.
- Fixed inherited lobby/Settings grids, landscape type/target size, two-row Wildcards, default HUD overlaps, pause actions and HUD editor Save/Reset access.
- Production assets at 854×393 and 915×412 with mobile/touch and real native Chromium fullscreen: 180 checks passed, 42 screenshots captured/inspected; build and TypeScript lint passed.
- Reproduce with `python tools/mobile_landscape_audit.py --url http://127.0.0.1:4173 --out /workspace/scratch/island-verified` after build/preview. Exact scope/remaining device work in `AGENT_CHANGELOG.md` and `ISLAND_OUTBREAK_PROGRESS.md`. NOT FINALIZED.

## 2026-10-11 mobile performance checkpoint
User Android logs show sustained ~20–23 FPS in low-power FPP mode, including windows with no chunk work or living enemies. Implemented cooperative chunk slices and queued late asset refresh, shared scenery instancing with preserved resource interactions, map caching/HUD mutation reduction, persistent graphics quality and cheaper drawing-buffer handling. Added complete core timings and draw-call window summaries (`mobile-perf-2`). Deterministic regressions: 27 passed. Additional production browser at 800×360/DPR2/touch: 17 passed, including ~120m streaming and PNG export. Full two-size browser repeat passed 180 checks / 42 screenshots with zero failures/page errors. Real Android FPS improvement and final user review remain pending; project NOT FINALIZED.

## Looping soundtrack integration — 2026-10-11
- User-supplied `Chaos.mp3` streams and loops in lobby and its Settings; `Island Outbreak.mp3` streams and loops during deployed runs, including pause, in-run Settings and results until quitting to the lobby. Switching pauses the other track and preserves playback position. Hidden tabs immediately suspend both tracks; backgrounding keeps the existing gameplay pause behavior.
- Trusted pointer/keyboard interaction unlocks mobile Web Audio. Media elements stream through a dedicated music gain and existing master gain without whole-track AudioBuffer decoding. Procedural combat cues remain on their separate SFX gain.
- Replaced the music placeholder with a saved Music on/off switch stopping either track and Music volume slider (default 45%); migrated older settings safely. Added `tools/mobile_music_audit.py` for real decoding/playback, loop wrap, exclusive switching, pause/resume/quit, master mute, gain independence, saved volume and synthetic visibility-event coverage at 854×393 and 915×412 mobile/touch.
- Build/lint and 27 performance regression checks passed. Physical phone sound balance/autoplay review and final user approval remain pending. NOT FINALIZED.

- User clarified: pausing and in-run Settings keep gameplay music; only returning to the lobby selects Chaos. Music on/off affects both tracks independently of SFX. Browser harness now waits for Web Audio parameter application before reading gain values; screenshot capture gets a separate 30s timeout after a software-renderer capture timeout.

- Final corrected production browser pass: 181 UI checks, 43 screenshots at 854×393 and 915×412, zero failures/page errors. Real music playback/loop/switch/pause/mute/background checks passed at both sizes. Artifacts: `/workspace/scratch/island-music-ui-final` and `/workspace/scratch/island-music`.

## Mobile compositor/radar performance pass — 2026-10-11
- User Android Balanced capture confirmed 800×360/DPR1 rendering but sustained roughly 20–26 FPS with an 18 FPS dip despite zero chunk work and one living enemy. Fewer pixels alone did not establish improvement; device throttling remains unproven.
- Inspected live 800×360/DPR2 touch gameplay: Settings, prompt, joystick, shoot/ADS/reload/swap/jump/slide and hidden decorative surfaces retained backdrop blur over the moving canvas. Disabled blur for mobile survival HUD controls while preserving backgrounds, borders, targeting and modal styles.
- Radar and full map now resize backing stores only when CSS size or DPR changes; previously both width/height were reassigned on every redraw, resetting/reallocating canvases. Radar/trails/waypoints/range and redraw frequency unchanged. Full-map drawing baseline explicitly preserved.
- Diagnostics `mobile-perf-3` adds complete frame-callback cost and gap from previous callback end to next start. Gap includes scheduling, other tasks and browser/GPU/compositor waits; it is explicitly NOT a GPU measurement. Existing simulation/render probes retained.
- Initial mobile performance browser: 20 checks passed including zero unchanged radar reallocations, no filtered live HUD controls, queued streaming, PNG export, complete timings and orientation recovery. Build/lint and 27 deterministic performance regressions passed. Final full-map/mobile UI repeat pending; physical Android FPS and user final approval remain pending. NOT FINALIZED.

- Final verification: 181 UI checks / 43 screenshots at 854×393 and 915×412 with mobile/touch fullscreen; 23 focused performance/map checks at 800×360/DPR2; zero failures/page errors. Screenshots inspected. Radar observer waits for its required initial sizing before testing steady-state redraws. Artifacts: `/workspace/scratch/island-perf3-ui`, `/workspace/scratch/island-perf3-verified`. Phone FPS remains unverified.

## Combat effect resource reuse — 2026-10-11
- Continued the existing feature branch from c8a917a. User phone `mobile-perf-3` capture shows improved 30–45 FPS windows and one 57 FPS window, but 14–19 FPS combat stalls with no chunk work. Neither thermal throttling nor a specific GPU cause is established.
- Added `src/combat-effects.ts`: preallocated eight tracer/impact slots, shared tracer material and impact geometry, independent impact fades, dynamic endpoint buffers, bounded growth to 32 simultaneous effects per kind. Expired effects detach without disposing GPU resources; quit/restart clear active effects; final disposal releases owned resources once. Hit detection, damage, weapon tuning, ammunition and reload logic unchanged.
- Diagnostics build tag is `mobile-perf-4`; updated performance audit expectation. Added `tools/combat_effects_regression.mjs` and `tools/mobile_combat_audit.py`.
- Correction to initial hypothesis: camera weapon rigs are not attached to the rendered scene, so the muzzle-light hierarchy is not evidence of the current stalls. Reverted tentative light changes. Missing FPP weapon rendering is a separate follow-up; no camera attachment change in this pass. Initial whole-context GPU counters included world streaming; corrected browser probe identifies tracer shader and six-float endpoint buffers specifically and asserts instrumentation actually sees firing.
- Build/type-check passed; 313 deterministic effect assertions (including 300 repeated eight-pellet bursts), and 27 existing performance regressions passed. Production mobile combat and full landscape UI verification in progress. Physical Android frame-time improvement remains unverified; NOT FINALIZED.

- Final local verification: production mobile/touch/native-fullscreen Chromium at 854×393 and 915×412 passed 181 landscape UI checks with 43 screenshots, plus 20 focused combat checks; zero failures/page errors. Screenshots of all six lobby panels, four Settings pages, gameplay and pause inspected at both sizes. Warm tracers generated no additional tracer shader links or endpoint buffers, and expiry did not delete those buffers. Touch firing, reload, weapon switching, restart and quit passed. Artifacts: `/workspace/scratch/island-perf4-ui`, `/workspace/scratch/island-combat`. Phone FPS and remaining combat stalls are still open; this addresses resource churn, not a proven complete stall fix.

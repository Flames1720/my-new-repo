# Mobile Performance Audit — Baseline

**Repository:** `Flames1720/my-new-repo`  
**Branch:** `perf/mobile-performance-audit`  
**Baseline commit:** `ad720e9` (`Style weapon HUD controls and draggable settings panel`)  
**Protected branches:** `main` and `feature/world-integrated-zombie-survival` were not modified.  
**Audit date:** 2026-10-09

## Scope and environment

This is a Three.js 0.180.0 + Vite + TypeScript browser game. The audit was performed in the Manus Sandbox browser on Ubuntu 24.04 using the local Vite server only. No Vercel deployment or deployment build was created.

Browser viewport was `1280 × 1100`, CSS and drawing-buffer dimensions were both `1280 × 1100`, and `devicePixelRatio` was `1`. The browser reported six logical CPU cores. WebGL was running through `ANGLE` with `SwiftShader Device (Subzero)` rather than a physical GPU. These measurements are therefore a reproducible software-renderer baseline, not proof of performance on a Redmi 15C or any other physical Android phone.

The game starts in Zombie Survival mode on this branch. Quiet-world measurements were taken after disabling survival mode. Movement and combat measurements used the existing keyboard/button paths; no game code was instrumented before the baseline.

## Build baseline

- `npm install --silent`: passed.
- `npm run lint`: passed (`tsc --noEmit`).
- `npm run build`: passed (`tsc && vite build`).
- Vite output: `814.93 kB` minified JavaScript, `224.57 kB` gzip; `33.89 kB` CSS, `7.33 kB` gzip.
- Existing warning: the JavaScript chunk is larger than Vite's 500 kB advisory threshold.

## Browser measurements

Each 10-second sample used `requestAnimationFrame` deltas. `FPS` is calculated as `1000 / mean frame time`; it is not a device-certified refresh rate. Long-frame counts are counts within the sample, not unique causes.

| Scenario | Duration | Mean FPS | Mean frame | Median | P95 | P99 | >33 ms | >50 ms | Max frame | Heap signal |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A. Quiet world, survival disabled | 10 s | 5.5 | 182.31 ms | 184.80 ms | 201.70 ms | 235.20 ms | 53 | 53 | 235.20 ms | 64.4 MB used / 127.3 MB heap total |
| B. Normal movement | 10 s | 4.7 | 211.43 ms | 184.90 ms | 268.80 ms | 907.20 ms | 48 | 48 | 907.20 ms | 89.7 MB used |
| C. Sprint + repeated slide | 10 s | 4.3 | 234.84 ms | 218.50 ms | 285.70 ms | 436.80 ms | 43 | 43 | 436.80 ms | 78.2 MB used |
| D. Combat, repeated firing | 10 s after a 6.5 s spawn lead-in | 3.1 | 318.19 ms | 319.20 ms | 352.80 ms | 369.70 ms | 32 | 32 | 369.70 ms | 63.0 MB used |
| E. Heavier wave, repeated firing/reload | 10 s after a 15 s lead-in | 3.1 | 325.20 ms | 319.30 ms | 352.90 ms | 386.50 ms | 31 | 31 | 386.50 ms | 71.4 MB used |

A sustained 60-second screening measurement was attempted, but the browser automation call timed out at its 30-second tool limit before returning a result. No 10–15-minute memory-growth claim is made. A longer sustained run remains required outside this tool limitation.

## WebGL and asset baseline

The browser reported `MAX_TEXTURE_SIZE = 8192` and `MAX_VERTEX_UNIFORM_VECTORS = 4096`. The renderer is configured with antialiasing on non-low-power devices, `powerPreference: high-performance`, `preserveDrawingBuffer: true`, a pixel-ratio cap of `1.65` (or `1.25` in low-power mode), and PCF soft shadows up to `1024 × 1024` (or `512 × 512` in low-power mode). The baseline browser reported `devicePixelRatio = 1`, so the pixel-ratio cap did not multiply this particular drawing buffer.

The checked-in `public/` assets total `14,941,629` bytes (`14.25 MiB`). Largest assets are `rigged-model.glb` at `8.27 MiB`, `mixamo-walker.glb` at `2.26 MiB`, `quaternius-adventurer.glb` at `1.94 MiB`, and `quaternius-animated-woman.glb` at `1.49 MiB`. Lazy character loading means these are not all loaded into the initial player path, but they remain relevant to model switching and cache pressure.

Exact WebGL draw-call, triangle, geometry, texture, CPU-profile, and GPU-time numbers were not available from the page because the application does not expose the Three.js renderer globally and the browser tool did not provide a DevTools performance trace. Those values must not be invented; the diagnostic overlay added in the implementation phase will expose draw calls and triangles when enabled.

## Initial bottleneck hypotheses, pending implementation

1. **GPU/framebuffer cost:** the baseline is a SwiftShader software-renderer run at a large `1280 × 1100` drawing buffer with shadows and `preserveDrawingBuffer: true`. This is a high-confidence environment limitation, but it cannot be treated as a Redmi 15C result. Proposed fix: expose opt-in diagnostics and apply only low-risk renderer-cost controls through the existing graphics setting; measure the same scenarios again.
2. **Combat CPU/allocation cost:** `ZombieSurvivalSystem.fire()` creates a filtered zombie array, maps a second array, and spreads sight blockers and targets into a new raycast array for each shot. Combat falls from 4.7 FPS during movement to 3.1 FPS during repeated firing. Proposed fix: reuse scratch arrays and count living zombies without changing raycast order or damage behavior.
3. **Per-frame simulation cost:** the main loop updates weather, terrain/world fields, wildlife, camera collision probes, effects, survival AI and rendering every frame. The code includes deliberate camera raycasts and terrain sweeps. These should not be removed blindly; compare after the allocation fix before considering throttling.
4. **Memory behavior:** one-minute sustained growth was not measured successfully, so no leak conclusion is made. Temporary tracer and hit-spark disposal paths were inspected and should be rechecked after the fix.

## Required follow-up

Repeat scenarios A–E on the same browser and viewport after the focused fix. Add an opt-in diagnostic overlay showing FPS, frame time, frame spikes, renderer draw calls and triangle count where available. A physical Android/Redmi-class test and a real 10–15-minute sustained session remain necessary before making device claims.

## Ranked bottlenecks and evidence

### 1. Software-renderer / full-scene GPU pressure — highest impact

- **Evidence:** the browser identifies `ANGLE ... SwiftShader Device (Subzero)`. Quiet baseline measured 5.5 FPS / 182.31 ms mean frame time; combat measured 3.1 FPS / 318.19 ms. The post-fix diagnostic overlay reported about **212 draw calls** and **284,156 triangles** in the active frame.
- **Category:** GPU/rendering environment.
- **Relevant code:** `src/main.ts:434-438` renderer setup, shadow configuration, and the full-scene render at the end of the loop.
- **Risk:** lowering resolution, shadows, or antialiasing can reduce visual quality; changing defaults was intentionally not done blindly.
- **Measurement:** use the `?perf=1` overlay and repeat the same scenarios on a hardware-accelerated browser and a physical Android phone.

### 2. Combat raycast and animation allocations — verified and fixed

- **Evidence:** combat frame time was materially worse than quiet/movement baseline, and `ZombieSurvivalSystem.fire()` previously filtered and mapped zombies, spread blocker/target arrays, cloned muzzle/end vectors, and line-of-sight cloned vectors. The hot animation path also cloned a weapon vector every update.
- **Category:** CPU and garbage collection.
- **Relevant code:** `src/zombie-survival.ts` firing, line-of-sight, status, spawn, and weapon-update paths.
- **Fix:** added reusable ray-object, intersection, muzzle, tracer, line-of-sight, hit-position, and weapon-base scratch objects; replaced repeated living-zombie filters with a linear count helper; preserved raycast order, damage, effects, and controls.
- **Risk:** low; scratch objects are owned by the single-threaded survival system and are not retained by asynchronous work.
- **Measurement:** post-fix repeated-fire sample improved from 3.1 FPS / 318.19 ms to 3.5 FPS / 286.59 ms in this run. The heavier-wave sample remained 3.1 FPS / 322.39 ms, so this is a useful allocation reduction, not a complete renderer solution.

### 3. Full simulation and camera collision work — not changed

- **Evidence:** the main loop updates weather, terrain fields, wildlife, camera blocker rays, terrain sweeps, effects, survival AI, and rendering every frame. Camera collision uses a blocker ray plus a five-step terrain sweep in TPP.
- **Category:** CPU and rendering.
- **Relevant code:** `src/main.ts:3331-3673`.
- **Fix status:** not changed because the audit did not isolate a safe dominant sub-cost from the available browser instrumentation.
- **Next measurement:** capture a browser CPU profile on hardware acceleration and compare with wildlife, weather, camera, and survival updates disabled one at a time in a test-only harness.

### 4. Asset loading and bundle size — follow-up

- **Evidence:** Vite reports an `814.93 kB` minified JavaScript chunk (`224.57 kB` gzip), and checked-in public assets total `14.25 MiB`; `rigged-model.glb` is `8.27 MiB`.
- **Category:** loading and memory.
- **Fix status:** not changed in this focused pass because model loading is feature-dependent and broad lazy-loading changes could affect character switching.
- **Next measurement:** record Navigation Timing and Resource Timing on a clean browser profile, then split or lazy-load only confirmed non-startup features.

## Before/after benchmark

The post-fix runs used the same sandbox browser, `1280 × 1100` viewport, and 10-second requestAnimationFrame sampling. Browser state had advanced between runs, so the table is directional rather than a laboratory-controlled A/B result. The browser automation tool also prevented a full 10–15-minute sustained run.

| Scenario | Baseline FPS / mean frame | Post-fix FPS / mean frame | Result |
|---|---:|---:|---|
| A. Quiet world | 5.5 / 182.31 ms | 3.5 / 288.51 ms | Not comparable enough to call a regression; world/save state and software-renderer pacing drifted. |
| B. Movement | 4.7 / 211.43 ms | 3.6 / 278.17 ms | No confirmed improvement; not a target of the allocation fix. |
| C. Sprint + slide | 4.3 / 234.84 ms | 3.6 / 277.91 ms | No confirmed improvement; not a target of the allocation fix. |
| D. Combat | 3.1 / 318.19 ms | 3.5 / 286.59 ms | Directional improvement in repeated-fire run. |
| E. Heavier wave | 3.1 / 325.20 ms | 3.1 / 322.39 ms | Essentially unchanged; renderer/simulation remains dominant. |

Post-fix diagnostic overlay evidence: approximately `212` draw calls, `284156` triangles, `178` geometries, and `1` texture in the measured active frame. The overlay is disabled by default and is enabled only with `?perf=1`.

## Validation and limitations

- `npm run lint`: PASS after changes.
- `npm run build`: PASS after changes. New output: `816.61 kB` minified JavaScript, `225.18 kB` gzip. The existing Vite chunk-size warning remains.
- `git diff --check`: PASS.
- Browser runtime: VERIFIED locally for the game, the optional overlay, movement, survival controls, firing, and reload paths.
- Physical device: NOT VERIFIED. No Redmi 15C or other Android device was available.
- Mobile viewport/CPU throttling: NOT VERIFIED by device emulation in the available browser tool; the reported viewport remained `1280 × 1100`.
- Sustained 10–15-minute run: NOT COMPLETED; the attempted 60-second browser measurement hit the browser tool's 30-second timeout before returning data.
- No deployment was made, and no protected branch was modified.

## Follow-up rendering optimization pass — 2026-10-09

**Implementation commits:** `22e4d396` (renderer changes) and `ea12bd1` (graphics label). These commits are on `perf/mobile-performance-audit` only; `main` and `feature/world-integrated-zombie-survival` were not modified.

### Changes made

- Added consistent device-aware render scaling. On touch/low-power devices, the Low / Balanced / High caps are now **0.80× / 0.95× / 1.10×**; desktop retains **1.00× / 1.30× / 1.60×**. The same preset is applied at startup, after changing graphics settings, and after resizing/rotating the screen.
- Kept shadow-map rendering disabled on touch/low-power devices for every preset, matching the existing startup behavior instead of letting selecting High unexpectedly enable an expensive shadow pass. Desktop Medium/High shadows remain enabled. The UI now says “Shadows where supported”.
- Reduced near-terrain tessellation from 24 to 18 segments on low-power devices. Terrain and water continue to share their tessellation setting to preserve shoreline alignment. Desktop tessellation is unchanged.
- Replaced the 43 separate transparent cloud-puff meshes with a single `THREE.InstancedMesh`. Instance positions, scales, and cluster orientation are baked from the existing layout, reducing the visible cloud deck from about 43 draw calls to one without removing the clouds. Transparent blending can be order-sensitive, so visual comparison remains outstanding.
- Extended the opt-in `?perf=1` overlay to display the actual canvas buffer dimensions and pixel-ratio scale.
- Retained `preserveDrawingBuffer: true` because the existing photo/screenshot flow captures the renderer canvas. It was not removed without a validated replacement.

### Validation and limits

- `npm install --silent`: passed in the validation sandbox.
- `npm run lint` (`tsc --noEmit`): passed.
- `npm run build` (`tsc && vite build`): passed with Vite 7.3.7. Output was 817.06 kB minified JavaScript / 225.41 kB gzip and 33.89 kB CSS / 7.33 kB gzip. The existing Vite advisory for a JavaScript chunk over 500 kB remains; this pass does not claim to solve bundle size.
- `git diff --check`: passed.
- A headless-browser before/after run was attempted, but the isolated sandbox stopped before a valid paired result was obtained. Partial samples are not treated as performance evidence. **No measured FPS improvement is claimed for this pass yet.**
- No Vercel deployment was created. Physical Android/Redmi testing, screenshot verification after render-scale changes, and a completed controlled before/after frame-time comparison remain outstanding.


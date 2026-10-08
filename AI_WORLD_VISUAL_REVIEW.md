# AI WORLD VISUAL REVIEW PACKET

## What another AI should do

This is a visual + code cross-check of the browser 3D world. The reviewer should inspect the attached gameplay/survey screenshots AND inspect this branch if possible.

Do NOT judge only whether it looks pretty. Look for contradictions between the rendered world and the intended geography/physics.

## Repository

- Repo: Flames1720/my-new-repo
- Branch: world-drainage-foundation
- HEAD: e73513f3de018cb651021f00cf5883504e38e8c4
- Branch URL: https://github.com/Flames1720/my-new-repo/tree/world-drainage-foundation
- Latest preview deployment: https://virtual-family-core-njo2v5xou-flames-projects-5a93c7bd.vercel.app
- This branch is NOT approved for merge to main yet.

## World intent

The world is one connected causal system:

geology -> elevation -> landforms -> drainage -> water -> climate -> biology -> human geography

The world is finite for now but expandable later. Chunks are only a rendering/performance mechanism; they must not define global geography.

The target is a lightweight browser world, not photorealism. It should nevertheless have believable causal geography.

## What to inspect visually

### 1. WORLD view
This must be the actual game world, not a topology map.

At full-world zoom it should show the same kinds of things a player sees:
- terrain
- mountains
- water
- vegetation
- buildings/settlement
- animals/environmental actors where rendered
- atmosphere/sky/environmental layers where applicable

The survey camera is allowed to be expensive: all finite world chunks can be rendered simultaneously.

Test/inspect:
- rotate left/right
- tilt upward/downward
- view from above, side and oblique angles
- zoom from whole-world to a specific mountain/river/lake/house
- check whether geometry disappears, clips, or becomes hollow when viewed from unusual angles

### 2. TERRAIN view
This is intentionally stripped down to rock/terrain topology + water.
Use it to judge:
- mountain range continuity
- valleys/ridges/passes
- basins
- cliffs
- coastlines
- chunk seams
- holes/voids
- terrain beneath expected water

### 3. HYDROLOGY view
This is intentionally stripped down to water truth.
Use it to judge:
- water continuity
- source/headwater locations
- stream -> tributary -> river progression
- lake basins
- river destinations
- ocean connectivity
- flow direction
- suspicious isolated water
- expected water with no visible surface

## CRITICAL BUG HUNT

Pay special attention to these known symptoms:

1. A narrow gap between mountains where the player can become trapped and see below the world.
   - Decide whether this is an intentional canyon/crevasse or a geometry/chunk seam.
   - If the latter, identify likely cause.

2. Green/vegetated-looking terrain apparently covering river water.
   - Determine whether water exists underneath.
   - Determine whether terrain coloring, vegetation, depth, or water mesh layering is wrong.
   - A player must never mistake actual water for solid grass.

3. Water seeming to have an invisible wall around it.
   - Determine whether this is visual shoreline geometry or collision.
   - Check whether the player can approach banks naturally.

4. Rivers that are too flat, too wide, too shallow, or disconnected from terrain.
   - Rivers should follow drainage/topography rather than decorative hand-drawn splines.

5. Chunk boundaries.
   - No cracks, holes, floating terrain, sudden height steps, or water discontinuities at chunk borders.

6. Mountain realism.
   - Mountains should form ranges with meaningful ridges, valleys, foothills, passes and peaks rather than isolated noise blobs.
   - Some peaks can rise above clouds.

7. Water/terrain ordering.
   - No dry terrain rendered over expected water.
   - No water floating above a dry bank without geological justification.
   - No visible underside/empty space below terrain.

8. Camera.
   - Survey camera must be free/orbiting, not player-locked.
   - TPP/FPP gameplay camera should remain separate from survey camera.
   - Camera collision should not reveal the underside of the world.

## Code architecture to respect

The current hydrology foundation uses a deterministic grid:
- elevation + rainfall -> runoff
- depression conditioning
- 8-way flow routing
- upstream flow accumulation
- channel strength
- lake/ocean classification
- stream/spring/river classification
- local water-surface elevation

Current diagnostic probe previously found:
- 25,921 drainage cells
- 0 directed cycles
- 4,894 ocean cells
- 64 lake cells
- 6,352 channel cells
- 411 stream-class cells
- 522 river-class cells
- 14 terminal cells
- max accumulation about 52,349

These are code/model diagnostics, NOT proof that the rendered water looks correct.

Do not recommend reintroducing hand-authored river splines.

## Required reviewer output

Return a structured report:

### A. Visual verdict
- What looks correct
- What looks wrong
- What looks suspicious but needs runtime confirmation

### B. Geography
Rate 0-10:
- mountain ranges
- valleys/ridges
- basins
- coastline
- terrain continuity
- natural-looking elevation transitions

### C. Hydrology
Rate 0-10:
- source logic
- river paths
- tributaries
- lakes
- ocean connection
- water/terrain alignment
- visible flow logic

### D. Rendering/geometry bugs
For every suspected bug:
- screenshot location/description
- severity: critical/high/medium/low
- likely cause
- whether it is visual, geometry, collision, hydrology, or camera
- exact evidence

### E. World design
Identify anything that looks procedurally generated in a bad way:
- repeated patterns
- arbitrary roads/buildings
- impossible slopes
- rivers ignoring terrain
- vegetation ignoring water/climate
- mountains without geological logic

### F. Next fixes
Give no more than 10 fixes, ordered by importance.
Separate:
1. must-fix correctness
2. world-quality improvements
3. visual polish

Do NOT ask for a redesign of the entire project. Work from the existing causal architecture.

## Important verification rule

If the screenshot alone cannot prove something, say "needs runtime/code verification" rather than guessing.

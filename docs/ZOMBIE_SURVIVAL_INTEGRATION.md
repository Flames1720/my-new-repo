# Zombie Survival Integration Notes

## Design decision

The game remains on the existing world simulation. The independent Fire at Will world is not loaded or overlaid into this scene: it owns a separate flat arena, player controller and obstacle set. Only the reusable weapon rigs/tuning were brought across as actual code; the shooter gameplay was adapted to the world scene APIs.

## Scene integration

`src/zombie-survival.ts` receives the current `THREE.Scene` and `PerspectiveCamera`, player-position getter, terrain-height and water functions, occupancy test, and a sight-blocker provider from `src/main.ts`. It does not create another renderer or terrain.

Key integrations:
- Movement and camera continue to be driven by the existing player and FPP controller.
- Zombie motion calls the world's existing `canOccupy`, terrain-height, water, and water-depth functions.
- Hitscan uses the existing camera plus loaded world collision/sight blockers and zombie hit meshes.
- Safe-zone centers use the existing `HOME_X/HOME_Z` and `VILLAGE_X/VILLAGE_Z` world landmarks.
- The current minimap accepts optional survival radar data. When the mode is inactive, it receives no survival overlay.
- The survival HUD subscribes to health, weapon, ammo, alive-zombie count, wave and safe-zone state from the gameplay system.

## Controls

### Mobile landscape
- Left stick: movement.
- Right-side drag: camera look.
- Shoot: tap to fire; holding triggers the automatic rifle's sustained fire.
- Aim: hold to aim down sights.
- Reload: reload the current weapon.
- ↻ in the weapon row: switch pistol → shotgun → rifle.
- Existing Run/Jump/Use buttons remain in place.

### Desktop
- WASD: move.
- Mouse: look.
- Left mouse: fire.
- Right mouse: aim.
- R: reload.
- 1, 2, 3: switch weapons.
- Z or the top 🧟 button: toggle survival mode.

## Encounter and safe-zone rules

The default spawn is on the homestead side of the map and falls inside its safe radius. Survival opens through a mandatory landscape/fullscreen entry gate; loss of fullscreen reopens the gate and pauses an active run. The lobby is an immersive deployment screen with loadout selection and an animated infected silhouette. The homestead and settlement now use pulsing forcefield domes, rising energy bands and moving perimeter lights; weakening shifts the effect toward amber. These are also shown on the ground and existing minimap/full map. Players take no zombie damage inside a safe zone. Zombies try to leave zone boundaries and are not intentionally spawned inside one. Leaving a safe zone activates an initial small encounter wave; further waves are paced after the previous wave clears. Active enemy count is capped lower in low-power mode.

## Asset reuse

- `src/survival-weapons.ts` adapts the procedural pistol, shotgun and rifle rigs from the owner's `Flames1720/Fire-at-will-` project.
- `src/survival-audio.ts` adapts the source project's self-contained Web Audio synthesizer. Sound only initializes after user input, and its ambient drone is disabled when the player leaves survival mode.
- `src/zombie-survival.ts` uses low-poly articulated procedural infected meshes comparable to the source project's zombie construction. It does not claim imported animated zombie GLBs; the source prototype's zombie meshes are also created procedurally.
- The existing player rig and world character model selection remain intact. The gun is camera-mounted for first-person visibility; the player's third-person mesh is hidden by the existing FPP render path.

## Current limitations

- This remains local single-player gameplay. There is no server-authoritative multiplayer or shared loot state.
- Weapon/ammo/health reset with a new page session; world save data still belongs to the existing world.
- Ammo and medkits are collected automatically by proximity. A dedicated loot/interact UI is not implemented yet.
- Zombies use procedural walk/attack/death motion, not a sourced animation rig. Pathfinding is local obstacle-aware movement, not navmesh pathfinding.
- The minimap displays active simulated hostiles, so it is currently a tactical radar rather than an in-world visibility-only radar.
- Fire confirmation now adds a brief screen-edge recoil flash and a distinct crosshair hit tint on top of the weapon rig's existing recoil/muzzle/reload motion.
- The infected use procedural locomotion, timed arm swings, hit flashes and a shrink/fade death; this is not a sourced animation rig. Boss attacks currently lack a full wind-up/impact/shockwave sequence, and safe-zone final collapse/relocation still deserves a stronger event animation.
- Loot already floats and rotates but disappears on proximity pickup without a pull-in/collection burst. Wave/death/victory transitions and richer shell/hand weapon handling are additional animation opportunities.
- The UI and scene build, and the browser preview was exercised through fullscreen entry, loadout selection and run start. Physical phone/tablet behavior and the exterior view of the forcefield still need device verification, including button reach, orientation-lock support, collision edge cases, hit registration, memory use and performance.

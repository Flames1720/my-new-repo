# Zombie Survival Shooter Conversion — HUD & Gameplay Brief

## Product direction

Convert the existing lightweight Three.js world into a first-person zombie/monster survival shooter. Do NOT discard the existing world or start over: preserve terrain, streamed chunks, roads, water, buildings, collision foundations, minimap/world map, settings, and mobile-performance work wherever useful. The loop is dangerous exploration, looting, shooting, running from threats, and reaching safe zones.

Reuse the project's own existing character/animation work where it fits. The owner specifically wants characters from their separate Fire at Will prototype reused. First inspect whether those model files are actually accessible in the connected repository/branch and confirm exact paths and licenses; do not invent filenames. If unavailable, continue using existing local rigged character assets and report exactly what is missing. Do not copy third-party copyrighted assets without permission.

## Visual references researched

- [Call of Honor mobile FPS case study](https://arianhassani.dev/projects/call-of-honor/) emphasizes touchscreen-first aiming and controls, including mirrored controls for left-handed players.
- [Apple game controls guidance](https://developer.apple.com/design/human-interface-guidelines/game-controls) recommends comfortable thumb reach, separating controls from movement/camera input regions, recognizable action icons, and visible press feedback. Apply the principles to Android landscape too; the 44 pt guidance is a useful minimum target, not a literal CSS-pixel requirement.
- Study landscape FPS screenshots in the [mobile FPS UI showcase on Behance](https://www.behance.net/gallery/147183803/FPS-SHOOTING-GAME-UI) for button hierarchy and spacing. Use visual inspiration only; do not copy another game's exact art, logos, or screen composition.

## Landscape HUD layout

Design for 16:9 landscape first, with safe-area insets, responsive scaling, and no reliance on browser chrome being hidden. Use a cohesive survival-tactical style: dark translucent panels, restrained amber/orange danger accents, muted neutral surfaces, and green/teal safe-zone cues. Keep the environment visible; avoid opaque clutter.

### Top band
- Top-left player status: compact health bar and numeric health; show armor only if armor gameplay exists. Add damage feedback.
- Top-center encounter info: objective and wave/encounter number or remaining hostiles. Never show fake counts; bind to real state.
- Top-right: compact round minimap with player direction, hostile indicators only if genuinely known, and readable safe-zone status/distance. Keep pause/settings secondary.
- Optional compass ticks near top center if legible and not competing with objective text.

### Center
- Small high-contrast crosshair.
- Contextual pickup/interact prompt when aiming at loot, doors, safe-zone terminals, or usable objects.
- Brief hit marker only when a real hit is registered.
- Subtle damage vignette/directional indicator when player takes damage.
- Keep the center clear for spotting zombies and aiming.

### Bottom-left
- Large translucent virtual movement joystick.
- Separate sprint control/toggle with clear active state.
- Joystick gestures must never rotate the camera; touch-look belongs to the right-side look region.

### Bottom-right
- Largest thumb target: FIRE.
- Nearby but smaller AIM and RELOAD controls.
- INTERACT/PICKUP appears contextually; SWAP WEAPON only when a second weapon exists.
- Jump/crouch are secondary and should be added only if needed.
- Provide clear press/hold feedback and prevent controls from accidentally triggering look or movement.

### Bottom status strip
- Current weapon icon/name.
- Magazine ammo / reserve ammo, e.g. 12 / 48.
- Compact quick-use healing slot only if healing is implemented.
- Do not leave the nature-exploration inventory hotbar/emote controls on the combat HUD. Move map, settings, emotes, wildlife, photo/survey tools out of active combat mode or remove them from shooter mode as appropriate.

### Safe-zone feedback
- Use a distinct green/teal icon and label for SAFE ZONE while inside a safe area.
- Outside it, show a restrained danger state such as HOSTILE AREA. Do not invent a shrinking battle-royale circle unless that mechanic exists.
- Show distance/direction to the nearest known safe zone on the minimap and optional waypoint badge.
- Communicate safe-zone boundaries through visible landmarks: a gate, barrier, light beacon, sign, or similar. Never use an invisible wall as the only signal.
- In safe zones, enemies must not attack the player. Initially prevent enemies from entering; later breach events can be a deliberate feature.
- Place the first safe zone at a recognizable settlement/home base with a supply/reload point. Players should understand why it is safe and how to return.

## First gameplay slice

Implement one compact region using existing world systems:
1. A safe settlement/base that visibly protects the player.
2. An unsafe surrounding area with roads, vegetation, a few buildings/loot locations, and zombie spawn points.
3. One zombie archetype with idle/patrol, detect/chase, attack, take-damage, and death states; collisions must respect the environment.
4. One functional firearm with firing, hit detection, ammo, reload, muzzle flash/hit feedback, and damage applied to zombies.
5. Player health and death/restart flow.
6. At least one pickup, such as ammunition or a healing item.
7. A minimap indicator and safe/hostile HUD state reflecting actual world state.
8. Mobile landscape controls and desktop keyboard/mouse controls.

Do not implement fake HUD numbers or buttons with no gameplay effect. If a feature is not implemented, omit its HUD element or mark it clearly as planned in development notes.

## Technical integration rules

- Inspect the existing code before changing it. Reuse working systems instead of rewriting the world.
- Keep Three.js, terrain, water, chunk, and collision foundations unless a measured technical reason requires changes.
- Keep combat, enemy AI, player health, pickups, safe-zone detection, input, and HUD updates modular; do not bury every new system in src/main.ts.
- Use raycast/hitscan shooting initially if suitable; walls/obstacles must block shots and zombies take damage only when hit.
- Use an explicit safe-zone volume/region query shared by player, enemy AI, and HUD.
- Preserve desktop support while optimizing touch interactions for Android.
- Make small, reversible commits on this feature branch. Do not merge into main until the user reviews it.
- Do not break the current world-exploration systems without a clear replacement path.

## Verification checklist

- Run type-check/lint and production build.
- Verify first-person camera, touch-look, joystick, fire, aim, reload, interaction, and pause controls.
- Verify bullets cannot damage zombies through solid walls.
- Verify zombies chase/attack outside safe zones but cannot damage the player inside one.
- Verify player death/restart and ammunition counts.
- Verify minimap and safe-zone HUD reflect real positions/state.
- Test on an Android landscape browser if possible; otherwise state clearly that device testing was not done.
- Report exact changed files, commit SHA, build output, browser/device testing performed, and remaining issues.

## Immediate task for the coding agent

Work from feature/zombie-survival-hud, based on integration/character-world-foundation. Implement the first functional shooter slice, starting with the responsive landscape HUD shell and then wiring every displayed value/control to real gameplay state. Inspect Fire at Will for the intended character assets, but if the connected repository contains no model files, do not stall or fabricate paths: use current local character assets and report the asset-source limitation. Keep the existing world. Do not merge into main yet.
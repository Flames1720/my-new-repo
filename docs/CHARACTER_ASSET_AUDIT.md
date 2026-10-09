# Character, animation and magic-effects audit

**Repository:** `Flames1720/my-new-repo`  
**Audit date:** 2026-10-09  
**Branch:** `chore/character-action-foundation`

## Executive decision

Keep `public/models/characters/quaternius-adventurer.glb` as the default. It is compact (1,944,116 bytes), has a usable skinned mesh (10,198 measured triangles, 62 bones), and includes the broadest immediately useful action set: locomotion, sword slash, punches, hit reactions, roll, interaction and death. The new `PlayerCharacter.playAction()` API exposes only animation actions; damage, hitboxes, cooldowns and skill progression remain intentionally out of scope.

No KayKit files were downloaded. A procedural Three.js effects module was added instead: [`src/magic-effects.ts`](../src/magic-effects.ts).

## Verified inventory

Triangle counts are measured from loaded indexed/non-indexed position buffers. File sizes are the checked-in GLB byte sizes. Clip durations are seconds from the embedded animation data.

| Asset | Size | Mesh / triangles | Skeleton | Embedded clips and capability | Usage / classification | License status |
|---|---:|---:|---:|---|---|---|
| `public/models/characters/quaternius-adventurer.glb` | 1.94 MB | 15 skinned meshes / 10,198 | 62 bones, Quaternius `Root/Body/Hips/...` naming | 24 clips: `Death`, `Gun_Shoot`, `HitRecieve`, `HitRecieve_2`, `Idle`, `Idle_Gun`, `Idle_Gun_Pointing`, `Idle_Gun_Shoot`, `Idle_Neutral`, `Idle_Sword`, `Interact`, `Kick_Left/Right`, `Punch_Left/Right`, `Roll`, `Run`, `Run_Back`, `Run_Left/Right`, `Run_Shoot`, `Sword_Slash`, `Walk`, `Wave` | **KEEP / default / active** | CC0 per Poly Pizza listing; provenance in `ASSET_CREDITS.md` |
| `public/models/characters/quaternius-animated-human.glb` | 0.70 MB | 1 skinned mesh / 1,578 | 41 bones, Mixamo-style names | 8 clips: `Death`, `Idle`, `Jump`, `Punch`, `Run`, `Walk`, `Working`, plus one unnamed exporter action | **OPTIONAL / active selector**; useful lightweight male alternative, but less action coverage | CC0 per Poly Pizza listing |
| `public/models/characters/quaternius-animated-woman.glb` | 1.49 MB | 10 skinned meshes / 6,108 | 62 bones, same Quaternius-style family as Adventurer | 24 clips matching the Adventurer action family, with longer durations; includes slash, punches, hit reactions and death | **OPTIONAL / active selector**; preserves female variety and is the closest alternate | CC0 per Poly Pizza listing |
| `public/models/kenney-adventurer.glb` | 0.27 MB | 1 skinned mesh / 1,604 | 58 bones including IK/controller bones | `Idle`, `Jump`, `Run` only | **OPTIONAL / active selector**; very small fallback, no combat/cast capability | Kenney CC0 license checked in at `public/models/Kenney-CC0-License.txt` |
| `public/models/characters/mixamo-walker.glb` | 2.26 MB | 2 skinned meshes / 49,112 | 68 bones, renamed Mixamo hierarchy | one `mixamo.com` walk clip | **OPTIONAL / active selector**; useful only as a supplied walk reference, expensive for its capability | User-supplied; redistribution/license not independently asserted |
| `public/assets/rigged-model.glb` | 8.27 MB | 1 skinned mesh / 19,364 | 22 bones, Mixamo names | `Idle`, `T-Pose`, `Jog Backward`, `Jog Backward Left/Right`, `Jog Forward` | **OPTIONAL / legacy selector**; retained because provenance and future use are uncertain | User-supplied; redistribution/license not independently asserted |

All models have a usable mesh; none is animation-only. The loader is lazy: only the selected player GLB is loaded. The procedural fallback remains available while a GLB loads or fails.

## Cleanup

The removed root file `walking_-_mixamo_default_character.glb` was an exact byte-for-byte duplicate of `public/models/characters/mixamo-walker.glb`:

- SHA-256 for both before cleanup: `2139270f1b3fd61b4df4185409884d7df30a5b0fdf3285024dcf735e31fc1def`
- Both were 2,261,200 bytes.
- `rg` found no application reference to the root copy; the selector references `public/models/characters/mixamo-walker.glb`.
- Space reclaimed on this branch: **2,261,200 bytes (~2.16 MiB)**.

No other asset was removed. The cleanup is on a separate branch and is reversible with Git.

## Animation matrix and handoff

| Gameplay intent | Default clip / alias | Status |
|---|---|---|
| Idle | `CharacterArmature\|Idle_Neutral` or `Idle` | Direct; existing locomotion alias |
| Walk / run | `CharacterArmature\|Walk` / `Run` | Direct; existing locomotion aliases |
| Jump / fall | no fall clip; jump fallback/procedural airborne pose | Working; fall remains procedural |
| Physical attack | `CharacterArmature\|Sword_Slash` (fallback `Punch_Left`, then `Punch_Right`) | **Direct and ready** via `playAction('attack')` |
| Hit reaction | `CharacterArmature\|HitRecieve` (fallback `_2`) | **Direct and ready** via `playAction('hit')` |
| Death | `CharacterArmature\|Death` | **Direct and ready** via `playAction('death')` |
| Roll / dodge | `CharacterArmature\|Roll` | Available in source asset; not exposed as a gameplay action yet |
| Magic cast | no spell-specific clip in checked-in assets; `Interact` is the documented fallback | **Not a true cast**. `playAction('cast')` can provide a neutral gesture until a compatible spell library is piloted |
| Defense / block / channel / heal / purification / dark | none in current checked-in clips | Missing; use procedural pose/effects or source a compatible library later |

The semantic aliases are deliberately registered from the loaded asset's actual clip names. GLB format alone is not treated as proof of compatibility: the Adventurer and Animated Woman share the 62-bone naming family, while the Human, custom model, Mixamo Walker and Kenney asset use different hierarchies and should not receive cross-rig clips without retargeting.

### API added

```ts
player.playAction('attack'); // Sword_Slash -> Punch fallback
player.playAction('hit');
player.playAction('death');
player.playAction('cast');   // spell clip if present, otherwise Interact fallback
player.hasAction('attack');
```

Actions are one-shot, cross-fade from the current animation, temporarily take priority over locomotion, and return to locomotion when finished. They do not move the world player or implement combat outcomes.

## Lightweight magic starter pack

`src/magic-effects.ts` contains no external dependency and uses only Three.js primitives:

- `createMagicOrb(element)` for hand charges and projectiles.
- `createMagicBurst(element)` for release/impact flashes and area markers.
- `MagicProjectileEffect` for a short-lived projectile with a reusable trail-ready update loop.
- Supported palette kinds: `fire`, `lightning`, `wind`, `water`, `dark`, `purification`.

The intended first showcase is `playAction('cast')` plus a `MagicProjectileEffect('fire', ...)`; wiring that to spell selection, damage or enemy systems is intentionally left to the next gameplay task.

## Free resource shortlist

These are optional follow-ups, not new runtime dependencies:

1. [KayKit Character Animations](https://kaylousberg.itch.io/kaykit-character-animations) — free/CC0-oriented low-poly animation collection reported to include magic/spellcasting actions; verify the current download contents and exact rig variant before integration.
2. [KayKit Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) — matching low-poly rigged character set with GLTF/FBX exports; suitable as a second-character pilot, not a replacement for the current default.
3. [Quaternius / Poly Pizza Adventurer source](https://poly.pizza/m/5EGWBMpuXq) — current default provenance and existing action source.
4. [Kenney Animated Characters 3](https://kenney-assets.itch.io/animated-characters-3) — compact CC0 alternative already present in the repository.

Before adding any library, compare its skeleton names to the target mesh, measure the compressed download, and keep it outside the default loading path.

## Verification and remaining risks

- `npm run lint`: **passed** (`tsc --noEmit`).
- `npm run build`: **passed** (`tsc && vite build`). Vite emitted only the existing large-bundle advisory (`759.57 kB` minified JS); no new asset was bundled because the effects module is an opt-in import.
- Asset inspection used Three.js `GLTFLoader` and the checked-in files, not filename assumptions.
- The two supplied/user-provenance models remain because their redistribution terms are not independently verified.
- `HitRecieve` is the source asset's spelling; the alias also accepts the correctly spelled form for future assets.
- No spell-specific animation is verified in the current repository. The cast action fallback must not be presented as a final magic animation.

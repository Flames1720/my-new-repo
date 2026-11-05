# Multiplayer FPS + Arena Mode

**Branch:** `feature/multiplayer-fps-arena`  
**Goal:** Turn the existing Island Outbreak foundation into a proper multiplayer FPS that also works alone, without forcing the heavy open world for every match.

## Why this approach

The current open world is excellent but too heavy for tight multiplayer FPS sessions on mobile. We keep it for the existing zombie survival / exploration experience and add a **dedicated lightweight arena** for multiplayer (and single-player bot matches).

## Modes

1. **Open World Survival** (already exists)  
   Single-player zombie waves, homestead, settlement, full procedural world.

2. **Arena FPS** (new)  
   Small, performant map optimized for shooting.  
   - Solo vs bots  
   - Multiplayer free-for-all / team (friends join via room code from any location)

## Multiplayer architecture (Supabase Realtime)

No heavy database tables required for the first version.

| Concern              | Solution                                      |
|----------------------|-----------------------------------------------|
| Who is in the room   | Supabase **Presence**                         |
| Positions / shots    | Supabase **Broadcast** (high frequency)       |
| Room codes           | Short codes + Presence                        |
| Auth / pilot         | Existing pilot system (optional for multiplayer) |
| Persistence          | Optional later (scores, loadouts)             |

Friends in different countries join the same room channel. Latency is good enough for casual FPS when both have decent connections.

## Controllers & Animation

- Keep the existing desktop + mobile controllers (they are already solid).
- Improve first-person weapon feel, hit reactions, and death animations while we work.
- Remote players use the same character system (Quaternius / Mixamo / etc.) so animation stays consistent.

## Arena design goals

- Small footprint (fast load on phone).
- Good sightlines + cover + verticality.
- Spawn points, simple props, no streaming chunks.
- Same weapon system and hitscan as survival mode.

## Implementation order

1. ✅ Branch + plan + multiplayer types + room manager + basic arena geometry
2. Wire arena mode entry from lobby
3. Local player + bots in arena
4. Remote player sync (position, rotation, shoot, hit, death)
5. Room UI (create / join by code)
6. Polish animation + controllers
7. Team mode / scoreboard / match flow

## Decisions (do not casually reverse)

- Arena is a separate scene/mode; do not force the full open world for multiplayer matches.
- Prefer Supabase Realtime Broadcast + Presence over a custom always-on game server for v1.
- Reuse existing weapons, character animation, and mobile controls.
- Single-player must always work (bots or pure local arena).

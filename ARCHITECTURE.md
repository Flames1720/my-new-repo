# ARCHITECTURE.md — Protected Project Decisions

This document records cross-cutting decisions that agents should not casually reverse. If a change violates one, document the reason in AGENT_CHANGELOG.md and update this file deliberately.

## 1. Source of truth

The repository code is the authority for what currently exists. These documents describe intent, architecture, milestones, verification and handoff context. If docs and code disagree, inspect git history and the actual implementation.

## 2. Multi-agent coordination

Required:
- PROJECT_PLAN.md = what we are building and status
- AGENT_CHANGELOG.md = what agents actually did and verified
- ARCHITECTURE.md = protected cross-cutting decisions

Every agent reads the first two before meaningful work and this file when touching shared architecture.

## 3. Deterministic world

The world must eventually be reproducible from a stable seed and generation version. Changing procedural algorithms can change the world and must be treated as a deliberate world-generation change.

## 4. Chunks do not own geography

Chunks exist for streaming, partitioning and performance. Major geography such as mountain ranges, rivers, lakes, coastlines and climate regions must remain globally coherent across chunk boundaries.

## 5. World fields

The long-term world model should expose deterministic environmental fields such as:
- elevation
- slope
- geology/landform
- temperature
- rainfall
- humidity
- soil moisture
- water presence/depth
- water-flow direction
- water-flow amount
- wind vector
- biome/habitat suitability

Derived systems should consume these fields instead of independently inventing contradictory facts.

## 6. Hydrology is a network

Water is not a random terrain decoration.

Target causal structure:
precipitation -> runoff -> drainage -> streams -> tributaries -> rivers/lakes -> sea/ocean/sink

A river needs a source and downstream path. A lake needs a basin. Flow should be derived from terrain/drainage, not from arbitrary blue cells.

## 7. Geography affects physics

Physical behavior reads environmental state. Steep slopes can limit climbing or cause sliding. Terrain materials can affect movement. Shallow water allows wading; deep water allows swimming; rivers can impose current; waterfalls can impose hazards.

## 8. Player physics

Prefer a lightweight kinematic controller unless a real requirement proves a full rigid-body engine necessary.

Target:
input -> desired movement -> environment queries -> collision resolution -> position/velocity -> camera

Use simple collider volumes and spatial partitioning instead of expensive mesh-vs-mesh collision where possible.

## 9. Separate collision systems

Keep physical collision, camera collision and interaction targeting separate. An interaction ray must not accidentally become player collision.

## 10. Biology depends on habitat

Animal behavior should consider water, food, temperature, elevation, slope, shelter, vegetation and human disturbance. Long-term ecology should not be a universal random-wander system.

## 11. Weather is a world system

Weather should eventually affect clouds, precipitation, wind, temperature, water levels, soil moisture, vegetation, animal behavior and ocean waves.

## 12. Ocean/wave approximation

No full computational fluid dynamics is required. Approximate waves using wind, wind duration, fetch, depth and shoreline geometry. Wave behavior should change with weather and coast shape.

## 13. Persistence

Target:
deterministic generated base world + persistent deltas = current world

Persist mutations rather than storing every generated object when deterministic reconstruction is sufficient.

## 14. Performance

The primary runtime is a mobile browser. Prefer deterministic generation, chunk streaming, spatial hashing/grids, LOD, distance-based simulation, sleeping distant systems and compact data.

## 15. Simulation tiers

Tier 0: visible/near player, full interaction and physics.
Tier 1: nearby, simplified simulation.
Tier 2: distant, statistical/coarse updates.
Tier 3: unloaded, deterministic reconstruction plus sparse persistent state.

## 16. World expansion

The world is finite at any given playable boundary but designed to expand. Expansion must preserve the same seed/version and geographic, river, climate and biome continuity.

## 17. Change discipline

Before replacing a system:
1. inspect it
2. identify consumers
3. identify persistence/API assumptions
4. make the smallest coherent change
5. build/typecheck
6. runtime-test when possible
7. document consequences

## 18. Verification discipline

Never claim fixed, works or complete without the corresponding evidence. A successful build proves compilation, not gameplay behavior. A browser test proves only the tested path.

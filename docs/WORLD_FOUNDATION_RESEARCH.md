# World-foundation research and recommendation

**Repository:** `Flames1720/my-new-repo`  
**Checked:** 2026-10-09  
**Research branch:** `research/world-foundation-comparison`

## Recommendation

Do **not** replace the current world with a third-party engine yet. Use a **hybrid continuation**:

1. Keep the existing Three.js world, terrain functions, hydrology, chunk/voxel layer, collision queries, water boundaries, resource interactions and camera/input systems.
2. Reuse legally clear modular environment art, beginning with Kenney Nature Kit assets converted or selected as compact GLBs. Kenney lists the pack as 330 CC0 3D assets.[1]
3. Borrow meshing, chunk and instancing ideas from voxel engines only where a measured mobile bottleneck appears. Do not import an entire legacy engine into the current runtime.
4. Run a small visual/streaming spike before changing terrain ownership: one representative chunk, one lake edge, one road, one resource and one buildable plot. The spike should be reversible and should not change the current world branch.

This preserves the project’s identity and the substantial existing world work. The current code already has a coherent foundation: `src/world.ts` is 1,656 lines of terrain, biome and hydrology logic; `src/voxel.ts` is 749 lines of voxel storage and survey-volume meshing; `src/terrain.ts` provides shared height, water and color queries; and `src/main.ts` owns player movement, collision, interaction and touch controls. Replacing those systems would be a rewrite, not an asset improvement.

## Candidates evaluated

### 1. Kenney Nature Kit plus the current world — strongest practical choice

**Link:** [Kenney Nature Kit](https://kenney.nl/assets/nature-kit)  
**Type:** modular environment assets, not a world engine.  
**License:** the official page identifies the pack as **Creative Commons CC0**.[1]  
**Scope:** 330 nature/tree/rock/foliage assets are listed on the official page.[1]

What it already gives us is a coherent low-poly vocabulary for trees, rocks, foliage and outdoor dressing. It does not provide terrain generation, streaming, collision, water simulation, roads, settlements, building placement or multiplayer. Those remain our responsibility, which is a limitation but also the reason it fits safely: the current project already owns those gameplay-facing systems.

The official page does not expose a verified download-size figure in the fetched content, so no size is claimed here. A third-party GLB-ready redistribution advertises 329 GLB models, PNG previews and the original Kenney license notes.[2] It is convenient, but I would prefer downloading the official source pack and converting only the small subset we use. That avoids making a third-party repack a runtime or provenance dependency.

**Compatibility:** high at the asset level. Three.js can load converted GLB files through the project’s existing loader. Use shared materials, instancing for repeated trees/rocks, low-resolution collision proxies and chunk ownership. Keep the current generated terrain and water as the authority rather than using decorative terrain meshes as collision.

**Mobile risk:** the pack is large as a collection even if individual models are small. Do not load the full pack. Start with approximately 12–20 selected meshes, compress textures where present, and measure draw calls and memory on a mid-range Android device.

**Migration:** additive and reversible. Add an `environment-kit` registry beside the existing procedural assets, replace one tree/rock family at a time, and keep the current fallback meshes until visual and frame-time checks pass.

### 2. Quaternius 150+ LowPoly Nature Models — strongest alternative art source

**Link:** [Quaternius 150+ LowPoly Nature Models](https://quaternius.itch.io/150-lowpoly-nature-models)  
**Type:** modular nature/environment asset pack.  
**License:** **CC0**, explicitly stated on the creator page.[3]  
**Formats:** `.Blend`, `.FBX` and `.OBJ`.[3]  
**Verified download size:** the page lists `Ultimate Nature Pack by Quaternius.zip` at **21 MB**.[3]

This is a credible source for a more stylized fantasy-natural look and includes trees, plants and rocks across multiple biomes. It is not a ready world and does not solve terrain, roads, water, collision or streaming. It would need a conversion step to GLB and a controlled asset subset.

**Compatibility:** medium-high at the asset level, but lower than Kenney for immediate Three.js use because the fetched page does not list GLB as an included format. Convert and inspect each selected model before checking it in. Use the same instancing, chunk disposal and collision-proxy rules as the Kenney option.

**Mobile risk:** the 21 MB archive is only the source download, not the runtime cost. Runtime risk depends on selected meshes, material count and texture conversion. The pack is suitable for a curated subset, not wholesale loading.

**Migration:** additive and reversible. Keep it as a visual alternative to Kenney, not a terrain-engine replacement.

### 3. voxel-engine — useful reference, poor drop-in replacement

**Link:** [voxel-engine](https://github.com/max-mapper/voxel-engine) and its [voxel.js site](http://voxeljs.com)  
**Type:** browser voxel game engine with chunked voxel storage, culled meshing, player AABB and generated worlds.  
**License:** GitHub metadata identifies **BSD 3-Clause**.[4]  
**Repository size:** GitHub reports about **3,237 KB**.[4]  
**Live/demo material:** the README provides a browser-oriented `createGame()` usage pattern and a hello-world template.[5]

What it already has is the closest match to block-world primitives: 32³-style chunk concepts, chunk-distance loading, generated voxels, a culled mesher, player AABB and block materials.[5] It does not match our current continuous heightfield, hydrology solver, third-person/first-person camera goals, touch controls, stylized GLB characters, resource interaction, settlement logic or current save/voxel-edit boundaries.

**Compatibility:** low as a wholesale dependency. Its documented API and conventions are older CommonJS/JavaScript patterns, while this project is modern TypeScript/Vite with Three.js 0.180. A direct import would create two world models and two ownership systems. It is more valuable as a reference for greedy/culled meshing, chunk invalidation and voxel edit semantics than as a runtime foundation.

**Mobile risk:** the chunk model can be efficient when meshed and streamed carefully, but the legacy dependency graph, texture-atlas assumptions and unknown current-device performance make a direct adoption risky. The GitHub metadata says the repository was last pushed in 2017 even though the repository metadata itself was updated more recently.[4]

**Migration:** if needed, copy or reimplement only isolated algorithms behind tests in a separate spike. Do not copy the engine wholesale. Rollback is then a branch deletion rather than a world rewrite.

### 4. OpenWorldJS — technically relevant demo, not legally ready

**Link:** [OpenWorldJS](https://github.com/obecerra3/OpenWorldJS), with a [live GitHub Pages demo](https://obecerra3.github.io/OpenWorldJS/).  
**Type:** Three.js/Ammo.js open-world prototype and terrain demo.  
**Declared package license:** `ISC` in `package.json`.[6]  
**Repository metadata:** GitHub reports **no detected repository license** and a repository size of about **70,939 KB**.[7]

This candidate is technically interesting because the README describes first- and third-person movement, raycast/collider support, Ammo terrain colliders, a moving chunk of height data, GPGPU-generated terrain, procedural textures and animation states.[8] Those are relevant ideas for this project.

It is not a safe reusable foundation yet. The repository has no detected GitHub license, its package declares ISC but that does not automatically clarify the license status of every vendored library, shader, model or skybox, and the project includes a substantial legacy library footprint. The README also says the project is still in development and contains a maze, debug systems and wrappers that do not map cleanly to this codebase.[8]

**Decision:** reject for direct reuse unless the authors provide a clear license/provenance statement for the whole repository and its bundled assets. Keep it as a technical reference only.

### 5. PlayCanvas engine — capable but a full engine migration

**Link:** [PlayCanvas Engine](https://github.com/playcanvas/engine) and [official site](https://playcanvas.com/).  
**Type:** complete browser engine, not an environment pack.  
**License:** the repository’s license is **MIT**.[9]  
**Capabilities:** WebGL2/WebGPU, Ammo physics, animation, touch/gamepad input, glTF/Draco/Basis asset streaming and TypeScript/JavaScript scripting are listed in the project README.[10]

It is a credible production web engine, but adopting it would replace the project’s renderer, scene graph, input abstraction, animation integration and likely much of the world/entity wiring. It does not provide our desired fantasy world out of the box. The license is permissive, but the migration cost is not justified by the current scenery problem.

**Decision:** reject for this project phase. Revisit only if the product requirements change from “improve our Three.js world” to “migrate to a different engine.”

## Comparison against the non-negotiable requirements

- **Free and legally reusable:** Kenney and Quaternius are the clearest asset choices. voxel-engine is BSD-3-Clause. OpenWorldJS is not sufficiently verified despite an ISC package declaration. PlayCanvas engine is MIT, but an engine license does not provide a ready world.
- **Three.js/Vite compatibility:** Kenney and Quaternius assets fit with conversion/curation. voxel-engine and OpenWorldJS would require architecture work. PlayCanvas would be a rewrite.
- **Mobile:** curated GLBs, instancing, chunk streaming and collision proxies are safer than a full engine swap. No candidate provides a verified mobile performance result for this specific game.
- **Cameras and controls:** retaining the current code preserves third-person, first-person and touch behavior. OpenWorldJS has relevant desktop camera ideas but would not preserve our UI or touch system without porting.
- **Collision, water and gathering:** only the current project already has the needed connected systems. None of the candidates supplies a drop-in solution for our terrain, water boundaries, resources and building placement together.
- **Map, boundary and expansion:** the current seeded world and chunk/voxel code remain the lowest-risk authority. A candidate engine would require a new save/map contract.
- **Future wildlife, settlements, housing, combat, magic and multiplayer:** these are entity/gameplay concerns. Keeping the current world APIs avoids coupling them to a third-party engine’s scene, physics or networking model.

## Practical next steps

1. Create a **separate visual spike branch** from `main`, not from the character-action branch.
2. Add a tiny curated registry with 3–5 Kenney or Quaternius models only. Do not commit the whole pack.
3. Replace one procedural tree family and one rock family in a single streamed chunk. Keep generated fallback meshes available.
4. Add per-instance bounds or simplified colliders; never use high-detail decorative meshes for player collision.
5. Measure Android frame time, draw calls, memory and load time at the current low-power settings.
6. Test a lake edge, road, resource gathering target, home/building placement and map marker in the same representative area.
7. Keep a rollback switch that selects the existing procedural asset registry. If the spike misses the budget, discard the branch without touching terrain ownership.

A full world-engine migration should not begin from this research. The evidence supports **better curated scenery on the existing foundation**, not replacing the foundation.

## Character branch recovery and verification

The character branch was verified separately from this research branch:

- Branch: [`chore/character-action-foundation`](https://github.com/Flames1720/my-new-repo/tree/chore/character-action-foundation)
- Latest commit after disposal fix: `a435c2d`
- Character branch diff against current `main`: six files changed; no UI files changed.
- `npm run lint`: passed.
- `npm run build`: passed, with the existing Vite advisory about a 759.57 kB minified JavaScript chunk.
- `git diff --check`: passed.
- The branch has explicit `disposeMagicEffect()` / `MagicProjectileEffect.dispose()` cleanup. Callers still own scene removal and must invoke disposal before removing temporary effects.
- No runtime/browser behavior test was claimed. The build and static inspection do not prove that an action looks correct on a device.
- The remote `modern-rpg-ui-foundation` branch remains separate; it was not merged or modified by this work.

## References

[1]: https://kenney.nl/assets/nature-kit "Kenney Nature Kit official asset page"
[2]: https://eclair-assets.itch.io/nature-kit-glb-pack-329-free-cc0-3d-models "Nature Kit GLB redistribution with source and license notes"
[3]: https://quaternius.itch.io/150-lowpoly-nature-models "Quaternius 150+ LowPoly Nature Models"
[4]: https://api.github.com/repos/max-mapper/voxel-engine "voxel-engine GitHub repository metadata and BSD-3-Clause license"
[5]: https://github.com/max-mapper/voxel-engine "voxel-engine README and browser voxel architecture"
[6]: https://raw.githubusercontent.com/obecerra3/OpenWorldJS/master/package.json "OpenWorldJS package declaration"
[7]: https://api.github.com/repos/obecerra3/OpenWorldJS "OpenWorldJS GitHub repository metadata"
[8]: https://github.com/obecerra3/OpenWorldJS "OpenWorldJS README, terrain, physics and animation claims"
[9]: https://raw.githubusercontent.com/playcanvas/engine/main/LICENSE "PlayCanvas Engine MIT license"
[10]: https://github.com/playcanvas/engine "PlayCanvas Engine capabilities and setup"

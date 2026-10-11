# Gameplay performance review — 11 October 2026

Read-only analysis of consented Supabase reports. Latest inspected upload: 18:22:48 UTC. No accounts, consent settings, progress or reports were changed.

## Observed device groups

FPS is total captured frames divided by total captured duration. Render, simulation and gap averages are weighted by frames; action/phase costs by their recorded observation counts. These are uploaded active-run windows, not all admitted players or a representative hardware survey.

| Build suffix | Reported Android viewport / memory | Windows | Captured minutes | FPS | Frames over 50 ms | Render ms | Simulation ms | Gap ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 7a8e00998127 | 853×384 / 4 GB | 41 | 3.5 | 28.7 | 8.8% | 20.65 | 5.07 | 9.00 |
| 8ea16e8e19a7 | 1066×480 / 8 GB | 265 | 22.3 | 53.1 | 0.3% | 11.73 | 1.97 | 5.08 |
| 23b66ddc49d7 | 800×360 / 8 GB | 493 | 41.8 | 28.1 | 15.7% | 17.66 | 4.83 | 12.99 |
| 23b66ddc49d7 | 785×360 / 4 GB | 134 | 11.3 | 40.8 | 2.5% | 15.28 | 3.56 | 5.62 |

Each row has one reporting player. Comparing these rows does not establish a release regression: device, play duration, view, wave and graphics settings differ. New uploads can include older builds because reports are queued until a run ends.

## Priorities supported by the reports

- Firing invocations on 7a8e00998127: 240 observations, average 9.916 ms, maximum 127.5 ms. Enemy AI: 6,004 observations, average 0.271 ms. Combat-effects updates round to 0.000 ms on this build. The firing measurement includes the whole controller call, not solely triangle tests or successful shots.
- Older 23b66ddc49d7: firing averaged 13.819 ms across 2,199 invocations, maximum 106.2 ms. The larger sample strengthens the case for addressing firing rather than reducing AI further.
- Rendering remains the largest measured frame component. On the latest reporting build, 250+ draw-call windows averaged 25.2 FPS, versus 29.3 FPS for 150–249 calls. This association alone is not proof of causality, but supports reducing redundant rendering work.
- No recorded runtime-error or unhandled-rejection actions in the three builds above. This does not prove all player sessions are error-free.
- The frame gap includes scheduling, other work and browser/GPU/compositor waits. It is not GPU duration, and these reports cannot establish phone temperature or thermal throttling.

## Implemented changes

1. Shots update the camera and relevant collision roots instead of forcing every loaded world object to update its matrix. Nested collider roots are deduplicated; their original mesh list is prepared once and reused across shotgun pellets. Local geometry boxes reject misses before triangle tests.
2. Rigid zombie torso/head/face geometry renders as one vertex-coloured mesh. Animated limbs and the unlit chest marker stay separate. Each enemy renders six meshes instead of eight (25% fewer); original head/body surfaces remain authoritative for exact hits, and damage flash still works.
3. Static resource descendants retain their local matrices. Movable/harvestable roots remain automatic, so source raycasts and instanced placement continue to follow changes.

Enemy counts, wave totals, damage, spawn timing, graphics quality and resolution were not changed by this performance update.

## Validation and practical limits

`tools/shot_performance_regression.mjs` compares immutable baseline 7a8e009981274fa36e716b2f8298f1b0c8968279 with the new controller on a fixed local workload: 121 chunks, 12 props/chunk and deliberately nested collider markers, 10 warmup shots and 50 measured shots per weapon.

One run measured median pistol firing 0.959 → 0.362 ms and shotgun firing 1.824 → 0.757 ms. Mesh raycast calls fell 25%, and forced whole-scene updates fell from one per shot to zero. Timings vary by host; they are not a prediction of phone FPS. Regression assertions cover work reduction and correct hits rather than requiring a timing threshold.

Real WebGL model checks render all three enemy types in 19 calls including the floor (formerly 25 for equivalent models), verify damage flash and inspect their appearance. Additional regressions cover hidden source hit meshes, moved doors, exact headshot surfaces, limb animation, resource shrinking/instance transforms, muzzle origins/spread, automatic reload, and timed Pulse/Medic effects. The mobile browser check uses mocked account transport and actual touch combat without live database writes.

The next evidence needed is new completed-run reports on the new build, preferably from the same phones with the same graphics settings and comparable gameplay. Reassess firing timings, render cost, slow-frame percentage, and sustained late-run performance before increasing simultaneous enemies.

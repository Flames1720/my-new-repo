# Island Outbreak | Living implementation checklist

**Status: IN PROGRESS — NOT FINALIZED.**
**Branch:** `feature/zombie-survival-world-v2`. Do not merge into `main` without approval.
**Rules:** Tick `[x]` only after actual work and verification. Do not equate a successful build with on-device validation. Do not delete undecided features. Record implementation commits and findings in `AGENT_CHANGELOG.md`. Keep FPS and memory costs under control.

## 0. Decisions and audit
- [x] Collect user's explicit Keep / Adjust / Remove / Later / Review choices.
- [x] Inspect main lobby/settings markup and current navigation implementation.
- [x] Inspect firing code: camera-based raycasts, randomized spread and muzzle-origin visual tracers.
- [x] Establish symptom: approximately 40 px consistently LEFT (shoot-button side) even with single-bullet weapons, and possible misses on thin targets.
- [x] Inspect crosshair CSS and coordinates, ADS weapon transforms, camera update order, touch input ownership, fullscreen events and relevant dependencies. (code/source verified; mobile checks pending where relevant)
- [ ] Establish reproducible test scenarios and capture baseline evidence.

## 1. Accurate aiming — highest priority
- [ ] Measure visual crosshair center vs camera projection center at actual phone viewport.
- [x] Identify separate camera-based hit rays vs muzzle-based visual tracers; implement zero ADS spread and align ADS tracer origin (source/build verified).
- [ ] Compare diagnostic single shots and visible impacts on phone at fixed aim.
- [ ] Find and correct root cause of consistent leftward impact offset (do NOT hardcode a blind 40px compensation).
- [ ] Verify aim/camera transforms and frame update order during ADS and fire.
- [x] Implement zero-spread camera-centered single-bullet ADS for pistol and rifle; hip-fire spread kept (build verified)
- [ ] Validate exact impact alignment against the on-screen reticle at multiple distances on the user's phone.
- [x] Center shotgun spread on aim point. (code/source verified; mobile checks pending where relevant)
- [x] Confirm zombie arm meshes are marked as hit targets in source.
- [ ] Verify arm hits, world occlusion and visible hit feedback on phone.
- [ ] Test hip-fire and ADS at close, medium and long range; record results.

## 2. Responsive combat and touch
- [x] Reduce ADS activation latency; review FOV and gun animation responsiveness. (code/source verified; mobile checks pending where relevant)
- [x] Audit camera smoothing, pointermove handling, and frame-rate-dependent latency. (code/source verified; mobile checks pending where relevant)
- [x] Prevent ADS/Shoot pointer drags from rotating camera by default; bind gestures to pointer IDs even when buttons are moved. (code/source verified; mobile checks pending where relevant)
- [x] Plan optional, independent settings clearly labeled 'Look while aiming' and 'Look while firing'; confirm exact semantics before enabling. (code/source verified; mobile checks pending where relevant)
- [x] Preserve separate pointer-id ownership for move/look/ADS/fire in code.
- [ ] Verify multi-finger claw interaction on Android.
- [ ] Verify shoot/reload/swap/jump/slide actions trigger promptly and transition correctly.
- [x] Add lightweight procedural slide sound at successful slide activation (build verified, sound perception not device-tested).
- [ ] Validate on device, not just desktop.

## 3. Fullscreen and landscape
- [ ] Reproduce leaving fullscreen/rotating mid-run and verify requirement gate returns.
- [x] Keep gameplay paused and release held controls while requirements are unmet (source verified; re-entry phone test pending).
- [x] Implement no-auto-resume behavior and additional display-mode rechecks (source verified; phone test pending).
- [ ] Verify Android browser behaviors.

## 4. Lobby and progression navigation
- [x] Replace scroll-to-section nav with actual page/panel navigation. (code/source verified; mobile checks pending where relevant)
- [x] Mission home: Deploy, level, XP, currency, concise records and understandable language. (code/source verified; mobile checks pending where relevant)
- [x] Field Kit page: real visual pistol/shotgun/rifle selection cards, scalable to 10 weapons later. (code/source verified; mobile checks pending where relevant)
- [x] Wildcards page. (code/source verified; mobile checks pending where relevant)
- [x] Records detail page, with small main-lobby summary. (code/source verified; mobile checks pending where relevant)
- [x] Challenges page. (code/source verified; mobile checks pending where relevant)
- [x] Permanent upgrades page or clear progression subsection. (code/source verified; mobile checks pending where relevant)
- [x] Retain operator slot, currency display and island signal in the UI.
- [ ] Confirm signal and currency represent true application state rather than placeholders.
- [x] Retain progress storage keys, weapon-selection handler and Wildcard/upgrade handlers in code.
- [ ] Confirm saved progress and loadout flow in browser regression test.

## 4.1 Compact landscape layout, based on screenshot review (2026-10-11)
- [x] Reclaim height from oversized lobby navigation, header, and Deploy footer (committed, preview build READY).
- [x] Move currency/level beside signal in compact header; prevent navigation overlap (committed, preview build READY).
- [x] Use two-column Mission layout so map and statistics are visible together (committed, preview build READY).
- [x] Remove legacy 9:16 aspect ratio in lobby Wildcards; render six compact cards across and two rows for ten cards (committed, preview build READY).
- [x] Apply extra CSS-viewport-height rules so both rows fit more reliably on short landscape phones; preserve 40px Deploy/navigation targets (Vercel build READY; device check pending).
- [x] Display Records operator slots and stats in side-by-side groups; compact Challenges and other wrappers (committed, preview build READY).
- [x] Replace runtime settings control tagging with four real mutually exclusive page containers; place old background diagnostics under Diagnostics (committed, preview build READY).
- [x] Raise Settings layer above lobby and keep inactive categories hidden/inert (committed, preview build READY).
- [ ] Verify no clipped Mission content or obstructed Wildcard buttons at user's landscape viewport.
- [ ] Verify all Settings categories, master/SFX sliders, log export/clear, and HUD editor on device.
- [ ] Verify small-screen fallbacks and record any layout feedback before finalizing.

## 4.2 Mobile landscape browser audit — 2026-10-11
- [x] Inspect the actual feature branch, source, decisions, architecture and latest changelog before edits; build and launch production assets locally.
- [x] Capture and inspect all six lobby pages and four Settings pages at **854 × 393** and **915 × 412** with Chromium mobile/touch emulation.
- [x] Reset inherited legacy lobby grid columns/areas; reclaim full width and fit Mission, Field Kit and all ten Wildcards inside the stage.
- [x] Fix Settings grid compression, overlapping labels, collapsed identity input and touch scrolling; keep one Settings page active.
- [x] Keep both Wildcard rows visible with readable names; test starter-card flip, equip/remove and saved loadout across reload.
- [x] Separate default ADS/minimap, weapon/status, Wildcard/HP-ammo and temporary-message/action-control overlaps.
- [x] Respect saved Wildcard HUD position, size and opacity variables.
- [x] Give all pause actions consistent 44px targets; keep HUD editor header and Save/Reset footer accessible while its body scrolls.
- [x] Reflect already-active background performance capture accurately in Diagnostics.
- [x] Test native Chromium fullscreen entry, selected-weapon deployment, ADS/fire drag isolation, reload/swap, look-zone drag, simultaneous movement/look/ADS, pause/settings/restart/quit, and no-auto-resume after orientation/fullscreen recovery.
- [x] Repeat the full browser audit after fixes: **180 checks, 42 screenshots, zero failed checks/page errors**. Build, TypeScript lint and whitespace checks passed.
- [ ] Validate physical-phone ergonomics, keyboard/safe areas, Android/iOS fullscreen support, audio, shot-impact accuracy and sustained performance with the user.
- [ ] Finalize only with user approval. This pass is **browser verified**, not physical-device verified.

## 4.3 Mobile performance pass — 2026-10-11
- [x] Inspect Android capture: sustained ~20–23 FPS, slow frames even without chunk work/enemies; avoid treating chunk pumping as the sole bottleneck.
- [x] Split terrain/water construction into cooperative slices (3ms mobile target); retain old upgraded chunks until replacements finish, cancel/release partial builds on requeue/restart, and preserve edits made during construction.
- [x] Queue late environment-asset refresh instead of synchronously rebuilding the whole world during gameplay.
- [x] Instance repeated shared scenery per chunk while preserving individual resource raycasts, colliders, harvest shrinking/removal and save identity; compact matching opaque resource parts.
- [x] Cache deterministic map tile colors; avoid rewriting unchanged HUD text; remove unused background combat-target raycast.
- [x] Apply saved graphics quality at startup, resize and selection; keep mobile shadows off. Mobile render scales: Low 0.85, Medium 1.0, High 1.25, capped by device DPR.
- [x] Disable persistent drawing-buffer retention; verify immediate rendered PNG export still works.
- [x] Wire Records operator level to the same saved XP-derived level as the header; remove fixed LEVEL 1 subtitle.
- [x] Correct diagnostic core timings to cover every frame; add sample counts, map timings and draw-call average/min/max. New build tag: `mobile-perf-2`.
- [x] Run 27 deterministic regression checks for batching, exact resource rays, harvest transforms/removal, edit preservation, atomic replacement, cancellation and queue drainage.
- [x] Run 17 production-browser checks at **800×360, DPR 2, mobile/touch**: graphics selection/reload/orientation, real photo export, zero unchanged Wildcard text mutations, ~120m held-touch movement across chunks and drained queue, complete timing counts.
- [x] Repeat 854×393 / 915×412 lobby/settings/gameplay browser audit after fixes: **180 checks, 42 screenshots, zero failures/page errors**. Inspect page/settings/combat screenshots.
- [ ] Measure the new preview on the user's Android phone at the same graphics quality first; compare FPS/p95/slow frames and feel, then test Low/Medium separately.
- [ ] Follow up on remaining CPU/GPU/browser scheduling stalls. The cooperative budget is a target, not a guaranteed hard maximum; cloud probes still show occasional long calls.
- [ ] Finalize only with user approval. Browser verification is not proof of physical-phone performance.

## 5. Settings
- [x] Make settings navigation actually switch sections. (code/source verified; mobile checks pending where relevant)
- [x] Keep camera/aiming controls and HUD editor. (code/source verified; mobile checks pending where relevant)
- [x] Combine Graphics / Audio navigation; retain quality, terrain LOD, weather controls. (code/source verified; mobile checks pending where relevant)
- [x] Add saved master-volume and sound-effects sliders, linked to the existing Web Audio engine (Vercel build READY; mobile audio test pending).
- [ ] Add separate lobby/gameplay music tracks and controls when the user supplies files.
- [x] Keep identity and diagnostics. (code/source verified; mobile checks pending where relevant)
- [x] Hide character model picker and profession from planned UI after dependency audit. (code/source verified; mobile checks pending where relevant)
- [x] Defer outfits without deleting their code or data. (code/source verified; mobile checks pending where relevant)

## 6. Gameplay UI cleanup
- [x] First-person only; remove TPP switch from planned UI after dependency check. (code/source verified; mobile checks pending where relevant)
- [ ] Adjust combat HUD for uncluttered mobile layout.
- [ ] Adjust pause menu.
- [ ] Adjust death/results screen after review (current version acceptable meanwhile).
- [ ] Adjust minimap/world map.
- [x] Hide world survey, home workbench, inventory hotbar, exploration profile/status HUD after dependency check. (code/source verified; mobile checks pending where relevant)
- [ ] REVIEW only, do not remove yet: legacy action controls and photo mode.
- [x] Keep sprint/walk and combat controls. (code/source verified; mobile checks pending where relevant)

## 7. Quality and review
- [x] Build and type-check. (code/source verified; mobile checks pending where relevant)
- [ ] Check regression in world streaming, memory, frame times, hit detection and saves.
- [ ] Run touch and orientation checks on phone with user.
- [ ] Collect remaining review decisions and iterate.
- [ ] Mark final only with explicit user approval.

## Current progress log
- 2026-10-10: User choices collected; initial code audit and camera-ray/tracer discrepancy identified. No aim fix implemented yet.
- 2026-10-10: Checklist created. Status remains NOT FINALIZED.

- 2026-10-10: Implemented crosshair-aligned ADS firing rays and tracers, faster ADS and camera turn response, optional independent button drag-look, and procedural slide cue.
- 2026-10-10: Replaced lobby scrolling with six distinct panels; added weapon illustrations and progress summary. Grouped settings, enabled diagnostics capture, safely hid approved exploration controls, and hardened Android display-mode rechecks.
- 2026-10-10: Latest gameplay-code preview at commit `fa031e5` reported Vercel READY. TypeScript+Vite build passed; **on-device accuracy/input/UI/performance validation still pending**. Work remains NOT FINALIZED.
- 2026-10-10: Added saved master and SFX volume sliders; replaced fixed per-shot volume override with preferences. Awaiting final combined preview build and Android sound check.
- 2026-10-11: User screenshot review identified oversized navigation/footer, clipped Mission, 9:16 Wildcards, and settings all together. Applied 2-column Mission, compact shell, 6-across Wildcards, side-by-side records, and real settings pages. Inline local background diagnostics now injects only into Diagnostics. Vercel preview for `bc2eae87d8` reported READY. Android visual/touch regression check pending; project remains NOT FINALIZED.
- 2026-10-11: Applied further short-landscape card density/touch-target refinements. Vercel build for `cf6c7a1a5` reported READY; exact mobile screenshot comparison still open.

- 2026-10-11: Mobile landscape UI browser pass verified on the existing feature branch: inherited lobby grid tracks and Settings compression corrected; native-fullscreen Chromium mobile/touch regression passed 180 checks with 42 screenshots at both requested CSS viewport sizes. Physical-device review pending; NOT FINALIZED.

## Follow-up ideas retained — 2026-10-11
- [ ] Extend HUD customization to every HUD object, including minimap. Preserve saved Wildcard button position/size/opacity support.
- [ ] Automatically reload an empty magazine when reserve ammo exists; preserve manual reload, dry-fire/no-reserve feedback, weapon switching and pause.
- [ ] Later difficulty/world-design pass: relocate safe zones to more destinations with progressively longer travel.
- Field Medic already exists; user identified likely accidental unequip during card inspection.

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

## Soundtrack transition clarification — 2026-10-11
- User clarified that lobby/gameplay state switches must restart the selected song from the beginning. This supersedes the earlier playback-position preservation between those two states.
- `src/survival-audio.ts` now tracks the last non-silent soundtrack state and resets the incoming track only when switching lobby ↔ gameplay. Pause, in-run Settings, music mute/unmute and same-state background recovery continue the current track. Looping, exclusive playback, streaming, SFX and saved music preferences remain intact.
- Expanded `tools/mobile_music_audit.py`: seek both tracks to 35 seconds, verify pause/background keep gameplay position, verify quit resets Chaos and redeploy resets Island Outbreak; retain real decoding/loop/mute/gain/persistence checks at both mobile landscape sizes. Build/type-check passed; browser repeat in progress.
- Combat commit 85183ec Vercel preview READY and 20 remote mobile combat checks passed at both sizes, zero page errors. Tracer shader links/endpoint buffers remained 1/1 after warm-up and repeated firing, with zero buffer deletions. Phone FPS improvement remains unverified. NOT FINALIZED.

- Final local music repeat passed at 854×393 and 915×412 with mobile/touch Chromium: real decoding and loops, restart on lobby/gameplay transitions, uninterrupted pause/Settings, mute/master gain, background recovery and preference persistence; no page errors. Artifact: `/workspace/scratch/music-reset-local.log`.

### 2026-10-11 — Pilot foundation in progress
Dedicated `my-new-repo` Supabase project now has a 20-account admission cap, optional consent/reporting, account progress and private analytics. Concurrent cap and permission/deletion tests passed locally. Signup/menu and gameplay animation polish implemented and undergoing mobile checks. Production launch still needs custom SMTP/verified sender, auth redirects, real email tests and exact-preview verification; no production promotion yet. See PILOT_RELEASE.md.

### October 11 release verification update
Owner confirmed Resend SMTP saved in Supabase. Email/password confirmation and the original 20 admitted-player cap remain; no guest migration was applied remotely. Recovery form now removes the irrelevant required email field. Production build/type checks, 24 mocked mobile auth/consent checks, 27 performance checks, 313 combat checks and disposable PostgreSQL admission/privacy/analytics audit passed. Hosted security advisor has only expected private-table deny-all informational notices. Live inbox delivery, final Auth redirect configuration and exact deployed verification remain pending; production is not yet promoted.

### October 11 V2 production release
Owner verified receiving the real confirmation email and returning to https://island-outbreak.vercel.app, then explicitly authorized merging V2 into main. Merge 488787e had no conflicts and its tree matched feature commit 1ee0dc9. Vercel production deployment dpl_DYpayfPSjvMdutNgkAKwLZ7KNrwp reached READY and attached the verified game domain. Confirmed owner account received private analytics access. Recovery email request returned HTTP 200; owner password creation/admission remains user-assisted verification. The original 20 admitted-player cap remains.

### October 11 cloud persistence and telemetry follow-up
Owner verified real password recovery/login and played a run. Queried their consented database reports: two batches, 18 windows, 32.2 captured seconds, weighted 35.0 FPS, 8.3% frames over 50 ms, worst 213.2 ms, max sampled wave 7. This is a partial sample, not the whole run or evidence of temperature/thermal cause. Found and fixed continuous capture emitting every fourth frame after 120 seconds. Production captures now retain five-second aggregation windows. Fixed missing progression save invocation and lazy unawaited Supabase RPC; serialized merged cloud saves now retry with bounded backoff. HUD layout uses account-scoped local cache, restores from cloud and merges with progression without overwriting it. Replaced static 2,900 currency placeholder with real spendable XP. All weapon trails now start at the actual muzzle while crosshair aiming/pellet spread stay authoritative. Browser fixture verified fresh-context cloud restore, merged saves and no short windows after a simulated two-minute boundary; 50 actual firing-controller muzzle/aim/spread checks passed. Reports do not measure phone temperature.

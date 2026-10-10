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

## 5. Settings
- [x] Make settings navigation actually switch sections. (code/source verified; mobile checks pending where relevant)
- [x] Keep camera/aiming controls and HUD editor. (code/source verified; mobile checks pending where relevant)
- [x] Combine Graphics / Audio navigation; retain quality, terrain LOD, weather controls. (code/source verified; mobile checks pending where relevant)
- [x] Add saved master-volume and sound-effects sliders, linked to the existing Web Audio engine (build verification pending on latest commit).
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

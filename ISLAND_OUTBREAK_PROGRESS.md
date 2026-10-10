# Island Outbreak | Living implementation checklist

**Status: IN PROGRESS — NOT FINALIZED.**
**Branch:** `feature/zombie-survival-world-v2`. Do not merge into `main` without approval.
**Rules:** Tick `[x]` only after actual work and verification. Do not equate a successful build with on-device validation. Do not delete undecided features. Record implementation commits and findings in `AGENT_CHANGELOG.md`. Keep FPS and memory costs under control.

## 0. Decisions and audit
- [x] Collect user's explicit Keep / Adjust / Remove / Later / Review choices.
- [x] Inspect main lobby/settings markup and current navigation implementation.
- [x] Inspect firing code: camera-based raycasts, randomized spread and muzzle-origin visual tracers.
- [x] Establish symptom: approximately 40 px consistently LEFT (shoot-button side) even with single-bullet weapons, and possible misses on thin targets.
- [ ] Inspect crosshair CSS and coordinates, ADS weapon transforms, camera update order, touch input ownership, fullscreen events and relevant dependencies.
- [ ] Establish reproducible test scenarios and capture baseline evidence.

## 1. Accurate aiming — highest priority
- [ ] Measure visual crosshair center vs camera projection center at actual phone viewport.
- [ ] Test pistol and rifle with diagnostic zero-spread shots; distinguish impact ray from visible tracer.
- [ ] Find and correct root cause of consistent leftward impact offset (do NOT hardcode a blind 40px compensation).
- [ ] Verify aim/camera transforms and frame update order during ADS and fire.
- [ ] Ensure single-bullet ADS shots hit the point aimed at when unobstructed; preserve deliberate game-design spread only if later approved.
- [ ] Center shotgun spread on aim point.
- [ ] Verify thin zombie hitboxes (arms), environment occlusion and visible hit feedback.
- [ ] Test hip-fire and ADS at close, medium and long range; record results.

## 2. Responsive combat and touch
- [ ] Reduce ADS activation latency; review FOV and gun animation responsiveness.
- [ ] Audit camera smoothing, pointermove handling, and frame-rate-dependent latency.
- [ ] Prevent ADS/Shoot pointer drags from rotating camera by default; bind gestures to pointer IDs even when buttons are moved.
- [ ] Plan optional, independent settings clearly labeled 'Look while aiming' and 'Look while firing'; confirm exact semantics before enabling.
- [ ] Preserve multi-finger claw play (move + look + ADS + fire).
- [ ] Verify shoot/reload/swap/jump/slide actions trigger promptly and transition correctly.
- [ ] Add slide sound when appropriate asset is available, with optional lightweight placeholder only if approved.
- [ ] Validate on device, not just desktop.

## 3. Fullscreen and landscape
- [ ] Reproduce leaving fullscreen/rotating mid-run and verify requirement gate returns.
- [ ] Keep gameplay paused and release held controls while requirements are unmet.
- [ ] Restore correctly without automatically resuming active run.
- [ ] Verify Android browser behaviors.

## 4. Lobby and progression navigation
- [ ] Replace scroll-to-section nav with actual page/panel navigation.
- [ ] Mission home: Deploy, level, XP, currency, concise records and understandable language.
- [ ] Field Kit page: real visual pistol/shotgun/rifle selection cards, scalable to 10 weapons later.
- [ ] Wildcards page.
- [ ] Records detail page, with small main-lobby summary.
- [ ] Challenges page.
- [ ] Permanent upgrades page or clear progression subsection.
- [ ] Keep operator slot and island LIVE indicator; confirm meaning and status truthfulness.
- [ ] Preserve saved progress and weapon/equipment behavior.

## 5. Settings
- [ ] Make settings navigation actually switch sections.
- [ ] Keep camera/aiming controls and HUD editor.
- [ ] Combine Graphics / Audio navigation; retain quality, terrain LOD, weather controls.
- [ ] Add audio settings and separate lobby/gameplay tracks when user supplies files.
- [ ] Keep identity and diagnostics.
- [ ] Hide character model picker and profession from planned UI after dependency audit.
- [ ] Defer outfits without deleting their code or data.

## 6. Gameplay UI cleanup
- [ ] First-person only; remove TPP switch from planned UI after dependency check.
- [ ] Adjust combat HUD for uncluttered mobile layout.
- [ ] Adjust pause menu.
- [ ] Adjust death/results screen after review (current version acceptable meanwhile).
- [ ] Adjust minimap/world map.
- [ ] Hide world survey, home workbench, inventory hotbar, exploration profile/status HUD after dependency check.
- [ ] REVIEW only, do not remove yet: legacy action controls and photo mode.
- [ ] Keep sprint/walk and combat controls.

## 7. Quality and review
- [ ] Build and type-check.
- [ ] Check regression in world streaming, memory, frame times, hit detection and saves.
- [ ] Run touch and orientation checks on phone with user.
- [ ] Collect remaining review decisions and iterate.
- [ ] Mark final only with explicit user approval.

## Current progress log
- 2026-10-10: User choices collected; initial code audit and camera-ray/tracer discrepancy identified. No aim fix implemented yet.
- 2026-10-10: Checklist created. Status remains NOT FINALIZED.

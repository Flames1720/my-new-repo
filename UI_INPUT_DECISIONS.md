# Island Outbreak UI and Input Decisions
Status: Approved planning decisions, NOT an implementation or deletion authorization.
Date: 2026-10-10
Branch: feature/zombie-survival-world-v2
Do not merge into main. Record implementation changes in AGENT_CHANGELOG.md.

## Product direction
Mobile-first, first-person-only zombie survival. Prioritize responsive touch input, understandable labels, real pages, and preserving working functionality. Review and hide legacy UI safely before removing dependent systems.

## Lobby (all KEEP)
Mission: main landing page with Deploy, simple user-friendly terminology, level, XP, currency and select headline stats. Field Kit: dedicated page, visual image cards for existing pistol, shotgun and rifle; scalable list for 10 future weapons, no fake weapons. Wildcards: own page. Records: detailed page; show only summary metrics in lobby. Challenges: own page. Permanent upgrades: keep, organize under Progression page. Open operator slot: keep. Currency: keep. Island signal LIVE: keep, verify truthfulness/status semantics. Deploy: keep prominently.

## Settings
KEEP: camera and aiming sensitivity, combat HUD editor, graphics quality, terrain LOD, dynamic weather, player identity, audio, background diagnostics. Group Graphics / Audio together in navigation; audio assets for lobby and gameplay will be supplied later. REMOVE from planned UI: character model picker and professions (check dependencies before any code removal). LATER: outfits.

## Other UI
KEEP: fullscreen/landscape requirement, touch camera, combat controls, sprint/walk. ADJUST: pause menu, death/results (currently acceptable), combat HUD, minimap/world map. REVIEW, no changes without follow-up: legacy action controls, photo mode. Camera mode: FIRST PERSON ONLY; remove TPP option from planned UI, inspect dependencies. REMOVE from planned UI: world survey, home workbench, inventory hotbar, exploration profile/status HUD; do not delete backing code without dependency analysis.

## High-priority responsiveness and touch design
- Touch camera rotation should respond immediately, without intentional smoothing/input lag. Measure touch-to-camera and touch-to-action latency separately from FPS/render delays on Android.
- ADS activation should be fast. Review animation transitions and aim state timing.
- For claw layouts, tapping/dragging ADS or Shoot buttons should NOT rotate camera by default, even if dragged into right look zone. Input ownership must be bound to pointer ID from touch start; prevent gesture bleed between action buttons and look zone.
- Consider clearly labeled independent settings: 'Look while aiming' and 'Look while firing' (default off for action-button drag; normal look-zone remains usable). Confirm precise behavior with user before implementation.
- Preserve simultaneous independent fingers for movement, look, ADS, and fire.
- Slide action remains. Add slide sound later, and ensure slide/action transitions respond immediately.
- On exiting fullscreen or landscape, re-display the requirement gate and pause active runs. After restoration, do not auto-resume.
- Verify touch action response with device logs and live testing; build success alone is insufficient.

## Delivery order
1. Audit and measure input/camera/ADS latency and orientation gate behavior.
2. Implement safe input ownership and responsive action transitions.
3. Split lobby into real pages, preserve all kept features, simplify labels, add weapon-card imagery.
4. Categorize settings, including Graphics / Audio; hide explicitly removed legacy controls after dependency audit.
5. Refine HUD, map, pause and results with user review.
6. Integrate supplied lobby/gameplay audio and slide sound.
Keep undecided items intact. Do not introduce unapproved removals or fake gameplay functionality.

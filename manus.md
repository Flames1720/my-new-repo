# Island Outbreak — continuation brief for the next Manus

> Read this file before changing the game. It preserves the user's requested direction and current branch context so another agent can continue without asking the user to repeat the design.

## 1. Immediate task and boundaries

The user wants the first game to feel deliberately designed across its full run: lobby, setup, combat, waves, wildcards, settings/pause, defeat, progression, animation, visual effects, sound, and local persistence. This is not a request for a generic UI-card pass or for a separate “skills” system.

**The current deliverable is game design/implementation on the existing feature branch. Do not publish a permanent website, merge to `main`, or deploy to production.** The user explicitly asked not to make the site permanent. A previous preview link was not opened by the user; they corrected this directly. Do not claim their earlier screenshot came from that preview or infer its source from it.

Keep work on the feature branch below. Do not overwrite `main`. Local commits pushed to this feature branch are useful for continuity, but publishing or merging is a separate decision and is not authorized by this handoff.

## 2. Repository and current state

- Repository: `Flames1720/my-new-repo`
- Local checkout: `/home/ubuntu/my-new-repo`
- Branch: `feature/zombie-survival-world-v2`
- Base: `main`
- Last recorded commit: `d8cd0fc` — `Harden mobile fullscreen entry gate`
- Pull request: [PR #8 — Consolidate Island Outbreak release candidate](https://github.com/Flames1720/my-new-repo/pull/8). At last inspection it was open, based on `main`, with build checks and its Vercel preview check successful for the then-current head. That does **not** authorize merging or production publication.
- The working tree was clean when this handoff was started; no feature implementation for the requests below has yet been made.
- `npm run build` and `git diff --check` passed after the last committed changes. Re-run them after edits.
- The repo is a single-player Three.js survival prototype with procedural terrain, forest/island world, firearms, infected, safe zones, touch HUD, lobby and local progression. Read `README.md`, `PROJECT_PLAN.md`, and `docs/ZOMBIE_SURVIVAL_INTEGRATION.md` for more project context.

## 3. Game flow the user described

### Start and lobby

1. The game requires landscape fullscreen before play. In portrait, show a designed rotating-phone animation and hide the entire underlying game/HUD. In landscape but not fullscreen, show an explicit fullscreen-entry button. If fullscreen is exited during play, pause the run and reveal a way back to fullscreen. Hide the fullscreen button whenever fullscreen is active.
2. The deployment lobby is the pre-game home. It needs a visible Settings entry before a run, weapon selection, persistent progress, and a Wildcards section where the player can inspect/unlock/equip cards. Do not force the player to start a run to tune sensitivity or HUD.
3. Preserve the existing outbreak art direction and animated infected lobby backdrop, but favor clear game hierarchy and purposeful motion over rigid cards with explanatory paragraphs.

### In-game pause/settings menu

- During a survival run, the player needs one unobtrusive menu/settings control. Tapping it immediately releases held controls and pauses simulation/audio-sensitive state; no zombies, timers or damage should continue while the menu is open.
- Put run-management options inside this pause surface: **Resume**, **Settings**, and **Quit**. The user clarified that “Return to Lobby” is effectively quitting; label the action **Quit** if that is clearer, and have it return to the lobby. Never attempt to close the browser tab/webview.
- Settings should be accessible from both lobby and the in-game pause menu. In-game settings changes must not silently resume the run; return to the paused menu, where the player explicitly resumes or quits.
- Keep the gameplay HUD controls needed to play (movement/look, shoot, aim, reload, weapon switch, ammo/health, map as appropriate). The user's “only the settings button should show in-game” refers to the menu/utility entry point: avoid exposing a row of separate pause/settings/quit controls during play. Keep quit/restart/settings actions inside the menu.
- The fullscreen button is an exception: it appears anywhere the game is not in fullscreen, including lobby and active run; fullscreen loss auto-pauses, then the button lets the user re-enter. Hide it when fullscreen is active.

### Persistent local settings and customizable HUD

- Store settings on-device in browser `localStorage`, so they persist on later visits in that same browser. Do not claim cross-device/account sync; local storage is origin- and browser-specific.
- Persist sensitivity (horizontal/vertical/ADS, inversion, acceleration), audio volumes/mute/ambience if exposed, current wildcard selection/unlocks, selected lobby weapon as appropriate, progression, best scores, and HUD customization.
- Existing HUD drag/size/opacity work already uses `localStorage` key `zombie-survival-hud-v1`; HUD-editor panel position uses `zombie-survival-hud-editor-position-v1`. Extend this system for wildcard action buttons so users can place/resize/fade them. Do not break existing layouts when adding new controls; supply defaults for new entries and retain version-safe parsing.
- The project already has a settings object and settings modal; inspect its storage implementation before adding duplicate persistence.

## 4. Wildcards (not a new skills system)

The user explicitly considered “skills” and decided: **do not add a separate skills system; use Wildcards.** The game currently has a `PULSE`/shockwave ability called a skill in `src/zombie-survival.ts` and a `#skillBtn` in the touch HUD. Do not add another independent skill layer. Decide how to remove or repurpose that legacy control as a wildcard only, keeping the user informed in the handoff/change summary.

User's desired wildcard rules:

- Show a collection/list of **10 wildcard choices** in the lobby. Start with **two unlocked** and the rest visibly locked.
- The user first described two selectable/equippable slots at the start, then a third slot unlocked through progression. Maximum equipped in any run: **three**.
- The player can choose/change up to the available slot count in the lobby, including switching between already-owned wildcards on later runs. Do not allow duplicates unless intentionally designed.
- A manually activated equipped wildcard adds one game HUD button: one equipped = one button, two = two buttons, three = three buttons. Buttons need visible ready/cooldown states and an unmistakable activation effect. If any wildcard is passive, it should not consume a visible activation button; confirm this rule in the UI, but the user's latest preference strongly favors one button per selected active wildcard.
- The user has not approved exact wildcard names, effects, cooldowns, balance, or which two are unlocked. Keep those values data-driven and modest. An earlier assistant floated names such as Quick Hands, Scavenger, Steady Grip, Field Medic, Quick Draw, Endurance, Reinforced Vest, Sharpshooter, Boss Spoils and Threat Reader, but that list is **suggestion only**, not a user-approved specification. Some are passive and would need redesign if every chosen card is manually activated.
- Design two beginner-friendly active wildcards and eight locked candidates without overpowered effects. Possible direction: a short, bounded reload-speed burst and a small capped recovery or nearby supply effect. Keep cooldowns/values in a registry so they can be retuned. Do not label a wildcard activation “skill”.
- User suggested that a colored ripple sweep the screen when a wildcard activates; use the wildcard’s own accent color, brief callout, button cooldown/charge treatment and a fitting synthesized sound. Respect reduced-motion settings and do not cover aim/reticle for long.

## 5. Waves, combat and audiovisual polish

The user wants the game’s first run to be designed end-to-end, with animations and sound effects for how each system works—not just static buttons.

### Wave and timer UX

- Display an obvious countdown before a wave starts, including the current preparation timer. The first run already has a 12-second preparation period.
- Wave-start signal: an authored event title enters small, grows to readable scale, holds briefly, then fades; play a distinctive short signal/chime. Keep the live countdown visible before contact, not buried in toast text.
- Add wave-clear/intermission feedback, and a boss-introduction cue for boss waves. Make overlap/late-clear behavior legible.
- The user floated that waves might overlap if an earlier wave is not finished. This is **an option to design**, not a final approved balance decision. If implementing overlap, schedule the next wave by a controlled timer even when old infected remain, cap living enemies and queued spawns, avoid runaway pile-ups, and define what “wave cleared” means for XP/records. A safer first implementation can keep first waves non-overlapping, with bounded later pressure, and explain it in game.

### Shooting, bullets and zombie response

- The user says the traveling bullets are too tiny and wants them slightly larger and more impactful. In `ZombieSurvivalSystem.spawnTracer` (`src/zombie-survival.ts`) the current visual is a thin `THREE.Line` at opacity 0.7, removed after about 0.055 seconds. Damage is currently hitscan; tracer is visual only. Increase visual readability with a compact bright core plus a soft colored glow/trail or low-poly tracer mesh, tune size/lifetime by weapon, and retain good mobile performance. Avoid relying only on `LineBasicMaterial.linewidth` because WebGL implementations often ignore it. Do not silently turn hitscan into slower physical projectiles or change weapon balance without a conscious decision.
- Gun families should have distinct feel: pistol snap, shotgun bass/body and pump, rifle fast repeated report; add sensible first-person recoil/recovery, muzzle flash, hit-confirm, reload/pump and perhaps shell ejection/impact. Existing weapon rig already has recoil, muzzle flash/light, pump/slide and reload motion. Layer visual feedback rather than replacing existing systems.
- Make hits on infected readable: contact sparks/blood cue, color/material flash, hit-stagger/knockback, boss flinch, and clear death/fall. Existing infected already have procedural locomotion, hit emissive flashes, a tipped death pose, downward drift/shrink and fade/removal after six seconds; boss attacks currently damage immediately and snap arms to a pose. Improve these with authored timings instead of adding redundant systems.
- Boss slam direction: telegraph/wind-up, warning ring/ground cue, impact, visible shockwave ring and controlled screen shake. The warning should give the player a fair dodge window.

### Sound effects

- Yes, sound effects can be created. There is already a self-contained procedural Web Audio engine in `src/survival-audio.ts`, with synthesized pistol/shotgun/rifle shots, dry fire, reload clicks, hitmarker, zombie growl/attack/death, hurt cue, pickup, explosion, low-health heartbeat, and ambient drone. This proves the game already creates SFX without downloading files. Improve and reuse that engine before introducing external audio assets.
- Add distinct wave-start/wave-clear/boss-warning cues, wildcard-ready/activation/cooldown cues, progression/level-up/record cues and a game-over cue. Layer oscillator/noise envelopes carefully, keep effects brief and non-fatiguing, use current volume controls, and unlock/resume `AudioContext` only after a user gesture as current code expects. Add persisted master/SFX/ambience levels if useful. Do not add spoken narration unless the user asks for it.
- If actual exportable audio files are desired later, generated short SFX can be created as separate assets; this implementation can use procedural synthesis first, which loads instantly and matches the existing codebase.

## 6. Defeat screen, XP, levels and records

On defeat, do **not** jump straight to the lobby. Show a dedicated aftermath/result surface, e.g. **“ZOMBIE ATE YOUR BRAIN”**, styled as dramatic game feedback rather than a generic error card. It should show at least:

- time survived;
- wave reached / waves survived;
- infected kills;
- XP earned this run and total XP;
- XP progress to next level, animated from starting XP to final XP;
- a new-level transition/banner (example visual treatment: “LEVEL 24”), whenever the XP bar crosses a level threshold;
- a new-best/high-score callout if the run beats the stored high wave **or** stored best survival time;
- **Quit** / return-to-lobby action, revealed or enabled after the counters/progress animation has settled. Avoid trapping the player if reduced motion is enabled; then show final values immediately.

The same record/progression reporting should exist after wave-100 victory, with a different victory presentation.

Current state/details in `src/main.ts`:

- `SurvivalMetaState` is `{ xp, bestWave, totalRuns, totalKills, upgrades, waveClearCounts }`, saved under `island-outbreak-meta-v1`; legacy best wave is also read/written under `island-outbreak-best-wave`.
- Current level display is derived from `1 + floor(xp / 150)`; there is no animated per-level progress bar and no saved best survival time yet.
- XP is awarded incrementally for kills and wave changes in the survival status callback, with diminishing repeated-wave rewards. End-of-run code adds victory/overrun XP and a best-wave bonus.
- `recordSurvivalRun` currently only compares `bestWave`; it has no time-survived record.
- Important existing defect to correct: the `onDeath` handler currently removes the death overlay's `show` class and opens the lobby, so the requested detailed results are not actually presented. Wire a single end-of-run path so XP is awarded once, stats are captured once, the results UI appears, and the lobby opens only after the player chooses Quit.
- Define a gradual XP curve for next-level requirements (or preserve 150 if deliberately preferred), show gained/current XP and levels crossed, and keep XP persistence robust. Higher-wave zombies/bosses should pay more XP; bosses are a substantial reward; repeating the same wave should pay less than its first clear. As player level rises, lower-wave threats can become less punishing, but use bounded/capped scaling so early waves do not become irrelevant or bugged.

## 7. Existing implementation map and hooks

- `index.html`: DOM for the landscape/fullscreen gate, HUD/top-right buttons, survival lobby, generic death/pause overlays, current settings modal and touch controls.
- `src/main.ts`: game wiring, current settings open/close behavior, `survivalMeta`, XP and upgrade logic, HUD editing/localStorage, survival callbacks, run-start/pause/death event handlers and rendering loop.
- `src/zombie-survival.ts`: weapons, hitscan fire/tracers, damage/death, zombies, preparation timer, current queue-driven wave logic, boss attacks, safe zones, skill cooldown and status event stream.
- `src/survival-audio.ts`: all procedural SFX; extend here.
- `src/survival-weapons.ts`: weapon tuning and procedural 3D weapon rigs.
- `src/ui-modern.css`: lobby, fullscreen gate, HUD, pause/death surface and animation styling.
- `src/settings.ts` (or the existing settings module): inspect before writing another settings storage path; the main UI uses `settings.current` for sensitivity, inversion, acceleration, weather, graphics, character settings and related preferences.
- Bind buttons with the existing `bindAction`/`bindHoldAction` patterns; touch controls activate on pointer-down. Preserve browser-safe audio activation and cleanup.

## 8. Design bar and implementation order

Aim for a restrained, polished survival-game visual language: sharp typography, operational field labels, high-contrast status, charcoal/forest base, green sanctuary cues, and amber/red only for warnings/damage. Motion must communicate state and timing; use short easing, no motion overload, and `prefers-reduced-motion` alternatives. The player should understand whether a wave is imminent, a wildcard is ready, a hit connected, a new level was gained, and whether a record was beaten without reading a paragraph.

Suggested order for the next agent:

1. Read the code-path sections named above and confirm current branch/status; keep the design local to `feature/zombie-survival-world-v2`.
2. Unify pause/settings/quit flow and expose settings from the lobby. Ensure releasing the menu pauses simulation and controls.
3. Add the Wildcards data model/collection/loadout UI, two provisional unlocked cards, lock states, max-slot rule, and one HUD activation button per equipped active wildcard. Keep identities/effects data-driven and mark balance values as provisional.
4. Add a timed wave announcement and controlled inter-wave cadence/overlap policy; add audio and the bigger weapon-colored tracer/hit/boss telegraph feedback.
5. Build the death/victory result experience, including duration/kill/wave/XP data, smoothly animated XP-to-level progress, level-up and new-best beats, then Quit to lobby.
6. Extend localStorage safely for all settings/progression/loadout/HUD values; include defaults/migration and catch storage errors.
7. Build/typecheck, `git diff --check`, smoke-test lobby → pause/settings → run → wildcard → defeat → result → quit, and test fullscreen loss/re-entry. Update README/integration notes and this handoff with decisions actually implemented.

## 9. Open decisions to surface, not silently misrepresent

- Exact identities/effects/cooldowns for the 10 wildcards and which two start unlocked. Prior names are suggestions only.
- Exact progression XP curve, per-zombie and boss rewards, and repeat-wave reduction values. User specifically said they are unsure of these; expose/retune data cleanly and show understandable XP feedback.
- Exact wave cadence and overlap rule. User is open to waves joining when earlier infected survive; contain it with spawn caps and a readable timer.
- Whether to retain the old shockwave as one wildcard or remove it. No separate skill system.
- Best-score tie rule if both wave and time records matter: show a best-time record and best-wave record separately; announce a new record when either improves.

## 10. Hosting reminder

No permanent website has been created. The Vercel connector was found disabled in the previous session and its activation attempt was interrupted; the user then explicitly said not to make the site permanent. Do not resume that attempt, merge PR #8, activate a hosting connector, or deploy unless the user explicitly changes this instruction.

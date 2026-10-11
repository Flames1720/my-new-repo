# Cunning Hunter preview

Branch: `preview/cunning-hunter`. This is an isolated 1v1 experiment, not the production wave mode.

One ordinary walker-sized opponent, 90 HP, 15 damage and no boss scaling, regeneration or invulnerability. It uses runner-level movement and brief lateral dodges. It can still die to normal bullets and headshots. Defeating it ends the duel; restart creates a fresh opponent. No sanctuary, XP, achievement awards or progression writes in this preview.

Its local tactical controller:
- Predicts visible player movement and learns a short-lived preferred strafe direction.
- Flanks, dodges sustained aiming/visible fire, and presses audible reloads at close range.
- Prefers actual occlusion when threatened or wounded, using at most three cover rays per decision at roughly 8 Hz.
- Starts by investigating the deployment sound, then searches the last seen position for five seconds; footsteps within 18 m provide an approximate three-metre search area. It does not track silent movement through walls.
- Winds up a melee attack for 220 ms. Leaving range or breaking sight avoids the strike. It retreats laterally after committing an attack.
- Respects dry ground, collision and the existing pulse field. No navigation teleport or damage cancellation.

The challenge comes from these tactics, not extra HP. Difficulty still needs human playtesting; “nearly unbeatable” is a tuning goal, not a measured claim. This is deterministic local game AI, not an LLM or a paid external AI service.

Validation includes the tactical controller, unseen-player memory, bounded cover queries, one-enemy spawn, normal body/HP/damage, avoidable attacks, ordinary damage, victory/reset, weapon/card regressions and mobile browser combat/duel audits. Preview telemetry retains its unique deployment build identifier so it can be distinguished from production runs.

# my-new-repo: Island Outbreak pilot

Status: implementation and verification in progress. This is not a production launch announcement.

The dedicated Supabase project is `my-new-repo` (`gqbndnaoteilxsmkkads`), in Flames1720’s Org. The game remains Island Outbreak. Only `feature/zombie-survival-world-v2` is used for application changes.

## Accounts and admission

Email/password signup requires email confirmation. A database transaction locks the configuration row and admits at most 20 confirmed accounts. Accounts beyond the cap can exist in Supabase Auth but cannot acquire a player slot, save progress or submit reports. Existing admitted players can return when full. This is a cap on admitted accounts, not simultaneous connections, and does not provide multiplayer or prevent someone modifying a downloaded client. Gameplay progress is scoped by account and synchronized to the database; it is self-reported, not an anti-cheat leaderboard.

The public API exposes scoped invoker RPCs. Private tables have RLS enabled, no direct client grants and intentionally no permissive policies. Private definer functions validate `auth.uid()` and admission/consent/admin membership. Admin membership is assigned only by trusted database administration; signup metadata cannot grant it.

## Optional performance reports

Players choose Allow Game Data or Play Without Sharing. Game Data in Settings lets them change the choice or stop sharing and delete their reports. Reporting starts only after successful server consent. Withdrawal stops local collection immediately, clears queued batches, rotates the server consent epoch and deletes stored reports. If deletion cannot reach the server, the UI says deletion is pending, stores that intent locally and retries before allowing reporting on next login. A consent epoch prevents stale in-flight uploads after withdrawal.

Five-second summaries are collected during active gameplay and uploaded in batches, with bounded memory and exponential retry. Retries keep their original session/sequence identifiers so a lost response does not duplicate analytics. No per-frame network or storage writes. Report fields are restricted to numeric timing/counter data and broad device categories; emails, passwords, text input, raw exception messages, recordings and full user agents are excluded. Runtime errors are counted without their contents.

Measurements include callback/gap/render/simulation, world streaming, map updates, aim queries, survival updates, firing, enemy AI and combat effects. Button actions are counted without their text. Histogram bins preserve a meaningful aggregate p95 bound instead of averaging per-window percentiles. Backend analytics returns weighted FPS/slow-frame rate, weighted phase costs and counts, distributions and action associations. Scheduling gaps are not GPU measurements; associations do not prove causes. Copy-log controls are absent from pilot Settings; offline developer builds retain them.

Reports expire after 90 days. Hosted pg_cron runs `pilot-report-retention` daily at 03:15 UTC; ingestion also removes expired reports. With daily cleanup, deletion can occur up to one day after the 90-day boundary. Explain this in the consent copy if strict retention is required.

## Configuration and launch prerequisites

`.env.production` contains only the public project URL/publishable key and enables the pilot gate. This key is intentionally public and protected by RPC authorization. Never add a Supabase service-role/secret key to Vite variables. `.env.local` is ignored. For offline developer audits use `VITE_PILOT_ENABLED=false npm run build`; release builds enable the gate.

Before inviting 20 people:

1. The owner confirmed saving Resend SMTP details in Supabase on October 11, 2026. Live confirmation and recovery delivery still require verification. Email signup and the original 20 admitted-player limit remain enabled; the experimental guest migration was never applied to the hosted project and has been removed.
2. Set Supabase Auth Site URL and redirect allowlist to the final HTTPS pilot URL, including recovery/confirmation destinations. Configure signup abuse protection/rate limits appropriate for a small pilot. Test real confirmation and recovery emails end to end.
3. Assign the owner’s confirmed account to `island_private.admins` through trusted SQL after they register. Do not make the first registrant an admin automatically.
4. Verify the exact feature preview on mobile, real Auth/RPC traffic, consent revoke/delete, and email recovery. Auth transport fixtures are not evidence that live email delivery works.
5. Publish/promote only the verified deployment. The existing production/main is not changed by these feature commits. Existing previews remain unchanged.

Vercel environment mutation returned `429 github_response_error`; public production build configuration is included in the branch so missing remote variables cannot silently disable admission. No production deployment has been promoted.

## Local checks

`tools/pilot_database_audit.py` uses a disposable PostgreSQL 17 database and auth stubs. It tests 21 concurrent admissions, full-cap return login, confirmed-email requirement, direct-table isolation, admin access, consent/deletion, stale-epoch rejection, idempotency and weighted analytics. Do not point it at a real project: it truncates its test tables.

`tools/mobile_pilot_audit.py` explicitly mocks Auth/RPC transport and checks mobile signup/admission/consent UI, no WebGL world before admission, removed copy controls and report batching/withdrawal. This is separate from the database verification.

# Island Outbreak request budget

These are application request estimates, not billable row reads, SQL buffer reads or measured query execution costs. Supabase Postgres usage is not a Firestore-style per-document-read model. Network transfer, database resources, Auth limits and plan quotas still apply.

## Availability

One `pilot_availability` RPC on sign-in page entry; another every 30 seconds while that page is visible. Returning from a hidden tab adds one check. Polling stops after admission. No client cache is shared across visitors.

For uninterrupted visible time T seconds before admission: approximately `1 + floor(T / 30)` checks (boundary timing can differ). Each RPC reads one configuration row and counts the admitted-player table, capped at 20 records. It exposes only capacity and remaining count. No player identifiers are returned.

## Per-case application requests

| Case | Database RPC requests | Additional Auth requests |
| --- | --- | --- |
| New visitor, leaves within 30 seconds | 1 availability | Normally 0 if no saved session |
| Visitor remains on sign-in for 5 minutes | About 11 availability | 0 if no auth actions |
| Create account and leave | Availability checks only | 1 signup; confirmation-link exchange happens later |
| Confirmed existing player signs in promptly | About 1 availability + 1 admission | 1 password sign-in; session restoration/refresh can add requests |
| New confirmed player enters promptly | About 1 availability + 1 admission + 1 consent choice | Sign-in/link exchange, depending on path |
| 10-minute game, sharing disabled | No availability polling; S progress saves | Session refresh if due |
| 10-minute game, sharing enabled | About 20–40 report uploads + S progress saves | Session refresh if due |
| Owner opens dashboard already signed in | About 1 availability + 1 admission + 1 analytics | Session refresh if due |
| Each dashboard refresh/filter change | 1 analytics | Normally none |
| Download summary | 0; exports current snapshot locally | 0 |

S is the number of persisted progression/HUD updates after the 1.5-second debounce; it depends on run results, achievements, purchases and HUD changes. Actions do not each trigger a save. Reports collect roughly five-second windows, flush at six samples or the 30-second timer, and flush on tab hiding. The timer and six-sample trigger can split batches, so 2–4 uploads/minute is a planning range, not a hard bound. Partial sessions, retries and visibility changes add requests. Consent withdrawal performs one RPC and deletes that player's reports.

## Pilot scale examples

- 100 visitors staying one minute on sign-in: about 300 availability RPCs (including boundary checks).
- 20 simultaneous players for one hour with sharing enabled: about 2,400–4,800 report uploads, plus progression saves and initial admission/consent/Auth requests.
- Same gameplay with sharing disabled: zero report uploads; progression saves remain.
- 20 tabs waiting five minutes at sign-in: about 220 availability RPCs.

## SQL work behind requests

An availability RPC counts at most 20 admitted rows and reads one config row. Report ingestion reads/locks the player row, checks duplicates, counts recent uploads for rate limiting, checks/deletes expired reports and inserts a batch. Progress saves update the player's saved JSON; admission checks confirmed Auth identity, locks capacity and reads/adds the player. Analytics scans selected reports in several separate aggregations. Consequently one RPC is not one row read, and exact physical reads cannot be inferred from these request counts; query plans/runtime statistics are needed.

No per-frame network uploads, no gameplay availability polling, and no automatic dashboard polling are introduced.

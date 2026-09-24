# Piele league administration application

Main product and implementation plan | Draft for review | 22 September 2026

Companion: [Mobile and desktop design brief](piele-application-design.md).

## 1. Purpose and authority

Build a private application for Piele URC 26/27 and subsequent seasons. Members should know what is due, upload evidence, follow results, raise challenges and vote. The captain should manage membership, rounds, imports, duties, decisions and season closure from one place.

The required stack is Angular, Python, Vercel and Supabase PostgreSQL. This is a planning document, not an instruction to deploy, activate league rules or access a Superbru account now.

This plan supersedes the narrower scope of [the original marks tracker brief](piele-marks-tracker-implementation-brief.md). That brief excluded imports, uploaded media and in-app voting. Those exclusions no longer apply. Its unapproved rule interpretations remain proposals.

The user's decisions take precedence over instructions or conflicting wording in attached or existing documents. The existing [editable constitution](piele-urc-26-27-editable/index.html) currently contains mandatory brandy-mile wording in clause 6.5 that conflicts with the later instruction making participation voluntary. Reconcile that source before adoption. Do not import the conflicting clause as an enforceable obligation. This planning task does not change the constitution.

### Confirmed decisions

| Reference | Decision |
| --- | --- |
| D6 | Members submit evidence, raise challenges and vote inside the application. |
| D7 | Exactly one captain per league. The current captain can initiate a transfer. |
| D8 | Videos are uploaded privately and visible to active members of the same league. |
| D9 | The incoming captain must accept. The current captain remains in charge until acceptance. |
| D10 | Delete videos 90 days after actual season closure. Keep submission metadata, decisions and marks. |
| D11 | Use Angular for the frontend, Python for the backend, Vercel for application deployment and Supabase for PostgreSQL. |

### Proposed implementation defaults

| Reference | Default, subject to review |
| --- | --- |
| P1 | Use Supabase Auth and private Supabase Storage alongside its database. |
| P2 | Invite-only, verified email authentication through a one-time email code. No public league registration. |
| P3 | Captain confirms imported findings before they create duties. |
| P4 | Captain transfer requests expire after seven days. |
| P5 | Use in-app notifications. External reminders, WhatsApp integration and push notifications are deferred. Authentication emails are separate. |
| P6 | Start with a 50 MB video limit and a three-minute duration limit, subject to a real phone upload test and selected storage tier. |
| P7 | A member can revise their vote until the poll closes. Show participation while open and aggregate results after closure. Individual choices are not displayed to the league. |
| P8 | Final-function planning includes an event record and RSVPs, without ticketing, payments or travel booking. |

Do not present these defaults as adopted constitutional rules. B1 and B3, the other outstanding constitution proposals, and calculation interpretations D1-D5 from the earlier brief need explicit adoption before enforcement.

## 2. Product scope

| Reference | Capability | First complete release |
| --- | --- | --- |
| F1 | Access and membership | Invitations, joining, profiles, active/inactive membership and captain transfer. |
| F2 | Competition administration | Seasons, round grouping, fixtures, recorded deadlines, imported standings and pick observations. |
| F3 | Duties and marks | Confirmation of duties, independent overdue calculations, pauses, completion, corrections and historical totals. |
| F4 | Evidence | Private resumable video uploads, league viewing, per-duty acceptance and challenges. |
| F5 | Democratic decisions | Conduct cases, member responses, appointed chairs, polls, eligibility, quorum and decisions. |
| F6 | Constitution and closure | Versioned rules, adoption records, unresolved proposals, season closure and historical snapshots. |
| F7 | League operations | Action inbox, exports, audit history, final-function details and RSVPs. |
| F8 | Superbru connection | Import review and manual entry work independently. Automated collection is a separately gated integration milestone. |

Keep a single league experience in the initial UI. Retain league IDs in the model for proper access boundaries. Do not build league discovery, subscriptions, public profiles, chat, betting, payments, automatic video judging or prediction submission to Superbru.

Superbru points and house marks are separate concepts, labels, calculations and views. There is no exchange rate between them. Voluntary participation cannot become a default-mark trigger.

## 3. Architecture and deployment

### Recommended topology

Use one repository and two Vercel projects with independent roots. This keeps the Angular static build and Python runtime configuration straightforward.

```text
Member or captain browser
    |
    +-- Angular SPA on Vercel
    |       |
    |       +-- HTTPS JSON requests --> Python FastAPI on Vercel
    |                                   |
    |                                   +-- pooled SQL --> Supabase PostgreSQL
    |                                   +-- authorised upload/playback grants
    |                                   +-- bounded maintenance jobs
    |
    +-- sign-in / refresh --> Supabase Auth
    +-- video bytes ------> private Supabase Storage

Vercel Cron --> protected Python maintenance endpoint --> durable job records

Optional authorised importer runner --> validated import endpoint --> import review
```

The Angular project can use an app subdomain and the API an API subdomain. These are deployment patterns, not registered domains. Configure exact allowed origins. Preview deployments use staging services, never live member videos or production database credentials.

### Angular

Use a supported stable Angular version selected and pinned at implementation time. Build a client-rendered SPA with standalone components, lazy feature routes, typed reactive forms, HttpClient, signals for local view state and RxJS for asynchronous request flows. SEO and server-side rendering are unnecessary for this private application.

Use Angular CDK for accessible overlays and focus handling. Build a small branded component library rather than imposing an unmodified admin template. Generate API types from FastAPI's OpenAPI contract. Avoid a global state library until there is a demonstrated need.

Route groups: access, home, rounds, standings, duties, evidence, cases, polls, members, constitution, function, notifications and administration. Guards improve navigation but never substitute for server authorization. Sensitive responses and videos must not enter a persistent offline cache. Clear user-specific state on sign-out and membership loss.

Configure Vercel to return the SPA entry document for application deep links while preserving real asset and API failures. Angular documents this requirement for routed static deployments. [Angular deployment](https://angular.dev/tools/cli/deployment)

### Python

Use FastAPI, Pydantic request/response models, SQLAlchemy and Psycopg, with Alembic owning application migrations. Keep route handlers thin. Separate domain services for permissions, marks, evidence, cases, voting, imports and closure. Use explicit database transactions around each domain mutation.

FastAPI is supported as a Vercel Function. Treat each invocation as bounded and disposable. Persist no authoritative state in process memory or the filesystem. Vercel function requests and responses have payload limits, so videos must bypass the API. [FastAPI deployment](https://vercel.com/docs/frameworks/backend/fastapi), [function limits](https://vercel.com/docs/functions/limitations)

Use Supabase's transaction pooler for runtime SQL, a deliberately small application connection pool and disabled prepared statements as required by that mode. Use a direct or session connection for migrations, not the runtime transaction pooler. Use TLS with certificate verification where supported and never silently fall back to plaintext. [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres)

### Repository layout

```text
apps/web/                 Angular application and component tests
apps/api/app/             FastAPI routes, services and persistence
apps/api/migrations/      Alembic schema, constraints and policy migrations
apps/api/tests/           Domain, authorization and integration tests
contracts/               Generated OpenAPI contract and frontend client
tests/e2e/               Browser journeys and deployed smoke checks
fixtures/                Synthetic demo and sanitised importer fixtures
docs/                    Approved plan, design and operating instructions
```

Keep schema changes in one migration history. Do not let dashboard edits, SQL scripts and ORM creation each independently own the same schema.

## 4. Authentication, permissions and privacy

Supabase Auth verifies identity. Python verifies the access token signature, issuer, audience and expiry using the project's configured signing keys. Require asymmetric signing for the planned JWKS flow and handle key rotation. Never trust a decoded token without signature verification. [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts)

Every domain request resolves active league membership from PostgreSQL. Captain authority comes exclusively from `leagues.captain_membership_id`, checked on each protected operation. Do not cache captain status in long-lived tokens. Invite acceptance binds a verified account to a specific invitation atomically and cannot claim a different member by display name.

| Operation | Member | Captain | Appointed case chair |
| --- | --- | --- | --- |
| View league results, submitted evidence and duties | Yes | Yes | As member |
| Upload evidence for own duties | Yes | Yes | As member |
| Raise a challenge or conduct report | Yes | Yes | As member |
| Vote | Only if eligible | Only if eligible | Only if eligible |
| Accept evidence | No | When uninvolved | For assigned case if applicable |
| Manage imports, members and seasons | No | Yes | No |
| Decide a contested case alone | No | No | No |
| Record and apply a valid case outcome | No | When uninvolved | Assigned case only |
| Initiate captain transfer | No | Yes | No |
| Accept a transfer | Named active recipient only | Not on recipient's behalf | No special power |

An involved captain recuses. Until the chair appointment procedure is adopted, hold the case with a visible next action rather than allowing a self-appointment or self-approval. Recommended procedure: record the uninvolved members' chair selection, then grant authority only for that case. The captain cannot approve their own evidence.

Use a private application schema not exposed through Supabase's public Data API. Browser clients use Auth and scoped Storage grants, not unrestricted table access. The Python runtime uses a restricted non-owner database role without `BYPASSRLS`. Add league-scoped RLS as defence in depth, using transaction-local verified actor context. Explicitly set and clear context within every transaction so pooled connections cannot leak identity. Test API permissions and database policies separately. Design policy helpers to avoid recursive membership policies.

Storage service credentials are server-only and bypass Storage policies, so each grant issuance needs an explicit membership and ownership check. Browser users receive narrowly scoped, expiring grants, never service credentials. [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)

Audit records are append-only for the runtime role. Store who acted and the relevant before/after values. Exclude passwords, cookies, signed media URLs, authentication tokens and raw ballot choices from general audit output. Keep emails and connection diagnostics out of league-wide API responses.

## 5. Consolidated PostgreSQL model

Preserve the M1-M27 references from planning. Additions below fill application workflow gaps. Fields shown are the important fields, not final migration syntax. Use UUID IDs, UTC `timestamptz`, monetary-free mark counts, exact `numeric` points and explicit foreign keys. Mutable records have `created_at`, `updated_at` and an optimistic concurrency version.

### Membership and season records

| Ref | Table | Essential fields and constraints |
| --- | --- | --- |
| M1 | `users` | Unique Supabase auth subject, display name, private email reference. No passwords. |
| M2 | `leagues` | Name, timezone, crest reference, required `captain_membership_id`. Captain must belong to this league and be active with a user account. |
| M3 | `league_memberships` | League, optional user, display name, active/withdrawn status, joined/left times. Unique league/user when user is present. No separate role field. |
| M4 | `invitations` | League, intended email, hashed token, expiry, status, invited by, accepted by/time. No captain invitation role. |
| M5 | `seasons` | League, name, competition label, draft/active/closed state, start/end dates, adopted rule version, actual closure time. |
| M6 | `season_memberships` | Season, league membership, participation state and effective dates. Unique season/member. |
| M27 | `captain_transfers` | League, current captain, recipient, pending/accepted/declined/cancelled/expired state, request/expiry/response times. One pending request per league. |

Create the first league and its captain membership in one bootstrap transaction using a deferred same-league foreign key. Never leave a usable league with no captain. Captain deactivation or departure requires a completed transfer first.

### Competition and imports

| Ref | Table | Essential fields and constraints |
| --- | --- | --- |
| M7 | `rounds` | Season, external ID, name, sequence, status, scheduled first kickoff, confirmed house pick deadline, confirming actor/time. |
| M8 | `teams` | Source-scoped external ID, name, short name, artwork reference. |
| M9 | `fixtures` | Round, source-scoped external ID, home/away teams, kickoff, status, actual scores, latest import reference. |
| M10 | `superbru_connections` | Owning user, account identifier, status, consent reference, secret reference, expiry if known, last successful sync. No readable credentials. |
| M11 | `superbru_pools` | Season, connection, external pool ID and allowed source URL. One configured pool per season initially. |
| M12 | `superbru_member_mappings` | Pool, external player ID, season member, observed name, confirmer/time. Unique external player and local season member within pool. |
| M13 | `import_runs` | Pool, method, scope, capture time, ingestion time, status, parser version, completeness, error summary, sanitized source reference/hash. |
| M14 | `standing_observations` | Import, mapping, round, round points/rank, overall points/rank, optional source awards. Immutable source observation. |
| M15 | `pick_observations` | Import, mapping, fixture, submitted/missing/unknown state, optional visible prediction, source submission time only if supplied. |
| M30 | `import_findings` | Import, member/round, type, evidence, proposed action, pending/confirmed/dismissed/superseded state, reviewer/time and resulting duty reference. |

M30 makes import confirmation durable and idempotent. Never match members solely by display name. A parser failure must not overwrite last known good standings. Keep observations immutable and distinguish source capture time from later ingestion time.

### Rules, duties and media

| Ref | Table | Essential fields and constraints |
| --- | --- | --- |
| M16 | `rule_versions` | Season, version, full text/reference, typed calculation settings, proposed/adopted state, effective time and adoption poll/record. Adopted versions are immutable. |
| M17 | `duties` | Season member, optional round, type, clause, rule version, reason, trigger, deadline, pending_deadline/open/completed/voided state, originating case/finding, parent correction duty, accepted completion time, void reason. |
| M18 | `evidence_submissions` | Season, submitter, asset, claimed completion time, submitted time, note, publication state. A replacement is a new submission. |
| M19 | `duty_evidence_links` | Duty, submission, pending/accepted/rejected/superseded decision, reviewer/time, reason, accepted effective completion time. Unique duty/submission. |
| M20 | `duty_pause_intervals` | Duty, case, qualifying reason, start/end, actor. End cannot precede start. |
| M26 | `media_assets` | League AND season, uploader, unique object path, filename, detected type, size, duration, checksum if available, processing status, upload expiry, `purge_after`, `purged_at`. |
| M28 | `season_closure_snapshots` | Season, revision, closure time, creator, rules/calculation version, immutable member and duty totals, unresolved items, revision reason and previous snapshot. |

Media belongs to one season. A combined submission may link only to the submitting member's duties in that season. This avoids conflicting retention dates. Acceptance belongs on M19 because the same video may satisfy one duty and fail another. A submission's summary status is derived from its links.

`overdue` and `under_review` are display states derived from the duty, time and active cases. They are not competing values in the duty's persisted lifecycle status.

### Cases, votes and operations

| Ref | Table | Essential fields and constraints |
| --- | --- | --- |
| M21 | `cases` | Season, reporter, subject, optional duty/submission, category, description, chair, response deadline, lifecycle state, outcome and decision time. |
| M22 | `polls` | Season, optional case, question, proposed action, open/close times, lifecycle state, immutable quorum/threshold settings and result. |
| M23 | `poll_options` | Poll, label, order. Single choice for the first release. |
| M24 | `poll_eligible_voters` | Poll, member, frozen eligibility/exclusion reason, selected option OR abstention, response time, version. One row per voter. Option must belong to this poll. |
| M25 | `audit_events` | League/season, actor or system identity, action, entity, reason, redacted before/after details, time, request identifier. |
| M29 | `background_jobs` | Type, scope IDs, unique deduplication key, payload version, queued/running/succeeded/failed state, available time, lease, attempts and sanitized last error. |
| M31 | `notifications` | Recipient membership, optional season, event kind, entity reference, deduplication key, created/read times. In-app only. |
| M32 | `league_events` | Season, title, scheduled date/time, venue, bus destination, uniform description, winner reward text, draft/published/cancelled state, linked decisions. |
| M33 | `event_rsvps` | Event, member, attending/not_attending/undecided response, update time. One response per member/event. |
| M34 | `case_responses` | Case, author membership, text, optional reference to an existing submission, submitted time. Append-only responses, not a general chat feed. |

The final-function module is proposed scope P8. Decisions about reward, venue and uniform can be supported by M22 polls. Recording an RSVP or event does not create an attendance sanction. Closing an event is distinct from closing the season register.

### Database invariants

| Ref | Requirement |
| --- | --- |
| I1 | Same-league and same-season composite foreign keys prevent cross-league links even when all supplied UUIDs are valid. |
| I2 | Do not delete members, rules or duties referenced by history. Withdrawal and voiding preserve relationships. |
| I3 | Use partial unique indexes to prevent duplicate live pick-completeness duties per member/round if B6 is adopted. Link correction duties explicitly. |
| I4 | Lock the league and pending transfer rows during acceptance. Recheck current captain, recipient, expiry and active membership. |
| I5 | Lock the poll during closure and ballot mutation. At server time greater than or equal to `closes_at`, reject ballot changes even if a scheduler is late. |
| I6 | Mutation, audit and notification creation are atomic. Use idempotency keys for retried commands. |
| I7 | Index tenant/season foreign keys, unresolved duty deadlines, review status, poll closing time, pending job time and media purge time. |
| I8 | No independent mutable mark balance. Snapshot totals must identify their source rules and calculation version. |

## 6. Domain workflows

### Joining and captain transfer

Captain creates a member or invitation. Recipient authenticates through their verified email, accepts the single-use invitation and joins the existing membership where applicable. Only the captain enrolls members into an active season. Initial bootstrap provisions Victor's verified account through an operator setup command, not a public create-captain endpoint.

Captain selects a registered active member and requests transfer. Recipient gets an in-app action and sees the responsibilities. Acceptance revalidates all conditions and changes the captain in one transaction. Decline or cancellation leaves the current captain unchanged. Expiration is enforced during requests as well as maintenance jobs. Send notifications to both parties after commit.

Transferring captaincy does not transfer ownership of the former captain's personal Superbru session. The new captain sees connection health, never credentials. If continued access is not explicitly authorised by the connection owner, pause automatic imports until reconnection.

### Round administration and imported findings

Create/import the round and fixtures. Captain confirms the house deadline and any later schedule change. Publish a readable change history. Separate fixture kickoff times, pick deadline, duty deadline and source observation time.

Importer records snapshots, mappings and candidate findings. Captain reviews missing/partial picks, round Spoon candidates and ties before confirming. Findings with unknown visibility, incomplete source coverage, unadopted tie rules or uncertain deadlines require attention rather than automatic penalties. Confirmation links one finding to one resulting action and is safe to retry.

A schedule change never silently moves an existing duty's deadline. Require a reason and preview the effect on marks. Preserve the original values in history.

### Duties and marks

Keep the current proposal: each duty earns one symbolic mark per complete 168 hours of unresolved overdue time, excluding qualifying pause intervals. Completion stops accrual but retains earlier marks. Actual season closure caps every calculation. Unknown deadline and voided duties have zero included marks.

```text
cutoff = minimum(now, accepted completion if any, season closure if any)
elapsed = max(0, cutoff - deadline)
paused = duration of the UNION of pause intervals within [deadline, cutoff]
marks = floor(max(0, elapsed - paused) / 168 hours)
```

Use server time and UTC arithmetic. Display SAST. Calculate counts on demand. Do not increment counts with cron. Preserve fractional progress when resuming after a pause only if interpretation D1 is adopted. The API returns the computed total, calculation explanation, as-of time, next threshold and rules status. Angular formats these values rather than implementing a second authoritative calculator.

Before live activation, confirm earlier D1-D5: paused remainder, timely-dispute qualification, evidenced completion timestamp, void handling and inclusive threshold cutoff. Demonstration data never converts silently into historic enforceable duties.

### Evidence acceptance

Member selects their duty or several of their duties, uploads a video, records the claimed completion time and submits. The visible publication event is successful submission, not merely starting an upload. The captain or uninvolved authorised reviewer accepts/rejects each duty link with a reason. Only accepted evidence changes the duty's effective completion time. Evidence submission alone does not stop accrual under the current proposal.

For the captain's own evidence, appoint an uninvolved reviewer through the approved chair procedure. No self-acceptance. Store actual completion time separately from review time and reject future effective times. A challenge references the exact submission, not whichever file is newest.

### Cases and polls

Member selects a challenged duty/video or reports conduct, explains the issue and submits. Subject can respond. Proposed B3 provides 24 hours to respond and a following 48-hour poll. These durations, voter exclusions and quorum remain pending adoption.

Freeze voter eligibility and poll rules at opening. Record the complainant and subject as excluded in a disciplinary poll. An uninvolved chair has case-specific authority. Fewer than two eligible voters routes to an agreed resolution, with an explicit recorded outcome.

For a binary disciplinary poll, proposed evaluation is: more than half the eligible members participate and more than half of non-abstaining votes support the proposed action. Explicit abstention counts toward participation but not the yes/no denominator only if that interpretation is adopted. A tie, all abstentions or failed quorum creates no new sanction. Multi-option event polls need a separately visible plurality or runoff policy and must not reuse the disciplinary rule silently.

Opening rules, choices and eligibility cannot be edited after voting starts. Cancel and replace a flawed poll. Ballots remain confidential in member-facing responses and normal audit screens. This is controlled visibility, not cryptographic anonymous voting. Database operators can access stored records.

Closing a poll calculates the result once. Applying a result is an idempotent transaction, recorded by the authorised chair or captain. A result cannot grant powers or sanctions outside its published proposal. If a challenged existing duty remains unresolved after no quorum, keep the case pending with the applicable pause until a recorded resolution. Do not infer dismissal or automatic resumption.

Rejecting an old accepted video creates a linked correction duty with a newly agreed deadline. Preserve the original completion and marks. Never backdate a correction penalty.

### Season closure and retention

Captain previews outstanding duties, unresolved cases, final standings, mark totals, rules and the video deletion date. Pending polls/cases are surfaced explicitly and require a recorded treatment before closure. Closing freezes marks at the actual closure timestamp and preserves unresolved duties as outstanding at closure, not completed. Default that timestamp to server time. A recorded earlier closure requires a reason and impact preview. Reject future closure timestamps and never treat a scheduled event date as actual closure.

Persist M28 and set all season media purge dates to closure plus 90 days. Store UTC and display the resulting SAST date. Corrections after closure require a reason, retain prior snapshots and create a new revision. They do not restart accrual or extend video retention. Post-closure uploads for authorised corrections inherit the original purge date and are blocked after it.

Retention deletion includes originals and any derivatives. Hide playback and stop issuing grants at `purge_after` even if physical deletion is retrying. Limit playback grant expiry to the remaining retention window. Keep tombstones and retry failed deletions. Define and test backup handling so restoring an older backup does not reintroduce purged videos. Raw video bytes must not enter database backups or logs.

## 7. Private video pipeline

Python creates a unique reserved asset path after checking active membership, owned duty links, open retention window and configured quota. It returns a scoped upload grant. Angular uploads directly to Supabase Storage using TUS with progress, retry and resumable support. Supabase supports both resumable transfers and signed upload tokens. [Resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)

After transfer, Angular calls a finalize endpoint. Python verifies the actual object exists at the reserved path, checks size and type, and moves it through validation before permitting publication. Browser metadata is advisory. Do not accept a client-provided arbitrary storage path or URL. Uploads are immutable with overwrite disabled.

Proposed initial compatibility target is MP4 with H.264/AAC and tested WebM variants. Test actual iPhone and Android captures early, including HEVC/MOV and portrait orientation. Unsupported encodings need a clear replacement/export route. Do not claim that every phone video plays simply because the container extension is accepted.

Use bounded server-side media inspection with a packaged tool only after proving it fits the selected Vercel runtime and processing budget. There is no automatic transcoding in the base topology. If native phone compatibility requires conversion, select a separate managed processor or worker before launch and update the architecture. That is an explicit implementation gate, not hidden work inside a request handler.

Supabase's configured global and bucket limits constrain the application's limit. The current Free tier documentation caps a file at 50 MB. Confirm selected tier and settings during setup. [Storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits)

Playback requests recheck league membership and retention. Return a short-lived signed URL and serve bytes from Storage, not Python. Signed links are temporary bearer credentials and can remain usable until expiry after membership removal. Use short validity and no public share button. Privacy does not prevent an authorised viewer recording what they watch. [Private downloads](https://supabase.com/docs/guides/storage/serving/downloads)

Unsubmitted uploads are visible only to their uploader and maintenance service. Proposed orphan cleanup is 24 hours after reservation expiry. Submitted evidence is league-visible while awaiting a decision. Do not generate public thumbnails or index video URLs.

## 8. Superbru integration boundary

Superbru's published terms restrict automated collection and automated access. Obtain the relevant written permission before enabling scraping. Account access alone is not permission from Superbru. [Superbru terms](https://www.superbru.com/policies/terms-of-use)

No account inspection has occurred in this planning task. Visible fields, submission timestamps, player identifiers, pagination and authentication requirements remain unverified. Do not invent endpoints or promise reliable pre-deadline pick detection.

Start with captain-entered fixtures/results and a documented application CSV format. An authorised adapter later produces the same validated import envelope: source, pool, captured time, scope, completeness, external identities and observations. Uploaded files have schema/size limits and never execute embedded content.

The adapter is read-only. It does not enter picks or change Superbru settings. Restrict fetch destinations to configured official origins, use conservative frequency, cache unchanged data, back off on errors and stop for expired login, MFA or CAPTCHA. Reauthentication is an owner action. No bypassing access controls.

Run a bounded HTTP adapter on Vercel only if inspection proves it works without browser automation and within runtime limits. If it requires a persistent browser, run it as a separately operated Python worker or supervised local importer. Worker hosting is not selected or funded by this plan. Use a scoped, rotatable ingestion credential and require the same schema validation. It cannot directly create duties or access league videos.

Deadline compliance needs a timely, complete observation that proves the required state. Later visibility cannot reconstruct missing history. Scheduled captures can fail or be delayed, so show unknown and allow documented captain review. An import must never manufacture a submission timestamp.

## 9. API and asynchronous operations

All API routes are versioned under `/v1`. IDs are checked against route league/season context. Lists are paginated and filtered server-side. Return readable errors with request IDs. Use 401 for missing/expired authentication, 403 for denied actions, 409 for version or state conflicts and 422 for validation. Avoid leaking cross-league record existence.

| Area | Representative operations |
| --- | --- |
| Session | `GET /me`, accept invitation, update own profile. |
| League | List memberships, invite/withdraw member, request/accept/decline/cancel captain transfer. |
| Seasons | Create/configure season, enroll members, dashboard, preview/apply closure, read revisions. |
| Rounds | List/detail fixtures, confirm deadline, view standings and observed pick completeness. |
| Imports | Manual entry/CSV preview, start authorised sync, inspect run, map members, confirm/dismiss findings. |
| Duties | Create/detail/update with version, accept completion, void, view calculation and history. |
| Evidence | Reserve upload, finalize asset, submit evidence, get playback grant, decide a duty link. |
| Cases | Open case, append response, appoint chair, record pause, propose poll, apply decision. |
| Polls | Open/cancel, list eligibility, cast/revise/abstain, close and read result. |
| Operations | Notifications, RSVP, event details, rules, audit, CSV/JSON exports. |

Use dedicated action endpoints for decisions and transfers rather than arbitrary status PATCH requests. Mutations require idempotency keys and expected versions where appropriate. Two accept clicks must not complete two transfers or create duplicate duties.

Persist durable jobs for purge, orphan cleanup, poll/transfer housekeeping, optional import requests and exports that exceed a small response. Workers claim jobs with a lease and row locking, checkpoint bounded batches and retry with backoff. Never rely on FastAPI in-process background tasks surviving a function return.

Vercel Cron triggers protected endpoints and does not guarantee exactly-once work. Current Hobby scheduling is daily with imprecise timing, while paid scheduling can be more frequent. Select the plan after required responsiveness is agreed. Marks, vote closing boundaries and transfer expiry remain correct without a punctual cron. [Cron operation](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [cron plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)

Check timestamps on reads and mutations. Jobs materialise results and perform physical cleanup. In-app notification rows can be created with the originating transaction. Polling active screens and refreshing on focus is sufficient initially. Do not add WebSockets solely for counts or status badges.

## 10. Configuration, release and operations

| Environment | Services and data |
| --- | --- |
| Local | Local Angular/Python, isolated development Supabase project or local Supabase, synthetic members/media. |
| Preview/staging | Two Vercel projects or paired previews against staging Supabase. No production secrets or personal Superbru sessions. |
| Production | Fixed frontend/API origins and dedicated production Supabase project. Controlled migrations and production-only scheduled jobs. |

Browser configuration includes only API origin, Supabase project URL and publishable key. Server secrets include restricted database URL, Storage administration credential, cron secret and encrypted integration secret references. Migration credentials are separate. No connection/session secrets in Angular bundles or error monitoring.

Configure Auth redirect allowlists, exact CORS origins, CSP, private response cache controls, upload limits, rate limits and staging/production separation. Provision and test production email delivery for authentication codes, including sender/domain configuration, delivery limits and expiry behaviour. Do not assume development email settings are sufficient for invited members. Prefer hosting the API near the database after checking available regions. Pin dependency versions and use lockfiles.

CI runs frontend checks/build, Python tests, migration tests and PostgreSQL integration tests before preview deployment. Apply additive migrations before dependent code. Run migrations once per controlled release, never at function startup or on every preview build. Test deep links, authentication callbacks and database connectivity in the actual deployed environment.

Record request IDs, domain errors, job delays, connection exhaustion, import completeness and storage usage without private payloads. Captain administration displays failed jobs requiring attention. Back up PostgreSQL on the selected tier and rehearse restoration. Keep a deletion ledger available to recovery procedures. Estimate cost from members, videos per round, average file size, views, retention period and sync cadence rather than promising a free deployment.

## 11. Delivery sequence and exit criteria

| Phase | Deliverable | Exit criterion |
| --- | --- | --- |
| H1 | Design review and technical proof | Approve key mobile/desktop flows. Deploy Angular plus a Python health endpoint and pooled database query. Prove real phone upload/playback and record integration unknowns. |
| H2 | Identity and season foundation | Invitations, membership, one-captain invariant, accepted transfer, rules states and season setup work with tested access boundaries. |
| H3 | Duties and private evidence | Independent marks, upload/resume, league playback, per-duty review, pauses and audited corrections pass end-to-end tests. |
| H4 | Cases and voting | Responses, chair scope, eligibility, ballots, quorum and idempotent outcomes work. Unadopted rules remain gated. |
| H5 | Competition administration | Rounds, fixtures, manual imports, mappings, observations and confirmed findings work without automated collection. |
| H6 | Authorised Superbru adapter | Permission and account capability confirmed, representative parser fixtures tested, hosting selected and failed/incomplete observations safely handled. This phase may remain blocked independently. |
| H7 | Closure and operations | Event/RSVP module if accepted, notifications, exports, snapshots, 90-day purge and recovery rehearsal completed. |
| H8 | Production readiness | Mobile and desktop acceptance, security checks, deployment smoke tests, operator handover and owner-approved launch. |

Deliver usable vertical flows at each phase. Do not implement all tables and leave every screen as a placeholder. H6 does not block manual operation, but automated integration must not be reported complete until its separate exit criterion passes.

## 12. Acceptance tests

| Ref | Required verification |
| --- | --- |
| AT1 | An uninvited account cannot view a league. A valid invitation can be accepted once by the intended verified identity. |
| AT2 | Two concurrent captain acceptance attempts leave exactly one captain and one accepted outcome. The former captain immediately loses protected permissions. |
| AT3 | A member cannot forge captain, another member's upload ownership, another league's UUID or an unrelated chair assignment. |
| AT4 | At deadline and one second before seven full days, marks are zero. At seven, fourteen and twenty-one days they are one, two and three under the adopted rule. |
| AT5 | Overlapping pauses are subtracted once. Open pauses, pre-deadline pauses, completion and closure use the same calculator everywhere. |
| AT6 | A video submitted but not accepted does not silently complete a duty. One submission can receive different decisions for different duty links. |
| AT7 | Upload interruption, retry, duplicate finalize, expired authorization, oversized file, unsupported format and orphan cleanup are handled without duplicate published evidence. |
| AT8 | Active league members can play submitted video. Outsiders and withdrawn members cannot obtain new grants. No public bucket or unrestricted object listing exists. |
| AT9 | Post-retention playback is blocked, physical deletion retries safely and preserved metadata contains no playable media link. Recovery does not restore deleted video availability. |
| AT10 | Captain cannot approve their own evidence or decide their own case. Assigned chair cannot administer unrelated cases or league settings. |
| AT11 | Eligibility is frozen, excluded users cannot vote, options belong to their poll and a vote racing with closure is handled using server time and locks. |
| AT12 | Quorum, abstention, tie and no-quorum outcomes match the adopted version. Closing/applying a result twice has one effect. |
| AT13 | Partial/failed imports preserve last good results. Unknown picks never create missing-pick duties. A confirmed finding cannot create duplicates. |
| AT14 | A later source correction or fixture postponement cannot silently rewrite a confirmed duty or deadline. |
| AT15 | Closure freezes totals and preserves outstanding status. A correction produces a new snapshot revision without extending accrual or retention. |
| AT16 | Direct browser database/Storage access cannot bypass Python permissions. Tenant context does not leak through pooled SQL connections. |
| AT17 | Dashboard, detail and export totals agree at the same as-of time. CSV cells escape formula prefixes and JSON backups exclude secrets and video bytes. |
| AT18 | Keyboard, screen reader labels, focus order, contrast, 200% zoom, 320 px layout, phone upload and desktop review journeys pass. |
| AT19 | Production deep links, staging isolation, cron authorization, job lease recovery and restore procedures are demonstrated. |
| AT20 | Pending rules are visibly proposed. No enforcement is backfilled on activation without a separately approved, explicit action. |

## 13. Open decisions and launch gates

| Ref | Item | Recommended treatment |
| --- | --- | --- |
| G1 | Constitution discrepancy and outstanding rule proposals | Reconcile clause 6.5 and adopt exact text/calculation interpretations before live duties. |
| G2 | Ballot visibility, abstention and multi-option ties | Review P7 and the proposed counting rules before implementing final vote semantics. |
| G3 | Superbru permission and account visibility | Inspect only after authorisation. Confirm data fields, temporal evidence and runner requirements. |
| G4 | Video compatibility and quota | Test member devices before fixing P6. Approve a separate processor if native encodings require it. |
| G5 | Hosting tiers and scheduler cadence | Select based on uploads, retention and import frequency. Do not assume free-tier timing meets deadline capture needs. |
| G6 | Captain unavailable or inaccessible account | Define a documented recovery process. No secret member-facing takeover or second captain. |
| G7 | Case chair appointment and evidence self-review | Adopt how uninvolved members choose a chair before the captain's first personal review. |
| G8 | Event/RSVP scope and post-retention challenges | Confirm P8. A late challenge still exists after video deletion but uses retained records and available evidence. No automatic re-creation of deleted files. |

Technical sources were checked on 22 September 2026. Recheck platform limits at implementation and deployment. The companion design brief maps every user-facing capability to mobile and desktop screens.

## Decisions recorded on 2026-09-24

These league decisions supersede the proposals above where they differ.

| Topic | Decision |
| --- | --- |
| Joining | A member signs in (Google or email and password) and claims their own Superbru name from the unclaimed list. The captain may reserve a name for a specific email address, and may release a wrong claim. Invitation tokens (M4) are not used. |
| Display names | The Superbru nickname is the display name. |
| Spoon deadline | A Spoon duty is due at the first kickoff of the next round. Without a published kickoff the duty waits for a deadline and earns nothing. |
| Evidence completion time | A member's own accepted evidence completes the duty at submission time. Evidence the captain records on a member's behalf completes it at the captain-entered completion time. |
| Challenges and marks | A challenge never pauses accrual. If the challenge is resolved against the member the marks stand; if it is resolved in the member's favour the overdue clock restarts from the resolution (`duties.clock_reset_at`). Duty pause intervals (M20, interpretation D1) are not used. |
| Superbru sync and the Spoon | The sync does not exist yet. When it does, the round's last-placed member is proposed as an import finding for one-tap captain confirmation (P3), never created automatically. Until then the captain creates Spoon duties from the register. |

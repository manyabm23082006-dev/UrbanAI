# UrbanGuard AI — Feature Implementation Pass (2026-08-10, continued)

## What this pass adds (backend, fully implemented + live-tested + regression-tested)

Starting from the verified-working baseline (29/29 original tests passing,
real SQLite persistence, no mock data — see the earlier section of this
file for that pass), I picked the highest-value items from the 46-point
brief that could be built properly end-to-end in this session, rather
than shallowly stubbing all 46. Prioritized because: (a) they were
explicitly named as "not done" in the previous pass, (b) they're needed
before most of the other items are meaningful, and (c) two of them are
real bugs/gaps, not just missing features.

### 1. Real bug fix: Municipality staff could not update case status
`PATCH /api/v1/incidents/{id}/status` was gated to `POLICE_ROLES` only.
City Planner / Analyst (Municipality) accounts got a 403 trying to update
the status of the infrastructure cases (potholes, streetlights, drainage,
etc.) they are actually responsible for. Fixed with a new
`CASE_UPDATE_ROLES = POLICE_ROLES ∪ MUNICIPALITY_ROLES` group in
`app/api/deps.py`. **Verified live**: before the fix this 403'd; after,
it returns 200. Covered by `test_municipality_can_update_incident_status_regression`.

### 2. Case progress tracking (item #16 in the brief)
New `Incident` columns: `progress_pct` (0-100), `assigned_team`,
`expected_completion` (SLA target), `reopened_count`. New endpoint
`PATCH /api/v1/incidents/{id}/progress`, restricted to
Police ∪ Municipality staff, writes an `IncidentEvent` audit-trail entry
and an `AuditLog` row on every change. Marking status `Completed` also
auto-sets `progress_pct = 100`.

### 3. Before/During/After evidence photos (item #17)
New `IncidentEvidence` table + `POST/GET /api/v1/incidents/{id}/evidence`.
Upload the image via the existing `POST /api/v1/reports/upload-photo`
first, then attach the returned URL with a `phase` of `Before`/`During`/
`After`. Invalid phase values are rejected (400).

### 4. Citizen resolve-confirm / reopen loop (item #18)
`POST /api/v1/incidents/{id}/confirm-resolution` and
`POST /api/v1/incidents/{id}/reopen`. Both are ownership-checked against
the `Report` that created the incident — **verified live** that a citizen
who didn't file the report gets 403, and that both actions correctly
reject cases that aren't currently `Completed` (400). Reopening
increments `reopened_count`, moves status back to `Repair In Progress`,
and notifies Municipality staff. Confirming closes the case permanently.
`GET /api/v1/reports/mine` and `/reports` now also return `case_status`,
`case_progress_pct`, and `case_expected_completion` for the linked
incident, so a citizen doesn't need a second API call to see it.

### 5. System-wide audit logging (item #38)
New `AuditLog` table (independent of the existing per-incident
`IncidentEvent` trail) + `app/services/audit.py` helper. Logs: login /
login_failed, incident status changes, progress updates, evidence
uploads, confirm-resolution, reopen-case, and vehicle-document views
(both granted and denied). New admin-only endpoint
`GET /api/v1/audit-logs` (optional `?action=` filter), **verified** to
403 for non-admins and 401 for anonymous requests.

### 6. Secure, RBAC-checked document viewer (items #6, #8, #36)
Real security gap found and partially closed: uploaded vehicle documents
(RC, insurance, government ID, driving licence) were served from a fully
public static `/uploads/` mount with **no authentication or authorization
check at all** — anyone who obtained a file's URL could view it. Added
`GET /api/v1/vehicles/documents/{doc_id}/file`, which checks the
requester is either the vehicle's owner or Traffic/admin staff before
streaming the file, and logs every access (granted or denied) to the
audit log. **Verified live**: owner and Traffic staff pass the RBAC check
(404 only because the demo record has no real file on disk); an
unrelated Municipality account is correctly blocked with 403 *before* the
file is even looked up.

**Honest limitation — not fixed in this pass:** the static `/uploads/`
mount itself is still active and still serves any file whose exact URL
you have, with no auth check. Fully closing that requires moving document
storage off predictable public static paths (signed URLs or an
authenticated object store) — a real storage-layer migration, not a
route-level fix, and out of scope for this pass. The new endpoint above
is the correct, audited path the frontend should use; the old static URLs
are a known residual gap, not something silently left in place unlabeled.

### 7. SLA / overdue analytics (items #16, #22, #25)
`GET /api/v1/municipality/analytics` — every field is a live aggregation
over `Incident` rows (no hardcoded numbers): open, in-progress, resolved,
and overdue counts (`overdue` = has an `expected_completion` in the past
and isn't Completed/Closed), a resolution-rate percentage, average
resolution time in hours, and a category breakdown. Scoped to
infrastructure-type incidents (pothole, streetlight, drainage, etc.), not
every incident in the system. 403's for non-Municipality roles.

## Verification performed (not just "should work")
- Full pytest suite re-run after every change: **35/35 passing**
  (29 original regression tests + 6 new ones I wrote, covering the bug
  fix, progress/evidence, confirm/reopen ownership enforcement, SLA
  analytics RBAC, audit-log RBAC, and the secure document viewer RBAC).
- Live end-to-end HTTP testing against a running server (not just reading
  the code) for: report → auto-opened incident → progress update →
  status update → evidence upload → completed → citizen sees case_status
  → confirm-resolution → reopen loop with ownership enforcement →
  municipality SLA analytics → admin audit-log viewer (with RBAC denial
  for non-admins) → secure document viewer (with RBAC denial for
  unrelated staff, confirmed via the audit log).
- Confirmed the app boots cleanly from a totally fresh database (auto
  schema migration adds all new nullable columns/tables automatically —
  no manual `DROP DATABASE` needed, consistent with the "no data loss on
  redeploy" requirement in the brief).

## What was NOT attempted in this pass (explicitly, so it's not implied done)
- **Frontend wiring.** None of the 7 features above have UI yet — this
  pass is backend-only, same as the last one. The municipality dashboard
  doesn't have progress/evidence controls, the citizen portal doesn't have
  confirm/reopen buttons, and there's no audit-log viewer screen. The APIs
  are ready for a frontend to call; building and testing that UI (across
  three different dashboards) is a separate, sizeable pass.
- Persistent/cloud file storage surviving a Render redeploy (item #4) —
  still using local disk.
- Document viewer *modal* with PDF/image preview in the Traffic UI (item
  #6's UI half) — the secure backend endpoint exists; no frontend consumes
  it yet.
- Automatic multi-department routing for cross-department cases (item #20,
  e.g. an accident auto-notifying both Traffic and Emergency) — not built.
- Most of the ~30 remaining brief items (hotspot/heatmap maps, several of
  the Traffic/Emergency-specific analytics breakdowns, search/filter UI,
  time-range selectors, etc.) — not attempted this pass.

Happy to continue with a specific next slice — most likely candidates
would be wiring the Municipality dashboard UI to the new progress/evidence
endpoints, or the citizen-side confirm/reopen buttons, since those are the
features with the most visible payoff for the least remaining work.

---

# UrbanGuard AI — Review & Fix Pass (2026-08-10)

## What I actually did
I extracted the project, installed the backend, ran its existing 29-test pytest
suite, then manually drove the *real* end-to-end flows against a live server
(not just reading the code):

- Citizen registers → vehicle saved → Traffic staff can look it up / see it in
  flagged-vehicles → **confirmed working**, backed by the SQLite database, not
  localStorage or mock data.
- Citizen submits a medical emergency → appears immediately in the Emergency
  Operator's `/active` list with full details → **confirmed working**.
- Citizen submits an infrastructure report (pothole/streetlight) → appears in
  the Municipality repair queue and in `/api/v1/reports` → **confirmed working**.
- Government/Super Admin `/analytics` endpoint returns counts computed live
  from the database (I checked the numbers moved when I created new records)
  → **confirmed working, not hardcoded**.

Conclusion: the "data isn't persisting / departments can't see submissions"
problem described in the brief did **not** reproduce against this codebase.
The backend already uses SQLite as the single source of truth, `localStorage`
in the frontend is only used for the API base URL and auth token (which is
the correct, harmless use), and RBAC (`require_role`, `POLICE_ROLES`,
`EMERGENCY_ROLES`, etc.) is enforced server-side, not just hidden in the UI.

## Real issues found and fixed
1. **`@app.on_event("startup")`** was using FastAPI's deprecated startup-event
   API. Replaced with a proper `lifespan` context manager
   (`app/main.py`) — same idempotent migrate-then-seed behavior, just on the
   supported API so it won't break on a future FastAPI upgrade.
2. **`db.query(Model).get(id)`** (9 call sites across
   `enforcement.py`, `emergency.py`, `incidents.py`, `notifications.py`) used
   SQLAlchemy 1.x's deprecated `Query.get()`. Replaced with the modern
   `db.get(Model, id)`, identical behavior, removes the deprecation warnings.
3. Re-ran the full pytest suite and a fresh live-server E2E pass after each
   change — **29/29 tests still pass**, no regressions.

## Not changed (already correct, verified live)
- CORS config (`allow_origins` includes `"*"` alongside `allow_credentials=True`)
  looks suspicious on paper, but I checked the actual preflight response:
  Starlette correctly reflects the specific request `Origin` header rather
  than sending back a literal `*`, so browsers accept it. No bug.
- Traffic dashboard doesn't have a "browse every vehicle" table — it has
  plate-number lookup (`/enforcement/lookup`) and a flagged/expiring-documents
  view (`/enforcement/flagged-vehicles`) instead. That's a deliberate,
  reasonable RBAC choice (police shouldn't be able to browse every citizen's
  full vehicle file without cause) rather than a bug, and it's consistent
  with the "no automatic full-department document access" requirement.

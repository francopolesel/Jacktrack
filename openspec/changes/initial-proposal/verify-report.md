## Verification Report

**Change**: initial-proposal
**Version**: N/A
**Mode**: Standard

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 21 |
| Tasks complete | 21 |
| Tasks incomplete | 0 |

### Build & Tests Execution

**Build (tsc --noEmit)**: ❌ Failed
```text
src/db/index.ts(6,36): error TS2551: Property 'databaseUrl' does not exist on type 
'{ PORT: number; DATABASE_URL: string; POLL_INTERVAL_MS: number; ... }'. 
Did you mean 'DATABASE_URL'?

src/tracking/service.test.ts(395,54): error TS2345: Argument of type 
'{ id: number; trackingNumber: string; email: string; status: "active"; }[]' 
is not assignable to parameter of type 'TrackingRecord[]'.
  Property 'carrier' is missing in type ...

src/tracking/service.test.ts(414,54): error TS2345: ... (same type mismatch)
```

**Tests (vitest run)**: ✅ 41 passed / 0 failed / 0 skipped
```text
✓ src/tracking/client.test.ts (7 tests)
✓ src/tracking/service.test.ts (8 tests)
✓ src/scheduler/index.test.ts (10 tests)
✓ src/__tests__/db.integration.test.ts (11 tests)
✓ src/email/templates.test.ts (5 tests)

Test Files  5 passed (5)
     Tests  41 passed (41)
  Duration  1.56s
```

**Coverage**: ➖ Not configured (no coverage threshold set in vitest.config.ts)

### Spec Compliance Matrix

| Spec | Requirement | Scenario | Test | Result |
|------|-------------|----------|------|--------|
| tracking-registration | Form Input | Valid registration | `service.test.ts > "should persist a tracking and return the record on success"` | ✅ COMPLIANT |
| tracking-registration | Tracking Number Validation | Invalid — too short | Code exists (Zod `min(8)` in routes/index.ts) but no covering test | ❌ UNTESTED |
| tracking-registration | Tracking Number Validation | Invalid — special chars | Code exists (Zod `/^[a-zA-Z0-9]+$/` in routes/index.ts) but no covering test | ❌ UNTESTED |
| tracking-registration | Email Validation | Invalid email format | Code exists (Zod `email()` in routes/index.ts) but no covering test | ❌ UNTESTED |
| tracking-registration | Duplicate Detection | Duplicate tracking+email | `service.test.ts > "should handle duplicate tracking+email gracefully"`, `db.integration.test.ts > "should enforce unique constraint"` | ✅ COMPLIANT |
| tracking-registration | Anonymous Access | Unauthenticated registration | No auth middleware exists; form is fully public. No explicit test. | ⚠️ PARTIAL |
| tracking-registration | Error Handling | Server error during persistence | `service.test.ts > "should handle duplicate tracking+email gracefully"` covers DB error branch. Generic error fallback is untested. | ⚠️ PARTIAL |
| tracking-monitoring | Poll All Active | First check — all events new | `service.test.ts > "should fetch active trackings, query 17Track, and return new events"` | ✅ COMPLIANT |
| tracking-monitoring | Poll All Active | Subsequent check — some new events | Dedup via `onConflictDoNothing` is tested, but "some existing, some new" mixing isn't explicitly tested | ⚠️ PARTIAL |
| tracking-monitoring | Poll All Active | No new events | `service.test.ts` — tracking with 0 events omitted from result | ✅ COMPLIANT |
| tracking-monitoring | Batch Requests | More than 40 active | `scheduler/index.test.ts > "should use the configured batch size of 40"` (95 → 40+40+15) | ✅ COMPLIANT |
| tracking-monitoring | Delivery Detection | Delivery confirmed | `service.test.ts > "should detect delivery status"` + `"should mark as delivered"` | ✅ COMPLIANT |
| tracking-monitoring | Restart Survival | Server restart | `scheduler/index.test.ts > "should call checkAll immediately on start"` tests immediate-first-check | ✅ COMPLIANT |
| tracking-monitoring | Polling Interval | Scheduled interval | `scheduler/index.test.ts > "should call checkAll immediately on start and then at interval"` | ✅ COMPLIANT |
| tracking-monitoring | API Error Handling | 17Track API error | `service.test.ts > "should handle API errors for individual trackings"` | ✅ COMPLIANT |
| email-notifications | Conditional Sending | One new event | Events returned by `checkTrackings()` but email sending is NOT wired into scheduler | ❌ UNTESTED |
| email-notifications | Conditional Sending | No new events (no email) | `checkTrackings()` returns empty map | ✅ COMPLIANT |
| email-notifications | Single Email per Batch | Multiple new events | `templates.test.ts > "should generate HTML with tracking number and events"` | ✅ COMPLIANT |
| email-notifications | No Duplicate Sending | Stored sent-flag | Event hash dedup tested via `onConflictDoNothing` chain | ✅ COMPLIANT |
| email-notifications | Email Content | Email format verification | `templates.test.ts > "should generate HTML with tracking number and events"` | ✅ COMPLIANT |
| email-notifications | Email Subject | Subject line | `templates.test.ts` — "New tracking update" in `<title>` tag; email subject header NOT tested | ⚠️ PARTIAL |
| email-notifications | Resend API | Send via Resend | No test exists for `ResendClient` | ❌ UNTESTED |
| email-notifications | Send Failure Handling | Resend API unavailable | Code has try/catch in `client.ts` but no test | ❌ UNTESTED |
| event-translation | 17Track Translation at Registration | Event from Chinese carrier | `client.test.ts > "should send POST with translation_mode and lang=en"` | ✅ COMPLIANT |
| event-translation | English Storage | Event with partial translation | `service.test.ts` stores `translatedDescription`; not explicitly tested for mixed fields | ⚠️ PARTIAL |
| event-translation | No Separate Translation API | Carrier without translation | Original description is stored as-is when no translation available | ✅ COMPLIANT |

**Compliance summary**: 16/27 scenarios fully compliant (59.3%), 6 untested (22.2%), 5 partial (18.5%)

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Form Input | ✅ Implemented | HTMX form with hx-post, hx-target, hx-swap; HTML response on success |
| Tracking Number Validation | ✅ Implemented | Zod: `min(8).max(40).regex(/^[a-zA-Z0-9]+$/)` |
| Email Validation | ✅ Implemented | Zod: `string().email()` |
| Duplicate Detection | ✅ Implemented | DB unique constraint `idx_tracking_email` + catch in service |
| Anonymous Access | ✅ Implemented | No middleware — fully public |
| Error Handling | ✅ Implemented | Global error handler in `app.ts` + Zod validation errors |
| Poll All Active Trackings | ✅ Implemented | `service.checkTrackings()` queries WHERE status='active', calls 17Track |
| Batch Requests | ✅ Implemented | `chunkArray()` in scheduler, configurable batch size (default 40) |
| Delivery Detection | ✅ Implemented | `detectDelivery()` checks 17Track status field |
| Restart Survival | ✅ Implemented | Loads from SQLite every cycle; immediate-first-check on startup |
| Polling Interval | ✅ Implemented | `setInterval` with configurable `POLL_INTERVAL_MS` (default 15min) |
| API Error Handling | ✅ Implemented | Per-number error isolation, try/catch returns empty map |
| Conditional Sending | ⚠️ Partial | Email client exists but NOT wired into scheduler polling flow |
| Single Email per Batch | ✅ Implemented | `newEventEmail()` renders all events in one HTML email |
| No Duplicate Sending | ✅ Implemented | Event hash dedup + `onConflictDoNothing` |
| Email Content | ✅ Implemented | Template includes tracking number, location, description |
| Email Subject | ✅ Implemented | Template `<title>` is "New tracking update"; email subject not tested |
| Resend API | ✅ Implemented | `ResendClient` wraps Resend SDK |
| Send Failure Handling | ✅ Implemented | try/catch in `ResendClient.send()` returns `{ success: false }` |
| 17Track Translation | ✅ Implemented | `translation_mode=UseThirdPartyServices, lang=en` in register() calls |
| English Storage | ✅ Implemented | `translatedDescription` stored alongside raw description |
| No Separate Translation API | ✅ Implemented | No external translation dependency; uses 17Track built-in only |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Flat src/ by domain | ✅ Yes | `tracking/`, `email/`, `scheduler/`, `routes/`, `db/` domains |
| Four DB tables (trackings, tracking_events, sent_emails, sync_log) | ✅ Yes | Schema matches design exactly |
| 17Track API adapter (ITrackingClient interface) | ✅ Yes | `TrackClient implements ITrackingClient` |
| Scheduler: configurable interval, batch 40, 1s gap, error isolation | ✅ Yes | Implemented with chunkArray + sleep(1000) |
| Email: HTML strings (no JSX) | ✅ Yes | `email/templates.ts` — template-literal functions |
| HTMX: hx-post, hx-target, hx-swap | ✅ Yes | Correct attributes on form |
| Server-side only validation (Zod) | ✅ Yes | `@hono/zod-validator` with `zValidator` |
| Config: env vars, Zod-validated at startup | ✅ Yes | `src/config.ts` validates all 7 env vars |
| Error handling: per-number isolation, sync_log, idempotent cycles | ✅ Yes | `service.ts` + `client.ts` implement per-error handling |
| Mock strategy: ITrackingClient as seam | ✅ Yes | Tests mock client interface |
| In-process scheduler (no queue/Redis) | ✅ Yes | `setInterval` in `Scheduler` class |
| Polling flow: chunk → sleep → call → diff → persist → email → update | ⚠️ Partial | Chunking, diffing, persisting all done. Email sending step is **missing** from scheduler flow. `checkAll()` logs events but never calls ResendClient. |

### Issues Found

**CRITICAL**:
1. **`config.databaseUrl` typo in `src/db/index.ts:6`** — Accessing `config.databaseUrl` but the Zod config property is `DATABASE_URL` (uppercase, matching env var name). `tsc` rejects this as type error TS2551. Would crash at runtime when initializing the SQLite database. Fix: change `databaseUrl` to `DATABASE_URL`.
2. **Email sending not wired into polling flow** — The spec REQUIRES email notifications when new events are detected. `ResendClient` and templates exist, but `Scheduler.checkAll()` only `console.log`s events — never calls the email client. This means the email-notifications spec is functionally not implemented.

**WARNING**:
3. **Test type errors in `src/tracking/service.test.ts:395,414`** — `detectDelivery` tests pass incomplete `TrackingRecord` objects missing `carrier`, `lastCheckedAt`, `createdAt`. `tsc` rejects these. Fix by adding the missing properties to test data.
4. **No route-level tests** — Zod form validation (tracking number length/regex, email format) has no covering test. The validation code exists in `routes/index.ts` but is untested at the HTTP layer.
5. **No test for `ResendClient`** — The email adapter (`src/email/client.ts`) has zero tests. Send failures are not tested.
6. **`sent_emails` table written but never read** — The schema includes a `sent_emails` table, and DB integration tests verify it works, but no production code writes to it (email sending isn't wired up).

**SUGGESTION**:
7. **No coverage threshold** — `vitest.config.ts` has no `coverage` configuration. Add `coverage.provider: "v8"` or `"istanbul"` with a threshold (e.g., 80%).
8. **`src/scheduler/index.ts` has batching infrastructure but the batching loop is not fully implemented** — `chunkArray()` and `sleep()` exist but the scheduler `checkAll()` calls the service directly without chunking the tracking numbers first. The chunking logic is at the scheduler level, but the actual batch dispatch to 17Track is handled inside `service.ts` → `client.ts`. The design envisions chunking at the scheduler level, but the current implementation passes all numbers at once to `getTrackInfo()`.

### Verdict

**PASS WITH WARNINGS**

The implementation has significant structural issues (email flow not wired, critical config typo blocking `tsc`) that prevent it from meeting all spec requirements. However, the core mechanic (registration, polling, event diffing, delivery detection) works correctly in tests. Recommend fixing the two CRITICAL issues and addressing warnings before archive.

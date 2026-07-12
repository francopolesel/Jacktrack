# Design: Jacktrack — Package Tracking Application

## Technical Approach

Single-process monolith: Hono HTTP server + in-process scheduler sharing a SQLite database. HTMX serves a registration form; Drizzle ORM persists trackings, events, and timestamps. A `setInterval` loop polls 17Track API for active trackings, diffs new events, and emails users via Resend. No queues, no Redis, no build step.

## Architecture Decisions

### Decision: Project Structure

| Option | Tradeoff |
|--------|----------|
| **Flat src/ by domain** (chosen) | Each domain owns its files: `tracking/`, `email/`, `scheduler/`, `routes/`, `db/`. Clear boundaries, easy to extract later. |
| src/ by layer (controllers/services/repos) | Scattered domain logic across directories. Harder to extract a domain into its own package. |

**Rationale**: Domain-first mirrors the proposal's capability boundaries. The app is small (~12 files) — flat by domain avoids premature layering while keeping extraction paths open.

### Decision: Database Schema

Four tables:

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `trackings` | id, tracking_number, carrier, email, status (active/delivered/error), last_checked_at, created_at | Single source of truth for each registration |
| `tracking_events` | id, tracking_id, event_location, event_description, event_date, translated_description, event_hash | Dedup key = (tracking_id, event_hash) — avoids duplicate event emails |
| `sent_emails` | id, tracking_id, event_ids (JSON text), sent_at | Audit log: which events were included in each email |
| `sync_log` | id, tracking_id, checked_at, success, error_message, events_found | Observability: each poll cycle produces one row per tracking |

**Rationale**: `event_hash` (SHA256 of raw event body) is the dedup mechanism — cheaper than storing 17Track's opaque `eventId` strings. `sync_log` enables debugging without log-parsing.

### Decision: 17Track API Client (Adapter Pattern)

```
ITrackingClient  ←  TrackClient (impl)
                       ↓
                  17Track REST v2.4
```

**Interface** (`tracking/client.ts`):

```typescript
interface ITrackingClient {
  register(trackingNumber: string, email?: string): Promise<RegisterResult>
  getTrackInfo(numbers: string[]): Promise<Map<string, TrackingInfo>>
}
```

**Why adapter**: The proposal flagged 17Track pricing as the top risk. An adapter lets us swap to AfterShip/TrackingMore with one `new` call in `src/index.ts` and zero changes to domain logic.

### Decision: Scheduler Design

| Aspect | Decision |
|--------|----------|
| Interval | Configurable via `POLL_INTERVAL_MS` (env, default 900000 = 15min) |
| Batch size | 40 per 17Track call (API max) |
| Rate limiting | `Promise.allSettled` on batches + 1s gap between batches via `sleep(1000)` — stays under 3 req/s API limit |
| Error isolation | A single failed tracking never blocks the rest of the batch |
| Restart safety | First poll after startup also catches up since `last_checked_at` |

**Sequence**: `setInterval` → `SELECT * FROM trackings WHERE status = 'active'` → split into chunks of 40 → for each chunk: `sleep(1000)`, call `getTrackInfo`, diff events, persist new ones, send emails, update `last_checked_at`.

### Decision: Email Templates

**Plain HTML strings** in `email/templates.ts` — NOT JSX or HTMX. Emails are sent via Resend's API as raw HTML; HTMX doesn't render in email clients. Templates will be simple template-literal functions: `welcomeEmail(trackingNumber)` and `newEventEmail(trackingNumber, events[])`.

**Rationale**: No build step, no JSX compilation needed. Email HTML is simple enough (logo + event list) that a template function is cleaner than Hono JSX for email contexts.

### Decision: HTMX Integration

| Aspect | Choice |
|--------|--------|
| Form submission | `hx-post="/track"`, `hx-target="#result"`, `hx-swap="innerHTML"` |
| Validation | Server-side only via `@hono/zod-validator`. Return `<div class="error">` HTML on failure. |
| UX pattern | One form, one response zone. No modals, no polls, no live updates. |

**Why no client-side validation**: The form has two fields with simple validation (non-empty, email format). Server-side Zod + HTML response is sufficient for MVP. Client validation can be added later with `hx-validate` if needed.

### Decision: Error Handling

| Scenario | Strategy |
|----------|----------|
| 17Track API timeout | Catch per-number, log to `sync_log` with `success=false`, skip until next cycle |
| 17Track batch partial failure | `getTrackInfo` returns per-number results; failed numbers get `error_message` in sync_log |
| Resend send failure | Log to `sync_log`, skip email for this cycle. Events remain in DB and will be re-emailed next cycle (no `sent_emails` record = not sent) |
| DB write failure | Bubble up — SQLite WAL handles concurrent writes. If write fails, the whole poll cycle catches it on retry |

**Key insight**: The polling loop is idempotent by design. A failed cycle is harmless — the next cycle picks up everything.

### Decision: Configuration

```typescript
// src/config.ts — all env vars, validated at startup
const config = {
  port: parseInt(env.PORT || "3000"),
  databaseUrl: env.DATABASE_URL || "./data/jacktrack.db",
  pollIntervalMs: parseInt(env.POLL_INTERVAL_MS || "900000"),
  trackApiKey: env.SEVENTEEN_TRACK_API_KEY,       // required
  trackApiUrl: env.SEVENTEEN_TRACK_API_URL || "https://api.17track.net/v2.4",
  resendApiKey: env.RESEND_API_KEY,                // required
  fromEmail: env.FROM_EMAIL || "tracking@jacktrack.app",
}
```

**Why env vars**: 12-factor app. Config is validated at startup via Zod schema — missing keys crash immediately, not silently.

## Data Flow

### Registration Flow

```
Browser hx-post /track
  → zValidator parses body
  → Validate tracking_number + email (Zod)
  → If invalid: return <div class="error"> (status 422)
  → INSERT trackings (status='active')
  → POST 17Track /register with translation_mode=UseThirdPartyServices, lang=en
  → If 17Track fails: DELETE tracking row, return error HTML
  → Return success <div> with tracking info
```

### Polling Flow

```
setInterval fires
  → SELECT trackings WHERE status='active'
  → Lock-free: nothing to lock, idempotent by design
  → Chunk into arrays of 40
  → For each chunk:
       sleep(1000)  ← rate limit guard
       POST 17Track /gettrackinfo (chunk)
       For each result:
         Diff returned events vs. stored events (by event_hash)
         INSERT new tracking_events
         If any new events:
           Build email HTML → POST Resend /emails
           INSERT sent_emails (with event_ids list)
         UPDATE trackings.last_checked_at
         If 17Track says delivered: UPDATE status='delivered'
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/index.ts` | Create | Entry: start Hono server + scheduler |
| `src/app.ts` | Create | Hono app factory |
| `src/config.ts` | Create | Zod-validated env config |
| `src/db/schema.ts` | Create | Drizzle schema (4 tables) |
| `src/db/index.ts` | Create | SQLite connection + WAL pragma |
| `src/tracking/client.ts` | Create | 17Track API adapter (ITrackingClient) |
| `src/tracking/service.ts` | Create | Business logic: register, check, diff events |
| `src/tracking/types.ts` | Create | Tracking types & interfaces |
| `src/scheduler/index.ts` | Create | setInterval poll loop + batching |
| `src/email/client.ts` | Create | Resend adapter |
| `src/email/templates.ts` | Create | HTML email template functions |
| `src/routes/index.ts` | Create | Hono routes (GET / + POST /track) |
| `package.json` | Create | Hono, Drizzle ORM, better-sqlite3, Resend SDK, Zod, vitest |
| `tsconfig.json` | Create | TypeScript config |
| `drizzle.config.ts` | Create | Drizzle Kit config for push/migrate |
| `data/` | Create | SQLite DB location (gitignored) |

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| **Unit** | `tracking/service.ts` — register, diff, status detection | Mock `ITrackingClient`. Vitest with Node |
| **Unit** | `scheduler/index.ts` — chunking, rate limiting, batch dispatch | Mock service layer |
| **Unit** | `email/templates.ts` — HTML output correctness | Snapshot with vitest |
| **Integration** | DB queries — Drizzle operations on SQLite | `better-sqlite3` in-memory, run DDL before each test |
| **Integration** | 17Track adapter against real API | Integration test with API key (skipped in CI) |
| **E2E** | Full form → registration flow | Optional. Playwright against local Hono server |

**Mock strategy**: `ITrackingClient` is the seam. Tests pass a mock implementation that returns controlled data. Resend client is also interface-mocked — no real emails in tests.

## Open Questions

- None — design is complete and ready for task breakdown.

## Next Step

Ready for tasks (sdd-tasks).

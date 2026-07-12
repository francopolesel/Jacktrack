# Tasks: Jacktrack — Package Tracking Application

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900+ (16 new files) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-forecast |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

**Note**: Maintainer accepted unlimited review lines. No chaining needed despite ~900+ estimated lines.

## Phase 1: Foundation

- [x] 1.1 Create `package.json` with Hono, Drizzle ORM, better-sqlite3, Resend SDK, Zod, vitest
- [x] 1.2 Create `tsconfig.json` targeting ES2022/NodeNext
- [x] 1.3 Create `drizzle.config.ts` pointing to `src/db/schema.ts`
- [x] 1.4 Create `data/` directory + `.gitignore` (exclude `data/`, `node_modules/`, `.env`)
- [x] 1.5 Create `src/config.ts` — Zod schema validating all env vars (PORT, DATABASE_URL, POLL_INTERVAL_MS, SEVENTEEN_TRACK_API_KEY, SEVENTEEN_TRACK_API_URL, RESEND_API_KEY, FROM_EMAIL)
- [x] 1.6 Create `src/db/schema.ts` — Drizzle schema: `trackings`, `tracking_events`, `sent_emails`, `sync_log` tables
- [x] 1.7 Create `src/db/index.ts` — SQLite connection with WAL pragma, export `db` instance
- [x] 1.8 Create `src/tracking/types.ts` — `ITrackingClient` interface, `TrackingInfo`, `RegisterResult`, `TrackingEvent` types

## Phase 2: Core Domain Logic

- [x] 2.1 Create `src/tracking/client.ts` — 17Track API adapter implementing `ITrackingClient` (register + getTrackInfo with batching)
- [x] 2.2 Create `src/tracking/service.ts` — `register()` validates + persists, `checkTrackings()` diffs events by hash, `detectDelivery()` updates status
- [x] 2.3 Create `src/scheduler/index.ts` — `setInterval` poll loop, chunking (40/batch), 1s gap between batches, error isolation per tracking

## Phase 3: Integration

- [x] 3.1 Create `src/email/client.ts` — Resend adapter wrapping `resend` SDK
- [x] 3.2 Create `src/email/templates.ts` — `welcomeEmail()` and `newEventEmail()` HTML template functions
- [x] 3.3 Create `src/routes/index.ts` — Hono routes: `GET /` (form), `POST /track` (zValidator + register)
- [x] 3.4 Create `src/app.ts` — Hono app factory wiring routes + error handling
- [x] 3.5 Create `src/index.ts` — entry point: start Hono server + scheduler

## Phase 4: Tests

- [x] 4.1 Unit tests for `tracking/service.ts` — mock `ITrackingClient`, test register/diff/delivery detection
- [x] 4.2 Unit tests for `scheduler/index.ts` — chunking, rate limiting, batch dispatch
- [x] 4.3 Unit tests for `email/templates.ts` — snapshot HTML output for welcome + new-event templates
- [x] 4.4 Integration tests for `db/` — in-memory SQLite, Drizzle CRUD on all 4 tables
- [x] 4.5 Integration tests for `tracking/client.ts` — real 17Track API (skipped in CI, requires API key)

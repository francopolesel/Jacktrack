# Proposal: Jacktrack — Package Tracking Application

## Intent

Automate package tracking with zero manual effort. Users submit a tracking number and email once; the system polls the 17Track API for updates and emails new events automatically until delivery.

## Scope

### In Scope
- Single-page HTMX form for tracking registration (tracking number + email)
- 17Track API client with batch polling (up to 40 numbers per call)
- SQLite persistence for registrations, events, and check timestamps
- In-process scheduler polling active trackings every N minutes
- Event translation via 17Track's built-in service
- Email notifications via Resend on new events only
- Delivery-completion detection (stop polling when delivered)

### Out of Scope
- User accounts / auth (anonymous tracking only)
- Dashboard or history page (MVP ships with registration-only)
- Push notifications or SMS (email-only for MVP)
- Multiple carriers per tracking number
- Administrative UI or analytics

## Capabilities

### New Capabilities
- `tracking-registration`: HTMX form + validation + persistence of tracking number + email
- `tracking-monitoring`: Periodic polling via 17Track API, event dedup, delivery detection
- `email-notifications`: Resend integration, sends only on new events, no duplicates
- `event-translation`: Leverages 17Track built-in translation, no separate service

### Modified Capabilities
None — greenfield project.

## Approach

Single-process monolith: Hono serves HTMX-rendered forms and REST endpoints. Drizzle ORM on SQLite (WAL mode) stores registrations, event history, and last-check timestamps. An in-process setInterval scheduler queries active (non-delivered) trackings every N minutes, batch-calls 17Track API (up to 40/call), compares results against stored events, translates via 17Track body, and emails new events via Resend. Deployable anywhere running Node.js 22+.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/` | New | Full project scaffold |
| `package.json` | New | Hono, Drizzle, 17Track SDK, Resend SDK |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| 17Track pricing changes | Low | Abstract API behind adapter interface |
| Translation quality (niche carriers) | Low | 17Track covers 2,600+ carriers; optional DeepL fallback |
| Email deliverability | Low | Resend maintained IPs + proper DNS records |
| SQLite write contention at scale | Low | WAL mode; Drizzle migrates to Postgres seamlessly |

## Rollback Plan

Revert SQLite backup (`cp data/jacktrack.db data/jacktrack.db.bak`), delete deployed build, redeploy previous version. No schema migrations to reverse — Drizzle push handles schema forward/back.

## Dependencies

- Node.js 22+
- 17Track API key
- Resend API key
- SMTP domain verification (Resend)

## Success Criteria

- [ ] User registers a tracking number + email via the HTMX form
- [ ] System polls active trackings automatically on schedule
- [ ] New events trigger email notifications via Resend
- [ ] No duplicate emails for already-seen events
- [ ] Polling stops when delivery is confirmed by 17Track
- [ ] Events returned in English via 17Track translation

# Exploration: Tech Stack Selection — jacktrack

> **Status**: Complete
> **Topic**: Full technology stack for a greenfield package tracking web application
> **Date**: 2026-07-12

---

## Executive Summary

**Hono + Drizzle + SQLite + HTMX + Resend + 17Track API** is the recommended stack.

This stack prioritizes **simplicity, zero infrastructure cost at launch, and the ability to scale up without a rewrite**. The core insight: a package tracker is fundamentally a simple CRUD app with a polling loop — it does not need Kubernetes, Redis, or a separate frontend framework. By choosing Hono (14KB, multi-runtime) with Drizzle (SQL-like, zero-overhead ORM) on SQLite, we remove the database server entirely. The frontend is server-rendered HTML with HTMX for dynamic interactions — no JS framework, no build step. Translation is handled by 17Track's built-in service, avoiding a second API dependency. Email goes through Resend (3,000 free emails/month).

The architecture is a **single-process monolith** with an in-process scheduler, deployable anywhere that runs Node.js (or Bun).

---

## Per-Area Analysis

### 1. Tracking API / Provider

#### Options Considered

| Provider | Carrier Coverage | Pricing Model | Free Tier | API Quality | Translation |
|----------|-----------------|---------------|-----------|-------------|-------------|
| **17Track** | 2,600+ carriers | Per-quota (pay per tracking number registered) | 200 free numbers (one-time, post-Jan 2026) | Excellent — v2.4 REST API, 3 req/s, webhooks | Built-in (costs 1 extra quota) |
| **AfterShip** | 1,100+ carriers | Subscription ($11-$239/mo) | 50 shipments/mo free | Excellent — mature API | Separate product |
| **TrackingMore** | 1,300+ couriers | Subscription ($0-$74/mo) | Free tier (limited features, API in Pro $74/mo) | Good — V4 API | 1-2 credits per translation |
| **Ship24** | 500+ carriers | Per-shipment ($39/mo for 1K) or per-call ($99/mo) | 10 shipments or 100 calls free | Good — REST + webhooks | Not built-in |
| **EasyPost** | Major US carriers | Usage-based | Free tier available | Good — US-focused | Not built-in |
| **Shippo** | Major US carriers | Transaction-based | Free tier | Good — US-focused | Not built-in |

#### Analysis

**17Track** is the clear winner for this use case because:
- **Carrier coverage**: 2,600+ carriers is the broadest in the market. Essential for "any carrier" requirement including China Post, Cainiao, Correo Argentino, etc.
- **Auto-detection**: Auto-detects carrier from tracking number format — user doesn't need to know who the carrier is.
- **Built-in translation**: Can request event descriptions in English at registration time. Costs 1 extra quota per number but eliminates the need for a separate translation API.
- **Pricing**: One-time 200 free tracking numbers. After that, pay per number (~$0.02-0.05 depending on volume depending on plan purchased). No recurring subscription. Since tracking is checked continuously with no additional quota cost after registration, this is extremely cost-effective.
- **Rate limits**: 3 req/s, 40 numbers per request, 400K registrations/hour — generous.

**Discarded alternatives:**
- **AfterShip**: Expensive even on Essentials ($11/mo for 100 shipments), massive price cliff to Pro ($119/mo). Overkill for a small app. Carrier coverage (1,100) is less than 17Track.
- **TrackingMore**: API access locked behind Pro plan ($74/mo). Too expensive for MVP. Carrier coverage (1,300) is decent but less than 17Track.
- **Ship24**: Decent free tier (10 shipments) but expensive at scale ($39/mo for 1K shipments). No built-in translation.
- **EasyPost/Shippo**: US-focused carriers only. No China Post, Cainiao, Correo Argentino support.

**Recommendation**: **17Track API** — broadest coverage, built-in translation, pay-per-use pricing with no recurring subscription.

---

### 2. Event Translation Strategy

#### Options Considered

| Provider | Free Tier | Paid Pricing | Accuracy for Logistics | Latency | Notes |
|----------|-----------|-------------|----------------------|---------|-------|
| **17Track Built-in** | Included with quota | 1 quota per number per language | Good — purpose-built for logistics | Instant — returned in API response | No separate API key needed |
| **DeepL API** | 500K chars/mo free | $5.49/mo + $25/million chars | Excellent — best for natural language | ~200-500ms per request | Separate API, separate cost |
| **Google Cloud Translation** | 500K chars/mo free | $20/million chars | Excellent — supports 100+ languages | ~200-500ms per request | Requires GCP project |
| **LibreTranslate** | Self-hosted (free) | Self-hosted (free) | Good — open source | Variable | Requires self-hosting infra |
| **Caching + Lazy Translation** | N/A | N/A | Depends on provider | N/A | Cache results keyed by event text hash |

#### Analysis

**17Track's built-in translation** is the most elegant solution because:
- It happens at registration time — one-time cost, not per-check.
- The translation is purpose-built for logistics terminology (carrier names, status codes, location names).
- No additional API latency — the translated description comes back in the same API response.
- Cost: 1 extra quota per tracking number per language. For an app with hundreds of numbers, this is negligible.

**Why not a separate translation API?**
- Each event check could return 1-20 new events. Translating each event individually means 1-20 API calls per check.
- For 500 packages checked every 15 minutes, that's 500 × 20 × 4 × 24 = ~960K API calls/day worst case.
- DeepL's 500K char/month free tier would be exhausted in hours.
- Google's $20/million chars would add significant cost.

**Strategy:**
1. **Primary**: Use 17Track's `translation_mode: "UseThirdPartyServices"` with `lang: "en"` at registration time. This returns all events pre-translated to English.
2. **Cache**: Store translated events in SQLite keyed by (tracking_number, event_hash). If 17Track ever returns untranslated text (edge case), we cache it and expand.
3. **Fallback**: If built-in translation quality is poor for a specific carrier, add DeepL as a batch translation layer for that carrier only. But start with 17Track alone.

**Recommendation**: **17Track built-in translation** + local event cache. No separate translation API needed at launch.

---

### 3. Frontend Framework

#### Options Considered

| Framework | Bundle Size | Build Step? | SSR? | Complexity | Best For |
|-----------|------------|-------------|------|-----------|----------|
| **HTMX + Server HTML** | ~14KB (CDN) | No | Yes (server) | Minimal | Server-rendered dynamic apps |
| **React + Vite** | 40-50KB min+gzip | Yes | Optional | Moderate | Complex SPAs |
| **Svelte / SvelteKit** | 15-20KB | Yes | Optional | Low | Lightweight interactive apps |
| **Vue + Vite** | 30-35KB | Yes | Optional | Moderate | Progressive enhancement |
| **Astro** | Minimal (islands) | Yes | Yes (static) | Low | Content-focused sites |
| **Alpine.js** | ~10KB | No | N/A | Minimal | Simple interactivity |

#### Analysis

The frontend requirements are **extremely minimal**: a logo, title, tracking number input, email input, and submit button. That's it. No dashboard, no auth, no login, no real-time updates needed on the frontend.

**HTMX** is the ideal choice because:
- **Zero build step**: Include one `<script>` tag from CDN. No webpack, no Vite, no npm install for the frontend.
- **Server-rendered HTML**: The form and response are rendered by Hono. HTMX handles form submission via AJAX and swaps the result into the DOM.
- **14KB gzipped**: Smaller than even the text of this document.
- **Progressive enhancement**: Works without JavaScript (form submission falls back to standard POST).
- **Exactly matches the need**: Form submit → API call → show confirmation or error. No state management needed.

**Discarded alternatives:**
- **React/Vue/Svelte**: Massive overkill for a single form. Add 40KB+ bundle, build step, and npm dependencies for what HTMX does with one attribute.
- **Astro**: Designed for content-focused sites. The interactivity here doesn't justify islands architecture.
- **Alpine.js**: Viable alternative, but HTMX's HTML-over-the-wire model is cleaner for "submit form → show result" than Alpine's imperative model.

**Recommendation**: **HTMX** via CDN. Form rendered with Hono's JSX or `@hono/html`. On submit, HTMX sends POST to backend, backend validates and returns success/error HTML.

---

### 4. Backend Framework

#### Options Considered

| Framework | Bundle | Runtime | TypeScript | Performance | Ecosystem |
|-----------|--------|---------|-----------|-------------|-----------|
| **Hono** | ~14KB | Node, Bun, Deno, Workers, etc. | First-class + RPC | 128K req/s (Node) | Growing, 1.2M wkly downloads |
| **Fastify** | ~50KB | Node only | First-class | 114K req/s | Mature, 7.5M wkly downloads |
| **Express** | ~200KB | Node only | Via @types | 21K req/s | Largest ecosystem |
| **FastAPI (Python)** | N/A | Python | Via Pydantic | Moderate | Good |
| **Echo (Go)** | ~2MB binary | Go native | Native | Very high | Mature |

#### Analysis

**Hono** is the standout choice for this project:

1. **TypeScript-first**: First-class types, Zod validation middleware (`@hono/zod-validator`), and end-to-end type safety with RPC.
2. **Minimal footprint**: ~14KB bundle means fast cold starts and tiny deploys.
3. **Multi-runtime**: Same code runs on Node.js, Bun, Cloudflare Workers, Deno. Start on Node.js, migrate to Workers later if scale demands.
4. **Performance**: 128K req/s on Node.js — far more than we need, but zero concerns about framework overhead.
5. **Express-like API**: Low learning curve. Route handlers look familiar.
6. **Built-in validation**: `zValidator` middleware integrates Zod seamlessly.
7. **JSX support**: Can render HTML on the server for HTMX responses without a separate template engine.

**Discarded alternatives:**
- **Fastify**: Excellent performance but Node-only. Schema-first approach adds ceremony. Larger bundle. No advantage for this app's scope.
- **Express**: Largest ecosystem but showing its age. No native TypeScript, no edge runtime support, significantly slower. Migration cost argument doesn't apply (greenfield project).
- **FastAPI (Python)**: Viable, but Python's async ecosystem for concurrent tracking checks is less mature. GIL limits true parallelism. More dependencies.
- **Echo/Chi (Go)**: Go would be excellent for this (fast, simple, single binary), but adds Go to the team's toolchain. TypeScript is already familiar.

**Recommendation**: **Hono** on Node.js (with Bun as a future optimization).

---

### 5. Database & ORM

#### Options Considered

| Database | ORM | Setup | Migration | Type Safety | Bundle | Best For |
|----------|-----|-------|-----------|-------------|--------|----------|
| **SQLite** | **Drizzle ORM** | Zero (file-based) | `drizzle-kit` | Excellent | ~35KB | Single-server, simple data |
| SQLite | Prisma | Zero (file-based) | `prisma migrate` | Excellent | ~600KB (v7) | Teams new to ORMs |
| PostgreSQL | Drizzle ORM | Requires server | `drizzle-kit` | Excellent | ~35KB | Multi-server, complex queries |
| PostgreSQL | Prisma | Requires server | `prisma migrate` | Excellent | ~600KB (v7) | Managed full-stack apps |
| PostgreSQL | SQLAlchemy (Python) | Requires server | Alembic | Good | N/A | Python ecosystems |

#### Analysis

**The data model is trivially simple**: tracking numbers, emails, events, last check time, monitoring status. No complex relationships, no high write throughput, no multi-server reads. This is a textbook SQLite use case.

**Drizzle ORM** is the clear ORM choice because:
- **Zero-overhead**: No engine binary, no codegen step. Types inferred from TypeScript schema.
- **SQL-like API**: Familiar for anyone who knows SQL. No ORM magic to debug.
- **Bundle size**: ~35KB vs Prisma's ~600KB (even after the v7 Rust→TS rewrite).
- **Edge-native**: Works on Cloudflare Workers, Bun, Deno. Future-proof.
- **Migration path to Postgres**: Change the Drizzle dialect from `sqlite` to `pg`, update the connection config, and queries stay the same. No lock-in.
- **SQLite adapter**: Works with `better-sqlite3` (Node) or `bun:sqlite` (Bun).

**Why SQLite:**
- Zero infrastructure — the database is a single file (`data.db`).
- No Docker, no Postgres container, no connection pooling.
- WAL mode gives concurrent reads during writes.
- Backup by copying one file to S3.
- For thousands of packages checked every 15 minutes, SQLite handles this easily.
- Can migrate to Postgres later if horizontal scaling is needed.

**Discarded alternatives:**
- **Prisma**: Heavier, requires codegen on schema changes, larger bundle, PRM file DSL adds a learning curve. Overshadows a simple app.
- **PostgreSQL from day one**: Premature infrastructure. SQLite handles the load and Postgres can be added later if needed.
- **GORM/SQLAlchemy**: Not TypeScript-native. More ceremony.

**Recommendation**: **SQLite** with **Drizzle ORM**.

---

### 6. Email Provider

#### Options Considered

| Provider | Free Tier | Paid | Deliverability | API Simplicity | Best For |
|----------|-----------|------|---------------|----------------|----------|
| **Resend** | 3,000 emails/mo (100/day cap) | $20/mo (50K) | Excellent | Excellent — 2 lines of code | Modern apps, simple transactional |
| SendGrid | 100 emails/day forever | $20/mo (50K) | Good | Moderate — complex API | Established apps |
| Mailgun | 5,000 emails/mo for 3 months | $35/mo (50K) | Good | Moderate | Developers, high volume |
| AWS SES | 62,000 emails/mo (from EC2) | $0.10 per 1,000 | Good | Complex — many config steps | AWS-native stacks |
| Postmark | 100 emails/mo (testing only) | $15/mo (10K) | Excellent | Excellent | Transactional-only apps |

#### Analysis

**Resend** is the pick for this project:

1. **3,000 free emails/month**: For an MVP tracking a few dozen packages, this is free forever. Each package generates maybe 2-5 email notifications (status updates) over its lifetime.
2. **Simple API**: `resend.emails.send({ from, to, subject, html })` — two lines of code. SDKs for TypeScript/Node.
3. **Great deliverability**: Shared IP pools are well-maintained. Dedicated IP available at scale ($30/mo).
4. **React Email integration**: Can build beautiful email templates with React components if needed later.

**Cost projection for jacktrack:**
- 100 active packages/month
- Each package generates ~3 email notifications
- Total: 300 emails/month
- **Free tier covers this entirely.**

**Discarded alternatives:**
- **SendGrid**: Legacy API surface, more complex setup, same free tier roughly.
- **Mailgun**: Free tier is time-limited (3 months). Unnecessarily complex.
- **AWS SES**: Requires domain verification, DKIM setup, and is the most complex to configure. Overkill for MVP.
- **Postmark**: Free tier is 100 emails total (testing only). Most expensive per-email.

**Recommendation**: **Resend**.

---

### 7. Scheduler / Job System

#### Options Considered

| Approach | Persistence | External Dep | Multi-Instance | Retries | Complexity |
|----------|------------|-------------|---------------|---------|-----------|
| **DB-polling with setInterval** | Last-check time in DB | None | Poor (race conditions) | Manual | Minimal |
| **node-cron** | None (in-memory) | None | No (duplicates) | No | Minimal |
| **BullMQ** | Redis | Redis | Yes | Yes | Moderate |
| **pg-boss** | Postgres | Postgres | Yes | Yes | Moderate |
| **Platform cron** | Platform | Platform | Yes | No | Low |

#### Analysis

For a single-process monolith with SQLite, **DB-polling with setInterval** is the right approach:

**How it works:**
1. A `tracking_numbers` table has a `last_checked_at` timestamp.
2. On startup, a module sets up `setInterval(checkAll, 15 * 60 * 1000)` — check every 15 minutes.
3. Each check: `SELECT * FROM tracking_numbers WHERE status != 'delivered'`, iterate, call 17Track API for each (batched 40 at a time), compare events, send emails for new events, update `last_checked_at`.
4. On application restart, the first check catches up on any events missed during downtime.

**Why not BullMQ:**
- BullMQ requires Redis. Redis adds infrastructure (Docker container, memory, configuration).
- Redis is excellent for distributed scheduling, but we're a single process.
- The database itself serves as the "schedule source of truth" via `last_checked_at`.
- If the process dies, we don't lose tracking state — it's all in SQLite.

**Why not node-cron:**
- Schedules are in-memory and lost on restart. The schedule itself is trivial (every 15 minutes), but we want the *last check time* to be persistent.
- DB-polling already supersedes node-cron because the state (last check time) is in the database.

**When to upgrade to BullMQ:**
- If the app scales to thousands of packages and needs multiple worker processes.
- If we need per-job retries with exponential backoff for individual tracking checks.
- If we add background jobs beyond tracking (e.g., email queues, webhook processing).

**Recommendation**: **DB-polling with setInterval** — simplest approach, zero extra dependencies, state survives restarts.

---

### 8. Architecture Pattern

#### Options Considered

| Pattern | Complexity | Scaling | Deployment | Best For |
|---------|-----------|---------|-----------|----------|
| **Single-process monolith** | Minimal | Vertical only | Single service | MVPs, simple apps |
| Monolith + background worker | Low | Vertical + separate workers | Two services | Apps with heavy background work |
| Web server + queue worker | Medium | Horizontal | Multiple services | High-scale apps |

#### Analysis

**Single-process monolith** is the right starting point:

```
┌─────────────────────────────────────┐
│          jacktrack (Node.js)         │
│                                     │
│  ┌─────────┐  ┌──────────────────┐  │
│  │ Hono    │  │  Scheduler        │  │
│  │ HTTP    │  │  (setInterval)    │  │
│  │ Server  │  │                   │  │
│  │         │  │  checkAll()       │  │
│  │ POST    │  │   every 15 min    │  │
│  │ /track  │  │                   │  │
│  └────┬────┘  └────────┬─────────┘  │
│       │                │            │
│       └────┬───────────┘            │
│            │                        │
│       ┌────▼────┐                   │
│       │ Drizzle │                   │
│       │  ORM    │                   │
│       │  +      │                   │
│       │ SQLite  │                   │
│       └─────────┘                   │
└─────────────────────────────────────┘
          │            │
          ▼            ▼
    ┌──────────┐  ┌────────┐
    │ 17Track  │  │ Resend │
    │ API      │  │  Email │
    └──────────┘  └────────┘
```

**Why not separate worker:**
- The tracking check is lightweight (API calls to 17Track, DB writes for events, email sends via Resend).
- Running in the same process avoids IPC overhead for the DB.
- If the background work becomes heavy (thousands of packages), splitting into a separate worker process is a simple refactor.

**Why not microservices:**
- One service handles everything. The codebase is small (~10-15 files).
- Deployment is one Docker container or one `node index.js` command.

**Recommendation**: **Single-process monolith** — web server + scheduler in the same Node.js process.

---

## Decision Log

| Area | Chosen Option | Discarded Alternatives | Reasoning |
|------|---------------|----------------------|-----------|
| **Tracking API** | 17Track API | AfterShip (expensive, less carriers), TrackingMore (API locked behind $74/mo), Ship24 (no translation, expensive), EasyPost/Shippo (US-only) | 2,600+ carriers, built-in translation, pay-per-use, no recurring subscription |
| **Translation** | 17Track built-in | DeepL (separate cost, added latency), Google Cloud Translation (GCP dependency, cost at scale), LibreTranslate (self-hosting overhead) | Built into 17Track at 1 extra quota per number. No separate API, no additional latency. |
| **Frontend** | HTMX + server HTML | React (overkill, build step), Svelte (overkill), Vue (overkill), Alpine.js (less clean for form→result flow) | 14KB from CDN, zero build step, server-rendered, perfect for a single form |
| **Backend** | Hono | Fastify (Node-only, more ceremony), Express (no native TS, slower, legacy), FastAPI (Python async less mature), Go (adds toolchain overhead) | 14KB, TypeScript-native, multi-runtime, Express-like API, Zod validation, JSX support |
| **Database** | SQLite | PostgreSQL (premature infrastructure), MySQL (same as Postgres) | Zero setup, single file, WAL mode, handles 50K+ reads/s, trivial backup |
| **ORM** | Drizzle ORM | Prisma (heavier, codegen required, larger bundle), SQLAlchemy (Python), raw SQL (no type safety) | SQL-like API, ~35KB bundle, zero codegen, migrates to Postgres seamlessly |
| **Email** | Resend | SendGrid (complex API), Mailgun (time-limited free tier), AWS SES (complex setup), Postmark (expensive) | 3,000 free emails/mo, 2-line API, excellent deliverability |
| **Scheduler** | DB-polling + setInterval | BullMQ (requires Redis), node-cron (no persistence), platform cron (requires external trigger) | Zero extra dependencies, last-check-time in SQLite survives restarts |
| **Architecture** | Single-process monolith | Web + background worker (premature separation), microservices (massive overkill) | Simple, single deployment, easy to split later if needed |

---

## Architecture Diagram

```
                            User's Browser
                                │
                          HTMX (CDN ~14KB)
                                │
                    ┌───────────┴───────────┐
                    │    POST /api/track    │
                    │    (tracking + email) │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Hono HTTP Server    │
                    │   (Node.js / Bun)     │
                    │                       │
                    │   Routes:             │
                    │   GET  / → form HTML  │
                    │   POST /api/track →   │
                    │     register + save   │
                    └───────┬───────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
    ┌─────────────────┐  ┌─────┐  ┌──────────┐
    │   Scheduler     │  │     │  │  Resend  │
    │  (setInterval   │  │DB   │  │  Email   │
    │   every 15 min) │  │     │  │  API     │
    │                 │  │Sqlite│  │          │
    │  checkAll():    │  │     │  │  sends   │
    │  for each active│  │WAL  │  │  event   │
    │  tracking num:  │  │mode │  │  notif.  │
    │  1. 17Track API │  │     │  │          │
    │  2. find new    │  │     │  └──────────┘
    │     events      │  │     │
    │  3. translate   │  │     │
    │  4. save events │  │     │
    │  5. send email  │  │     │
    └────────┬────────┘  └─────┘
             │
             ▼
    ┌─────────────────┐
    │   17Track API   │
    │   (REST v2.4)   │
    │                 │
    │ • Register num  │
    │ • Get tracking  │
    │ • Auto-detect   │
    │   carrier       │
    │ • Translation   │
    │   to English    │
    └─────────────────┘
```

### Data Flow: New Tracking Registration

```
User submits form
  → HTMX POST /api/track { trackingNumber, email }
  → Hono validates with Zod
  → Drizzle INSERT into tracking_numbers (status: 'active')
  → 17Track API: register tracking number with translation_mode=en
  → Drizzle INSERT event records (initial from 17Track)
  → Resend: send "You are now tracking XYZ" email
  → HTMX response: show success message
```

### Data Flow: Scheduled Check

```
Scheduler fires (every 15 min)
  → Drizzle SELECT * FROM tracking_numbers WHERE status = 'active'
  → 17Track API: gettrackinfo (up to 40 per request)
  → For each tracking number:
       Compare returned events with stored events
       Identify NEW events only
       For each new event: save to DB
       If any new events found:
         → Resend: send email with new events to user
       Update last_checked_at
  → If status == 'delivered':
       Update tracking_numbers.status = 'delivered'
       No further checks needed
```

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **17Track API changes pricing** | Medium | High — could increase costs | Abstract tracking behind an interface. Can swap to TrackingMore or AfterShip with a new adapter class. |
| **17Track translation quality poor for niche carriers** | Low | Medium — user gets confusing events | Add DeepL fallback for specific carriers. Cache translations to avoid re-translation cost. |
| **SQLite write contention at scale** | Low (thousands of packages) | Medium — delayed event processing | SQLite WAL mode handles concurrent reads well. If scale demands, migrate to Postgres (Drizzle makes this trivial). |
| **Email deliverability issues** | Medium | High — user doesn't get notifications | Use Resend's shared IP (well-maintained). Add SPF/DKIM/DMARC records. Monitor bounce rates. Add dedicated IP at $30/mo if needed. |
| **Long downtime missed tracking events** | Low | Low — 17Track stores event history | On restart, check all packages since last_checked_at. 17Track returns full event history. No events lost. |
| **Carrier auto-detection fails** | Low | Medium — wrong carrier, no updates | 17Track allows specifying carrier code manually. Store carrier code in DB on registration. Add admin override endpoint. |
| **Single process dies** | Low | High — no checks until restart | Simple PM2 or Docker restart policy. Use process manager with auto-restart. The DB-polling means no events lost. |

---

## Ready for Proposal

**Yes**. This exploration provides a clear, well-researched tech stack recommendation. The proposal should cover:

1. **Project setup**: Initialize Hono + Drizzle + SQLite project structure
2. **Database schema**: Tables for tracking_numbers, tracking_events, email_logs
3. **17Track integration**: API client module with registration, tracking check, translation
4. **Scheduler**: DB-polling implementation with configurable interval
5. **Email integration**: Resend client for notification emails
6. **Frontend**: Single form page with HTMX
7. **Deployment**: Dockerfile and deployment instructions

The proposal should be straightforward — this is a well-understood CRUD + polling app with clear boundaries.

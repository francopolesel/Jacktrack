# JackTrack

> Minimal package tracking with automatic email notifications.

Submit a tracking number and email — JackTrack monitors it via the 17Track API and sends you an email every time there's a new movement. No dashboard, no login, no clutter.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐
│   Browser   │◄───►│  Hono HTTP   │────►│  SQLite   │
│   (HTMX)    │     │   Server     │     │ (Drizzle) │
└─────────────┘     └──────┬───────┘     └───────────┘
                           │
                    ┌──────▼───────┐     ┌───────────┐
                    │  Scheduler   │────►│  17Track  │
                    │ (setInterval)│     │    API    │
                    └──────┬───────┘     └───────────┘
                           │
                    ┌──────▼───────┐
                    │   Resend     │
                    │   (Email)    │
                    └──────────────┘
```

Single-process monolith. In-process scheduler polls 17Track in batches (up to 40 per request), diffs events by SHA256 hash, and sends email only for new events.

## Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 22+ |
| Backend | [Hono](https://hono.dev/) |
| Frontend | [HTMX](https://htmx.org/) + server HTML |
| Database | SQLite via [Drizzle ORM](https://orm.drizzle.team/) |
| Tracking | [17Track API](https://www.17track.net/en) (2,600+ carriers) |
| Email | [Resend](https://resend.com/) |
| Testing | [Vitest](https://vitest.dev/) |

## Prerequisites

- **Node.js 22+**
- **17Track API key** — [get one here](https://user.17track.net/)
- **Resend API key** — [get one here](https://resend.com/) (3,000 free emails/month)
- A verified domain for email sending (Resend requires domain verification)

## Quick Start

```bash
# Clone and install
git clone https://github.com/francopolesel/Jacktrack.git
cd Jacktrack
npm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Initialize database
npx drizzle-kit push

# Run tests
npm test

# Start development server
npm run dev
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SEVENTEEN_TRACK_API_KEY` | ✅ | — | 17Track API key |
| `RESEND_API_KEY` | ✅ | — | Resend API key |
| `PORT` | ❌ | `3000` | HTTP server port |
| `DATABASE_URL` | ❌ | `./data/jacktrack.db` | SQLite database path |
| `POLL_INTERVAL_MS` | ❌ | `900000` | Polling interval (15 min) |
| `SEVENTEEN_TRACK_API_URL` | ❌ | `https://api.17track.net/v2.4` | 17Track API base URL |
| `FROM_EMAIL` | ❌ | `tracking@jacktrack.app` | Sender email address |

## Usage

1. Open `http://localhost:3000`
2. Enter a tracking number and your email
3. JackTrack starts monitoring automatically
4. You'll receive an email for every new tracking event

## API

### `POST /track`

Register a tracking number for monitoring.

```json
{
  "tracking_number": "EB861106979CN",
  "email": "user@example.com"
}
```

**Response** (success):
```json
{
  "status": "registered",
  "tracking_number": "EB861106979CN",
  "carrier": "China Post"
}
```

**Response** (validation error):
```json
{
  "error": "Invalid tracking number format"
}
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm start` | Start production server |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run build` | TypeScript compile |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:push` | Push schema to database |

## Project Structure

```
src/
├── index.ts              # Entry point
├── app.ts                # Hono app factory
├── config.ts             # Zod environment validation
├── db/
│   ├── schema.ts         # Drizzle schema (4 tables)
│   └── index.ts          # SQLite connection
├── tracking/
│   ├── types.ts          # Interfaces & types
│   ├── client.ts         # 17Track API adapter
│   └── service.ts        # Business logic
├── scheduler/
│   └── index.ts          # Polling loop
├── email/
│   ├── client.ts         # Resend adapter
│   └── templates.ts      # HTML email templates
├── routes/
│   └── index.ts          # HTTP routes
└── __tests__/
    └── db.integration.test.ts
```

## Design Decisions

- **17Track API over scraping**: 2,600+ carriers with built-in translation — no separate translation API needed.
- **SQLite over PostgreSQL**: Zero infrastructure for MVP. Swappable via Drizzle dialect change.
- **HTMX over React/Vue**: No build step, 14KB from CDN, perfect for a single-form UI.
- **In-process scheduler over Redis/Bull**: No extra infrastructure. State lives in SQLite, survives restarts.
- **SHA256 event dedup**: Cheap, deterministic, no vendor lock-in.

## SDD Documentation

This project was built using Specification-Driven Development. Full artifact trail:

| Artifact | Location |
|----------|----------|
| Tech Stack Exploration | `openspec/specs/exploration-tech-stack.md` |
| Proposal | `openspec/changes/initial-proposal/proposal.md` |
| Specs | `openspec/changes/initial-proposal/specs/` |
| Design | `openspec/changes/initial-proposal/design.md` |
| Tasks | `openspec/changes/initial-proposal/tasks.md` |
| Verify Report | `openspec/changes/initial-proposal/verify-report.md` |

## License

MIT

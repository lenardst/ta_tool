# CLAUDE.md

## Project overview

TA Tool is a monorepo teaching assistant app. The backend is an Express API with sql.js (WASM SQLite). The frontend is Vite + React + TypeScript. Both run concurrently in development.

## Key commands

```bash
# From repo root — start both servers
npm run dev

# Backend only
cd backend && node server.js

# Frontend only
cd frontend && npm run dev

# Frontend production build
cd frontend && npm run build

# Type-check frontend
cd frontend && npx tsc --noEmit
```

## Architecture

```
ta_tool/
├── backend/
│   ├── server.js          # Express entry point; initializes DB and mounts all routes
│   ├── db.js              # sql.js wrapper exposing a better-sqlite3-compatible API
│   ├── middleware/auth.js # JWT verification middleware
│   ├── routes/            # One file per resource (auth, classes, sessions, attendance, etc.)
│   ├── services/
│   │   ├── backup.js      # Cron-based backup scheduler; keeps last 14 backups
│   │   └── llm.js         # Stanford/OpenAI API calls for session extraction and group generation
│   └── utils/ownsClass.js # Authorization helper — checks class membership
└── frontend/
    ├── src/
    │   ├── App.tsx         # Router setup with private routes
    │   ├── api/client.ts   # Centralized API client — all fetch calls live here
    │   ├── context/
    │   │   ├── AuthContext.tsx  # JWT storage and current user state
    │   │   └── ClassContext.tsx # Active class selection (persisted in localStorage)
    │   ├── pages/          # One component per route
    │   └── components/     # Shared UI components (Layout, RatingPicker)
    └── vite.config.ts      # Dev proxy: /api → localhost:3001
```

## Database

The database is `backend/ta_tool.db`, created on first run. Schema is initialized in `backend/server.js` (the `initDb()` call at startup).

**Core tables:**
- `users` — instructor accounts; `is_admin` flag for admin access
- `classes` — Canvas courses; soft-deleted via `deleted_at`
- `class_members` — many-to-many instructors ↔ classes with `role` (admin/member)
- `students` — synced from Canvas; soft-deleted via `deleted_at`
- `sessions` — up to 10 per class, each with `date`, `label`, `notes`
- `attendance` — per student per session: present / late / absent / excused
- `participation` — interruption count, contribution rating (1–5), free-text note
- `assignments` — inline assignment definitions with `max_points`
- `grades` — student scores per assignment
- `settings` — per-user Canvas credentials and SMTP config (stored as key/value rows)
- `email_history` — audit log of sent emails

**Important:** `db.js` wraps sql.js to provide a synchronous API matching better-sqlite3. Always use `db.prepare(...).run(...)` / `.get(...)` / `.all(...)` — not promises or callbacks. After every write, `db.js` persists the DB to disk.

## API routes

All routes except `/api/auth/*` require a valid JWT (`Authorization: Bearer <token>`).

| Prefix | File | Notes |
|--------|------|-------|
| `/api/auth` | `routes/auth.js` | Register, login |
| `/api/admin` | `routes/admin.js` | User management, class membership — admin only |
| `/api/canvas` | `routes/canvas.js` | Proxy to Canvas LMS API |
| `/api/classes` | `routes/classes.js` | CRUD + student sync |
| `/api/sessions` | `routes/sessions.js` | Session CRUD |
| `/api/attendance` | `routes/attendance.js` | Upsert attendance records |
| `/api/participation` | `routes/participation.js` | Contributions, ratings, interruptions |
| `/api/assignments` | `routes/assignments.js` | Assignment CRUD |
| `/api/grades` | `routes/grades.js` | Grade entry |
| `/api/groups` | `routes/groups.js` | LLM-based group generation |
| `/api/email` | `routes/email.js` | Send emails via SMTP |
| `/api/llm` | `routes/llm.js` | LLM chat endpoint |
| `/api/settings` | `routes/settings.js` | Per-user Canvas + SMTP settings |

## Authorization pattern

Use `ownsClass(userId, classId)` from `utils/ownsClass.js` to verify that a user is a member of a class before allowing any read or write. Most route handlers call this near the top.

## Frontend data fetching

All API calls go through `frontend/src/api/client.ts`. TanStack Query (`useQuery` / `useMutation`) is used for all server state. Invalidate the relevant query key after mutations to keep the UI in sync.

## Environment / config

No `.env` file is required for local development. The backend reads settings (Canvas credentials, SMTP, LLM API key) from the `settings` table at runtime, not from environment variables.

For production (Railway), set any required env vars via the Railway dashboard.

## Common gotchas

- **sql.js vs better-sqlite3:** The README previously referenced better-sqlite3, but the project uses sql.js. The `db.js` wrapper makes the API identical, so route code looks the same.
- **DB persistence:** `db.js` writes to disk after every mutating operation. If you add new write queries, this happens automatically — no extra step needed.
- **Frontend proxy:** In dev, Vite proxies `/api/*` to `localhost:3001`. In production, Express serves `frontend/dist` and handles all routes itself.
- **Sessions cap:** The data model supports up to 10 sessions per class. This is enforced in the UI but not at the DB level.
- **Soft deletes:** Classes and students use `deleted_at` for soft deletion. Always filter `WHERE deleted_at IS NULL` when querying active records.

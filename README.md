# TA Tool

A teaching assistant management application for Canvas-based classes. Track attendance, participation contributions, interruptions, and assignment grades across up to 10 sessions per class.

## Tech stack

- **Frontend** — Vite + React 18 + TypeScript + Tailwind CSS v4 + TanStack Query + React Router v6
- **Backend** — Node.js + Express + sql.js (WASM-based SQLite with file persistence)
- **Auth** — JWT + bcryptjs
- **Integrations** — Canvas LMS API, SMTP/Nodemailer, OpenAI-compatible LLM API

## Quick start

```bash
# 1. Install all dependencies (from repo root)
npm install
cd backend && npm install
cd ../frontend && npm install

# 2. Start both servers concurrently (from repo root)
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

The SQLite database (`backend/ta_tool.db`) is created automatically on first run.

## First-time setup

1. Register an account at `/login`, then open **Settings** in the sidebar.
2. Enter your **Canvas Base URL** (e.g. `https://canvas.university.edu`) and **Access Token**.
   - Generate a token in Canvas → Account → Settings → New Access Token.
3. Click **Fetch my Canvas courses**, then **Import** on each course you want to manage.
   - Students are synced from Canvas automatically on import.
   - Re-sync at any time from the Settings page.
4. Go to **Sessions Setup** to configure up to 10 session dates/labels.

## Features

| Page | What you can do |
|------|----------------|
| **Dashboard** | See all students: attendance %, contribution rating, interruptions, grade %. Export to CSV. |
| **Session** | Per-session view. Cycle attendance (present / late / absent / excused), +/− interruption counter, 1–5 star rating, free-text note per student. |
| **Grades** | Spreadsheet-style table. Add/rename/delete assignments inline. Click any cell to enter a grade. Shows per-student total and %. Export to CSV. |
| **Groups** | LLM-generated group assignments with custom roles. Email groups to students directly. |
| **Settings** | Canvas credentials, course import & student sync, SMTP configuration. |
| **Admin** | (Admin users only) Manage user accounts, class membership, and database backups. |

## Multi-user support

Multiple instructors can share access to the same class. The first user to import a class is its owner; admins can add other users as members via the Admin panel.

## Data storage & backups

All data lives in `backend/ta_tool.db` (SQLite). No cloud backend required.

Automatic daily backups are created by a cron job and stored locally. The last 14 backups are kept. Admins can trigger a manual backup or restore a previous one from the Admin panel.

## Deployment

A `railway.toml` is included for one-click deployment on [Railway](https://railway.app).

```bash
# Build the frontend before deploying
cd frontend && npm run build
```

The backend serves the compiled frontend from `frontend/dist` in production.

# TA Tool

A teaching assistant tool for Canvas-based classes. Track attendance, contributions, interruptions, and assignment grades across 10 sessions per class.

## Tech stack

- **Frontend** — Vite + React 18 + TypeScript + Tailwind CSS v4 + TanStack Query + React Router v6
- **Backend** — Node.js + Express + better-sqlite3 (local SQLite file)

## Quick start

```bash
# 1. Install all dependencies
cd ta_tool
npm install              # installs concurrently at root
cd backend && npm install  # builds better-sqlite3 (requires Xcode CLI tools)
cd ../frontend && npm install

# 2. Start both servers with one command (from the repo root)
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## First-time setup

1. Open **Settings** in the sidebar.
2. Enter your **Canvas Base URL** (e.g. `https://canvas.university.edu`) and your **Access Token**.
   - Generate a token in Canvas → Account → Settings → New Access Token.
3. Click **Fetch my Canvas courses**, then click **Import** on each course you want to manage.
   - Students are synced from Canvas automatically on import.
   - You can re-sync at any time from the Settings page.

## Features

| Page | What you can do |
|------|----------------|
| **Dashboard** | See all students at once: attendance %, contribution rating, interruptions, and grade bar. Export to CSV. |
| **Session** | Select one of 10 sessions. Per student: cycle attendance status (present / late / absent / excused), +/- interruption counter, star rating (1–5), free-text note. |
| **Grades** | Spreadsheet-style table. Add/rename/delete assignments inline. Click any cell to enter a grade. Shows per-student total and %. Export to CSV. |
| **Settings** | Manage Canvas credentials, import courses, sync students. |

## Data storage

All data lives in `backend/ta_tool.db` (SQLite). No cloud, no server — fully local.

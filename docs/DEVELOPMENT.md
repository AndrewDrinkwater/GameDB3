# Development Guide

This is the day-one guide for running the project locally.

## Requirements

- Node.js 20+
- PostgreSQL (or use Docker)

## Quick Start

1. Start Postgres:
   - `docker compose up -d`
2. Install dependencies:
   - `npm run install:all`
3. Run migrations and seed:
   - `npm --prefix backend run db:migrate`
   - `npm --prefix backend run db:seed`
4. Start dev servers:
   - `npm run dev`

Frontend runs on `http://localhost:5173` and backend on `http://localhost:4000`.

## Environment Variables

Backend uses `backend/.env`:
- `PORT`
- `DATABASE_URL`
- `DATABASE_URL_TEST` (required for backend tests)

## Common Commands

Root:
- `npm run dev` - start backend + frontend
- `npm test` - run backend and frontend tests
- `npm run lint` - run ESLint

Backend (`backend/`):
- `npm run dev`
- `npm run build`
- `npm run test`
- `npm run db:migrate`
- `npm run db:seed`

Frontend (`frontend/`):
- `npm run dev`
- `npm run build`
- `npm run test`

## First Change Checklist

- Understand the route or view you are editing.
- Keep behavior unchanged unless explicitly required.
- Add or update tests when behavior changes.

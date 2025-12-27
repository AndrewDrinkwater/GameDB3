# TTRPG Database

Full-stack TTRPG world, campaign, and entity management app with a Node/Express + Prisma backend and a React (Vite) frontend.

## What’s Included
- Auth with JWT-like tokens and role-based access (admin, architect, GM, player).
- World/campaign/character CRUD with context-aware filtering.
- Entity types, fields, and dynamic entity records.
- List views with saved column layouts and AND/OR filter logic.
- Related lists (e.g., campaign characters).
- Form designer with conditional visibility rules.

## Requirements
- Node.js 20+
- PostgreSQL (or use the included Docker setup)

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

Frontend runs on `http://localhost:5173`, backend on `http://localhost:4000`.

## Configuration
Backend env: `backend/.env`
- `PORT`
- `DATABASE_URL`
- `DATABASE_URL_TEST` (test database, required for backend Jest runs)

## Access Control
- Authentication required for all API routes except `/health` and auth endpoints.
- System admin (Role.ADMIN or a system role with `system.manage`) can manage system config (users, roles/controls, properties, choices, views, related lists, dictionary, user prefs) and entity type list defaults.
- System views and related lists respect `adminOnly`; non-admins only see `adminOnly = false` entries.
- Worlds: read/list access for admins and users assigned as primary architect, world architect, world GM, world campaign creator, or world character creator. Only admins/architects can update worlds or manage world role assignments; only admins can change the primary architect.
- Campaigns: read/list access for admins, campaign GMs, campaign creators, world architects, and roster players. Create allowed for admins and world architects/GMs (GM must belong to the world). Update/delete/roster changes allowed for admins, campaign GMs, or world architects.
- Characters: read/list access for admins, the player, world architects, and campaign GMs. Create allowed for admins or world/campaign character creators (campaign GMs can create in their campaigns). Update/delete allowed for admins, world architects, or the player (admins can change `playerId`).
- Entity types/fields/choices: templates are admin-only. World entity types/fields are managed by admins and world architects; non-admins can only read templates unless they are architects of the world.
- Entities: create allowed per world `entityPermissionScope` (architects always; optional GMs/players). Read requires world access plus entity access grants (global/campaign/character); architects can read all entities in a world unless a character context is enforced. Write requires entity WRITE access in the current context (or admin). Entity access updates are restricted to admins, world architects, and world GMs.
- Notes: readable to users who can read the entity. Admins/architects/world GMs see all notes for the requested context. Others see shared notes for the campaign context plus their own notes; campaign GMs see private notes in their campaign. Shared notes require a campaign context. Players can author notes only with a campaign + their own character; note tags are limited to accessible entities.

## Scripts
Root:
- `npm run dev` - starts backend + frontend
- `npm run install:all` - install both packages
- `npm test` - run backend and frontend tests

Backend (`backend/`):
- `npm run dev` - start API with ts-node-dev
- `npm run build` - compile TypeScript
- `npm run start` - run compiled server
- `npm run db:generate` - Prisma client
- `npm run db:migrate` - Prisma migrations
- `npm run db:studio` - Prisma Studio
- `npm run db:seed` - seed data
- `npm run test` - Jest API tests

Frontend (`frontend/`):
- `npm run dev` - Vite dev server
- `npm run build` - production build
- `npm run preview` - preview production build
- `npm run test` - Jest + Testing Library

## Tests
Backend tests cover auth, permissions, related lists, list view preferences, and entity filtering.
Frontend tests cover context selection, related lists, list filtering, and condition builder behaviors.

Backend tests require a separate database. Set `DATABASE_URL_TEST` to a different database name,
run migrations against it, then run `npm run test`.

## Notes
- List view preferences are stored per user and view; entity-type defaults are admin-configurable.
- Conditional visibility uses a nested AND/OR rule builder.

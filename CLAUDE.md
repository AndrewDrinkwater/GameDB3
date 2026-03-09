# CLAUDE.md — AI Assistant Guide for GameDB3

This file provides context for AI assistants working in this repository. Read it before making changes.

---

## Project Overview

**GameDB3** is a full-stack TTRPG (tabletop RPG) management application for world-building, campaign tracking, entity/location management, and collaborative note-taking.

- **Backend**: Express + Prisma + PostgreSQL on port 4000
- **Frontend**: React + Vite SPA on port 5173 (proxies `/api` → 4000)
- **Storage**: MinIO (local) or AWS S3 for images
- **Language**: TypeScript (strict mode) throughout

---

## Repository Structure

```
GameDB3/
├── backend/          # Express API server
│   ├── src/
│   │   ├── routes/       # HTTP handlers (22 files — thin layer only)
│   │   ├── services/     # Business logic + Prisma access (10 files)
│   │   ├── middlewares/  # Auth & permission gates
│   │   ├── lib/          # Shared helpers (permissions, imageStorage, prismaClient)
│   │   ├── types/        # DTOs and shared TypeScript types
│   │   ├── controllers/  # API controllers
│   │   └── __tests__/    # Jest tests (api.test.ts + setup.ts)
│   ├── prisma/
│   │   ├── schema.prisma # Full schema (80+ models, 1300+ lines)
│   │   ├── migrations/   # 35+ migration files
│   │   ├── seed.ts       # Primary seed script
│   │   ├── seed_example.ts
│   │   └── seed_packs.ts
│   ├── scripts/          # Utility scripts
│   ├── ARCHITECTURE.md   # Backend architecture guide
│   ├── jest.config.cjs
│   ├── tsconfig.json     # target: ES2020, module: CommonJS
│   └── package.json
│
├── frontend/         # React + Vite SPA
│   ├── src/
│   │   ├── App.tsx       # Routes only — no logic
│   │   ├── router.tsx    # HashRouter setup
│   │   ├── views/        # Route-aware orchestrators (5 major views)
│   │   ├── components/   # Presentational UI (39+ components)
│   │   │   └── ui/       # Reusable states: LoadingState, ErrorState, EmptyState
│   │   ├── hooks/        # useApi, useAuth, useForm (~90KB), useList (~30KB)
│   │   ├── utils/        # Helper functions
│   │   └── __tests__/    # Jest + React Testing Library
│   ├── ARCHITECTURE.md   # Frontend architecture guide
│   ├── jest.config.cjs
│   ├── tsconfig.json     # target: ES2020, module: ESNext
│   ├── vite.config.ts    # port 5173, proxy /api → 4000
│   └── package.json
│
├── docs/
│   ├── CONVENTIONS.md    # Naming, file structure, imports, anti-patterns
│   ├── DEVELOPMENT.md    # Day-one setup guide
│   └── GOVERNANCE.md     # Architectural change and refactoring guidelines
│
├── ACCESS_CASES.md       # 50 documented access-control test cases
├── docker-compose.yml    # PostgreSQL 16 (port 5434) + MinIO
├── package.json          # Root workspace (scripts only)
├── .eslintrc.json
└── .prettierrc
```

---

## Development Setup

### Requirements
- Node.js 20+
- Docker (for PostgreSQL and MinIO)

### First-time Setup
```bash
docker compose up -d                           # Start PostgreSQL + MinIO
npm run install:all                            # Install all deps
npm --prefix backend run db:migrate            # Run migrations
npm --prefix backend run db:seed               # Seed data
npm run dev                                    # Start both servers
```

### Environment Variables
Create `backend/.env`:
```
PORT=4000
DATABASE_URL="postgresql://ttrpg:ttrpg@localhost:5434/ttrpg?schema=public"
DATABASE_URL_TEST="postgresql://ttrpg:ttrpg@localhost:5434/ttrpg_test?schema=public"
```
Docker defaults: user=`ttrpg`, password=`ttrpg`, MinIO=`minioadmin`/`minioadmin`.

---

## Key Scripts

| Location | Command | Purpose |
|---|---|---|
| Root | `npm run dev` | Start backend + frontend concurrently |
| Root | `npm test` | Run all tests |
| Root | `npm run lint` | ESLint check |
| Root | `npm run lint:fix` | ESLint auto-fix |
| Backend | `npm run db:migrate` | Apply Prisma migrations |
| Backend | `npm run db:generate` | Regenerate Prisma client |
| Backend | `npm run db:studio` | Open Prisma Studio GUI |
| Backend | `npm run db:seed` | Seed database |
| Backend | `npm run db:seed:packs` | Seed pack templates |

---

## Architecture Rules

### Backend: Thin Routes → Services → Prisma

**Routes** (`src/routes/`): Parse request only. Call service. Translate errors to HTTP responses. No Prisma queries, no business logic.

**Middleware** (`src/middlewares/`): Enforce auth and permission gates. No data reads or side effects.

**Services** (`src/services/`): All business logic and Prisma access. Do not return HTTP responses.

**Lib** (`src/lib/`): Shared utilities — permission helpers, Prisma singleton, image storage.

**Key services**:
- `entityService.ts` — Entity CRUD with access control
- `locationService.ts` — Location CRUD with hierarchy rules
- `filterService.ts` — AND/OR filter logic for entity lists
- `validationService.ts` — Data validation
- `imageService.ts` — S3/MinIO upload + Sharp image processing
- `serviceError.ts` — Custom error class used across services

### Frontend: Views Orchestrate, Components Render, Hooks Own State

**App.tsx**: Route declarations only.

**Views** (`src/views/`): Read route params, select components for the screen. No API calls.

**Components** (`src/components/`): Render UI, call callbacks. No data fetching or side effects.

**Hooks** (`src/hooks/`): Manage state, effects, and API calls. No JSX.

**Key patterns**:
- Lists: `ListView` component + `useList` hook
- Forms: `FormView` component + `useForm` hook
- All API calls go through `useApi`
- Auth state in `useAuth`

---

## Naming Conventions

| Type | Convention | Example |
|---|---|---|
| React components | PascalCase | `EntityListView.tsx` |
| Hooks | `useX` prefix | `useForm.tsx`, `useApi.ts` |
| Services | `<domain>Service.ts` | `worldService.ts` |
| Middleware | `requireX` or `withX` | `requireAuth` |
| DB tables | Plural, camelCase fields | `entityTypes`, `locationFields` |

---

## Permission Model

The app has a layered access-control system:

- **ADMIN**: Full system access
- **Architect**: World creator/owner — manages entity types, location types, relationships
- **GM**: Campaign game master — sees GM-scoped notes, runs sessions
- **Player**: Accesses campaign through a character

**Scopes** (used in `EntityAccess`, `LocationAccess`, `Relationship`):
- `GLOBAL` — visible to all world members
- `CAMPAIGN` — visible within a campaign
- `CHARACTER` — visible to character owner only

**Note visibility**: `PRIVATE` | `SHARED` | `GM`

Permission helpers live in `backend/src/lib/permissions.ts`. Always use these helpers — never add ad-hoc permission checks in route handlers.

---

## Database Schema Summary

80+ Prisma models across these domains:

| Domain | Key Models |
|---|---|
| Auth | `User`, `RefreshToken`, `SystemRole`, `SystemControl` |
| Worlds | `World`, `Campaign`, `Character`, `Session` |
| Entities | `EntityType`, `EntityField`, `Entity`, `EntityFieldValue`, `EntityAccess` |
| Locations | `LocationType`, `LocationTypeField`, `Location`, `LocationFieldValue` |
| Relationships | `RelationshipType`, `RelationshipTypeRule`, `Relationship` |
| Notes | `Note`, `NoteTag`, `NoteShare`, `SessionNote`, `SessionNoteReference` |
| Images | `ImageAsset`, `ImageVariant`, `RecordImage` |
| Templates | `Pack`, `EntityTypeTemplate`, `LocationTypeTemplate` |
| Choices | `ChoiceList`, `ChoiceOption` |
| System | `SystemProperty`, `SystemView`, `SystemViewField`, `SystemAudit` |

**Key enums**: `Role`, `PropertyValueType`, `EntityFieldType`, `WorldEntityPermissionScope`, `NoteVisibility`, `EntityAccessScope`, `ImageVariantType`, `PackPosture`

---

## Testing

### Backend
- Framework: Jest + ts-jest + Supertest
- Environment: `node`
- Location: `backend/src/__tests__/api.test.ts`
- Config: `backend/jest.config.cjs`
- Requires `DATABASE_URL_TEST` pointing to a separate `ttrpg_test` database
- 50 access-control test cases documented in `ACCESS_CASES.md`

### Frontend
- Framework: Jest + React Testing Library
- Environment: `jsdom`
- Location: `frontend/src/__tests__/`
- Config: `frontend/jest.config.cjs`

### Running Tests
```bash
npm test                               # Run all tests
npm --prefix backend run test          # Backend only
npm --prefix frontend run test         # Frontend only
```

Tests must be deterministic. Add or update tests when behavior changes.

---

## Code Quality

- **TypeScript**: `strict: true` in both packages — no `any` without justification
- **Prettier**: 80-char width, 2-space indent, single quotes, semicolons
- **ESLint**: Extends `@typescript-eslint/recommended`, `react/recommended`, `prettier`
- Run `npm run lint` before merging when practical

---

## Anti-Patterns to Avoid

- Business logic in routes or views
- Data fetching inside UI components (use hooks)
- Direct Prisma queries in route handlers (use services)
- Ad-hoc permission checks in routes (use middleware + lib helpers)
- Cross-package imports (keep backend and frontend isolated)
- Inline styles that duplicate existing CSS classes
- Skipping loading/error/empty states in UI

---

## How to Add a New Feature

### Backend: New Domain
1. Add `src/services/<domain>Service.ts` — business logic
2. Add `src/routes/<domain>.ts` — thin HTTP handlers calling the service
3. Wire up permission middleware
4. Add types in `src/types/` if shared across layers
5. Create migration: `npm --prefix backend run db:migrate`
6. Add tests in `src/__tests__/`

### Frontend: New List
1. Create view in `src/views/` that reads route params
2. Use `ListView` component with the correct view key/props
3. Keep fetching and filter logic in `useList`

### Frontend: New Form
1. Create view in `src/views/` that reads route params
2. Use `FormView` with the correct view key and context
3. Keep state and side effects in `useForm`

---

## Infrastructure

### Docker Compose Services
| Service | Ports | Credentials |
|---|---|---|
| PostgreSQL 16 | 5434→5432 | ttrpg / ttrpg |
| MinIO | 9000 (API), 9001 (console) | minioadmin / minioadmin |

MinIO initialises a `ttrpg-images` bucket with public read access on startup.

### Image Storage
Images are processed by Sharp (resizing, focal point) and stored as variants (`THUMB`, `SMALL`, `MEDIUM`, `LARGE`) in S3/MinIO via `imageService.ts` and `lib/imageStorage.ts`.

---

## Further Reading

- `backend/ARCHITECTURE.md` — detailed backend layer responsibilities
- `frontend/ARCHITECTURE.md` — detailed frontend layer responsibilities
- `docs/CONVENTIONS.md` — naming, imports, error handling, accessibility
- `docs/DEVELOPMENT.md` — quick-start and common commands
- `docs/GOVERNANCE.md` — when and how to propose architectural changes
- `ACCESS_CASES.md` — 50 documented access-control test cases

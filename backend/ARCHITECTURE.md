# Backend Architecture

This backend uses an Express + Prisma + TypeScript layout with thin HTTP routes
and centralized business logic.

## Structure

- `src/routes`: HTTP handlers only. Parse input, call services, return responses.
- `src/middlewares`: auth and permission gates. No business logic.
- `src/services`: business logic and Prisma access.
- `src/lib`: shared helpers (permissions, utilities).
- `src/types`: shared DTOs and type definitions.
- `src/__tests__`: unit and API tests.

## Responsibilities

Routes
- Do: read params/body, call service, translate errors to HTTP responses.
- Do not: query Prisma directly, re-implement permissions, or embed business rules.

Middleware
- Do: enforce auth and access rules.
- Do not: perform data reads or write side effects.

Services
- Do: enforce domain rules, compose validation/filtering, and call Prisma.
- Do not: send HTTP responses.

Validation and Filtering
- Validation logic lives in `services/validationService`.
- Filtering logic lives in `services/filterService`.

Permissions
- Use middleware in `middlewares/permissions`.
- Shared permission helpers live in `lib/permissions`.

## How to Add a New Domain

1. Add service file in `src/services/<domain>Service.ts`.
2. Add route file in `src/routes/<domain>.ts` that calls the service.
3. Add permission checks via middleware.
4. Add types in `src/types` when shared across layers.
5. Add focused tests in `src/__tests__`.

## How to Add a New Endpoint

1. Add a route handler that does input parsing only.
2. Add or extend a service method for the new behavior.
3. Use existing permission helpers and middleware.
4. Preserve response shapes and status codes.
5. Add targeted tests for the new path.

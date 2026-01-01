# Conventions

These conventions keep the codebase predictable and safe to change.

## Naming

- React components: `PascalCase` (e.g. `EntityListView.tsx`).
- Hooks: `useX` prefix (e.g. `useForm.tsx`).
- Services: `<domain>Service.ts`.
- Middlewares: `requireX` or `withX`.

## File Structure

- Backend routes in `backend/src/routes`.
- Backend services in `backend/src/services`.
- Frontend views in `frontend/src/views`.
- Frontend components in `frontend/src/components`.
- Frontend hooks in `frontend/src/hooks`.

## Imports

- Use relative imports within a package.
- Do not add cross-package imports outside `backend/` or `frontend/`.
- Keep import lists minimal and ordered by local path.

## Error Handling

- Backend routes translate domain errors to HTTP responses.
- Services should not return HTTP responses.
- Preserve existing status codes and error messages.

## Quality Gates

- TypeScript is `strict: true` in both backend and frontend.
- Run `npm run lint` before merging changes when practical.
- Tests should be deterministic and scoped to the change.

## Accessibility

- Use semantic elements (`button`, `label`, `input`) whenever possible.
- Provide labels for inputs.
- Use `role="alert"` for error summaries.

## Anti-Patterns

- Business logic in routes or views.
- Data fetching inside UI components.
- Ad-hoc permission checks in route handlers.
- Inline styles that duplicate existing classes.

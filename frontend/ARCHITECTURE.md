# Frontend Architecture

This frontend uses React + Vite with a view-driven structure and hook-owned
state. Components render UI; hooks own logic and side effects.

## Structure

- `src/App.tsx`: routing only.
- `src/views`: route-aware orchestration (params, navigation, component choice).
- `src/components`: presentational UI and composition.
- `src/hooks`: data fetching, state, and side effects.
- `src/components/ui`: small, reusable UI states (Loading/Error/Empty).

## Responsibilities

App
- Do: declare routes.
- Do not: contain view selection logic or data fetching.

Views
- Do: read route params and select components for a screen.
- Do not: contain business logic or API calls.

Components
- Do: render UI and call callbacks passed from hooks/views.
- Do not: fetch data or own side effects.

Hooks
- Do: manage state, effects, and API calls.
- Do not: render JSX.

## List / Form Patterns

Lists
- `ListView` renders list UI.
- `useList` owns fetching, filters, and loading state.

Forms
- `FormView` renders form UI.
- `useForm` owns loading, saving, validation state, and submissions.

## Accessibility and UX Principles

- Always render explicit loading, error, and empty states.
- Use semantic controls (`button`, `label`, `input`) and ARIA only when needed.
- Keep keyboard navigation intact and focus visible.

## Add a New List

1. Create a view in `src/views` that reads route params.
2. Use `ListView` and pass the view key/props.
3. Keep logic in `useList` or existing hooks.

## Add a New Form

1. Create a view in `src/views` that reads route params.
2. Use `FormView` with the correct view key and context.
3. Keep state and side effects in `useForm`.

# Hooks

## Purpose
Host reusable React hooks that encapsulate shared stateful logic and side effects outside of the main component tree.

## What Belongs Here
- Data-fetching hooks, navigation helpers, and context-aware responders
- Guarded effects (e.g., unsaved-change handling) that can be reused by multiple components
- Composition helpers for syncing URL hash state or localStorage preferences

## What Must Not Live Here
- Presentational JSX or layout markup
- Middleware-like concerns that should remain on the server
- One-off logic tightly coupled to a single component (those stay inline until refactored)

## How This Will Be Used Later
Future phases will extract repeatable logic from `App.tsx` into these hooks so the shell stays declarative and smaller components can reuse consistent behavior.

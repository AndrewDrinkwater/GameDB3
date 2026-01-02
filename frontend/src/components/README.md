# Components

## Purpose
Group presentational React components and layout pieces that can be composed to build screens.

## What Belongs Here
- Reusable UI fragments such as buttons, panels, lists, and context-aware providers
- Presentational components that receive props to keep App.tsx slimmer
- Shared layout shells or contextual wrappers referenced from top-level views

## Shared UI Library
Reusable primitives live under `frontend/src/components/ui`.
Current components include:
- `SelectableCardGrid`
- `ClickableTypeCard`
- `InlineSummaryBar`
- `CustomTypeCreateCard`
- `HierarchyBuilder`
- `ContainmentRulesPanel`
- `RelationshipSelectorCard`
- `InlineAdvancedEditorFrame`

## What Must Not Live Here
- Massive single-file pages that could be split into smaller pieces when the app scales
- Routing or application state logic that belongs in hooks or higher-level containers
- Non-UI utilities that should be kept under `utils` or future helper folders

## How This Will Be Used Later
Subsequent phases will move parts of `App.tsx` into dedicated components so that views can be tested independently and composed from smaller units.

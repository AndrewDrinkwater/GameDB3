# Governance

This project uses lightweight governance to keep scope controlled and changes
reviewable.

## Making Architectural Changes

- Propose the change in a brief, scoped document or PR description.
- State the problem, the constraints, and the smallest acceptable solution.
- Prefer incremental steps over large refactors.

## When Refactors Are Warranted

- There is measurable duplication or repeated defects.
- The change reduces long-term risk without altering behavior.
- The work is scoped to a single domain or layer.

## Decision Discipline

- If behavior equivalence cannot be proven, stop and reassess.
- If a change touches more than one layer, pause and split the work.
- Avoid “while we’re here” edits.

## Quality Gates

- Lint before merging when possible.
- Keep tests relevant and deterministic.
- Document any intentional deviations from conventions.

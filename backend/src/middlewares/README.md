# Middlewares

## Purpose
Host Express middleware for cross-cutting concerns such as auth, permissions, diagnostics, and shared guards.

## What Belongs Here
- Authentication, authorization, and permissions gatekeepers
- Request logging, tracing, or correlation middleware
- Error handling or response enrichment shared across handlers

## What Must Not Live Here
- Business logic that belongs to services
- Component-level UI state or internal routing decisions
- Direct response generation for happy-path requests

## Future Use
Later phases will route auth, permissions, and instrumentation middleware into this folder so that controllers can stay focused on happy-path flow.

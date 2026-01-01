# Services

## Purpose
Encapsulate reusable business logic, orchestration, and Prisma access while remaining agnostic to HTTP details.

## What Belongs Here
- Service classes/functions that coordinate persistence, calculations, and domain rules
- Prisma client usage and transactional boundaries
- Shared utility helpers that orchestrate multi-step workflows invoked from controllers

## What Must Not Live Here
- Express request/response handling or routing concerns
- UI-specific state management or view rendering logic
- Middleware/interceptor logic for authentication or diagnostics

## Future Use
Later phases will move the domain-heavy code from current routes into this directory to keep HTTP layers thin and make services testable in isolation.

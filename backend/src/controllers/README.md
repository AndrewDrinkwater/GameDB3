# Controllers

## Purpose
Surface HTTP routes and translate Express inputs/outputs into internal calls without embedding business behavior.

## What Belongs Here
- Minimal route handlers that call services and format responses
- Request validation wiring, parameter parsing, and response shaping
- Error translation (HTTP codes + messages) and logging hooks tied to handlers

## What Must Not Live Here
- Business logic or persistence details (those belong to services)
- Direct Prisma calls, heavy computations, or stateful coordination
- Detailed UI/session management concerns

## Future Use
Later phases will move existing route handlers into this folder so controllers stay focused on HTTP translation and delegate work to services.

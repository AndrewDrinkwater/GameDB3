# Types

## Purpose
Store shared TypeScript interfaces, DTOs, and domain contracts referenced by services, controllers, and middleware.

## What Belongs Here
- API payload shapes, view models, and validation-friendly DTO definitions
- Domain interfaces that describe user roles, context, or resource metadata
- Common enums, helper types, and augmentation of third-party types

## What Must Not Live Here
- Request handling or persistence logic
- Large utility modules that do not describe shape contracts
- Anything tied to a single route, component, or middleware implementation

## Future Use
Later phases will place shared contracts and DTOs here so that controllers and services stay typed consistently without circular dependencies.

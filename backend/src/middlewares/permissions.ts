import express from "express";
import type { Prisma } from "@prisma/client";
import {
  AuthRequest,
  buildEntityAccessFilter,
  prisma
} from "../lib/helpers";
import {
  canAccessWorld,
  isAdmin,
  isWorldArchitect,
  isWorldGameMaster,
  isWorldPlayer
} from "../lib/permissions";

export { requireAuth } from "../lib/helpers";

type ValueResolver = (req: express.Request) => string | undefined | Promise<string | undefined>;

type PermissionLocals = {
  worldId?: string;
  entity?: { id: string; worldId: string };
  entityAccessFilter?: Prisma.EntityWhereInput;
};

type WorldRole = "ADMIN" | "ARCHITECT" | "GM" | "PLAYER";
type AuthUser = NonNullable<AuthRequest["user"]>;

const resolveValue = async (req: express.Request, resolver?: ValueResolver) => {
  if (!resolver) return undefined;
  return resolver(req);
};

const resolveWorldId = async (
  req: express.Request,
  res: express.Response,
  source?: ValueResolver
): Promise<string | undefined> => {
  if (source) {
    return source(req);
  }
  const locals = res.locals as PermissionLocals;
  return locals.worldId;
};

const worldRoleCheckers: Record<
  WorldRole,
  (user: AuthUser, worldId: string) => Promise<boolean> | boolean
> = {
  ADMIN: (user) => isAdmin(user),
  ARCHITECT: (user, worldId) => isWorldArchitect(user.id, worldId),
  GM: (user, worldId) => isWorldGameMaster(user.id, worldId),
  PLAYER: (user, worldId) => isWorldPlayer(user.id, worldId)
};

const requireWorldAccess = (
  source?: ValueResolver,
  options?: { missingWorldMessage?: string }
) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const currentUser = user as AuthUser;

    const worldId = await resolveWorldId(req, res, source);
    if (!worldId) {
      res.status(400).json({
        error: options?.missingWorldMessage ?? "World ID is required."
      });
      return;
    }

    const locals = res.locals as PermissionLocals;
    if (isAdmin(user) || (await canAccessWorld(user.id, worldId))) {
      locals.worldId = worldId;
      next();
      return;
    }

    res.status(403).json({ error: "Forbidden." });
  };
};

const requireWorldRole = (
  roles: WorldRole | WorldRole[],
  source?: ValueResolver,
  options?: { missingWorldMessage?: string }
) => {
  const requiredRoles = Array.isArray(roles) ? roles : [roles];
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const currentUser = user as AuthUser;

    const worldId = await resolveWorldId(req, res, source);
    if (!worldId) {
      res.status(400).json({
        error: options?.missingWorldMessage ?? "World ID is required."
      });
      return;
    }

    let hasRole = false;
    for (const role of requiredRoles) {
      const checker = worldRoleCheckers[role];
      if (await checker(currentUser, worldId)) {
        hasRole = true;
        break;
      }
    }

    if (!hasRole) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const locals = res.locals as PermissionLocals;
    locals.worldId = worldId;
    next();
  };
};

const requireEntityAccess = (
  entityIdSource: ValueResolver,
  options?: {
    campaignId?: ValueResolver;
    characterId?: ValueResolver;
    notFoundMessage?: string;
  }
) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const entityId = await resolveValue(req, entityIdSource);
    if (!entityId) {
      res.status(404).json({ error: options?.notFoundMessage ?? "Entity not found." });
      return;
    }

    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { id: true, worldId: true }
    });
    if (!entity) {
      res.status(404).json({ error: options?.notFoundMessage ?? "Entity not found." });
      return;
    }

    const campaignId = await resolveValue(req, options?.campaignId);
    const characterId = await resolveValue(req, options?.characterId);
    const accessFilter = await buildEntityAccessFilter(
      user,
      entity.worldId,
      campaignId,
      characterId
    );
    const access = await prisma.entity.findFirst({
      where: { id: entityId, ...accessFilter },
      select: { id: true }
    });
    if (!access) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const locals = res.locals as PermissionLocals;
    locals.entity = entity;
    locals.worldId = entity.worldId;
    locals.entityAccessFilter = accessFilter;
    next();
  };
};

export { requireWorldAccess, requireWorldRole, requireEntityAccess };

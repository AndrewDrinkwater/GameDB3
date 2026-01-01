import express from "express";
import { randomUUID } from "crypto";
import {
  EntityAccessScope,
  Prisma,
  RelationshipStatus,
  User
} from "@prisma/client";
import {
  prisma,
  requireAuth,
  isAdmin,
  canAccessWorld,
  isWorldArchitect,
  isWorldGameMaster,
  isWorldGm,
  buildEntityAccessFilter
} from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";

const canManageRelationships = async (user: User, worldId: string) => {
  if (isAdmin(user)) return true;
  if (await isWorldArchitect(user.id, worldId)) return true;
  if (await isWorldGameMaster(user.id, worldId)) return true;
  if (await isWorldGm(user.id, worldId)) return true;
  return false;
};

const normalizeVisibilityScope = (value: unknown): EntityAccessScope | null => {
  if (!value) return null;
  if (Object.values(EntityAccessScope).includes(value as EntityAccessScope)) {
    return value as EntityAccessScope;
  }
  return null;
};

const validateVisibility = async (
  worldId: string,
  scope: EntityAccessScope,
  refId?: string | null
) => {
  if (scope === EntityAccessScope.GLOBAL) {
    return { visibilityScope: scope, visibilityRefId: null as string | null, error: null };
  }

  if (!refId) {
    return {
      visibilityScope: scope,
      visibilityRefId: null as string | null,
      error: "visibilityRefId is required for this visibility scope."
    };
  }

  if (scope === EntityAccessScope.CAMPAIGN) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: refId },
      select: { worldId: true }
    });
    if (!campaign || campaign.worldId !== worldId) {
      return {
        visibilityScope: scope,
        visibilityRefId: refId,
        error: "Campaign must belong to the same world."
      };
    }
  }

  if (scope === EntityAccessScope.CHARACTER) {
    const character = await prisma.character.findUnique({
      where: { id: refId },
      select: { worldId: true }
    });
    if (!character || character.worldId !== worldId) {
      return {
        visibilityScope: scope,
        visibilityRefId: refId,
        error: "Character must belong to the same world."
      };
    }
  }

  return { visibilityScope: scope, visibilityRefId: refId, error: null };
};

const parseMetadata = (value: unknown) => {
  if (value === undefined) return { metadata: undefined, error: null as string | null };
  if (value === null) return { metadata: Prisma.DbNull, error: null };
  if (typeof value === "string") {
    if (!value.trim()) return { metadata: undefined, error: null };
    try {
      const parsed = JSON.parse(value) as Prisma.InputJsonValue | null;
      if (parsed === null) {
        return { metadata: Prisma.DbNull, error: null };
      }
      return { metadata: parsed, error: null };
    } catch {
      return { metadata: undefined, error: "Metadata must be valid JSON." };
    }
  }
  return { metadata: value as Prisma.InputJsonValue, error: null };
};

const normalizeIdArray = (value: unknown) => {
  if (!value) return [] as string[];
  const raw = Array.isArray(value) ? value : [value];
  const ids = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
};

export const registerRelationshipsRoutes = (app: express.Express) => {
  app.get("/api/relationship-types", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;

    if (!isAdmin(user) && worldId && !(await canAccessWorld(user.id, worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    if (!isAdmin(user) && !worldId) {
      res.json([]);
      return;
    }

    const types = await prisma.relationshipType.findMany({
      where: worldId ? { worldId } : {},
      orderBy: { name: "asc" }
    });

    res.json(types);
  });

  app.post("/api/relationship-types", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const {
      worldId,
      name,
      description,
      fromLabel,
      toLabel,
      pastFromLabel,
      pastToLabel,
      isPeerable,
      metadata
    } = req.body as {
      worldId?: string;
      name?: string;
      description?: string;
      fromLabel?: string;
      toLabel?: string;
      pastFromLabel?: string | null;
      pastToLabel?: string | null;
      isPeerable?: boolean;
      metadata?: Prisma.InputJsonValue;
    };

    if (!worldId || !name || !fromLabel || !toLabel) {
      res.status(400).json({ error: "worldId, name, fromLabel, and toLabel are required." });
      return;
    }

    if (!(await canManageRelationships(user, worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const world = await prisma.world.findUnique({ where: { id: worldId }, select: { id: true } });
    if (!world) {
      res.status(400).json({ error: "World not found." });
      return;
    }

    const parsedMetadata = parseMetadata(metadata);
    if (parsedMetadata.error) {
      res.status(400).json({ error: parsedMetadata.error });
      return;
    }

    const created = await prisma.relationshipType.create({
      data: {
        worldId,
        name,
        description,
        fromLabel,
        toLabel,
        pastFromLabel,
        pastToLabel,
        isPeerable: Boolean(isPeerable),
        metadata:
          parsedMetadata.metadata === undefined ? undefined : parsedMetadata.metadata
      }
    });

    res.status(201).json(created);
  });

  app.get("/api/relationship-types/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const relationshipType = await prisma.relationshipType.findUnique({
      where: { id }
    });
    if (!relationshipType) {
      res.status(404).json({ error: "Relationship type not found." });
      return;
    }

    if (!isAdmin(user) && !(await canAccessWorld(user.id, relationshipType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    res.json(relationshipType);
  });

  app.put("/api/relationship-types/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.relationshipType.findUnique({
      where: { id },
      select: { worldId: true }
    });
    if (!existing) {
      res.status(404).json({ error: "Relationship type not found." });
      return;
    }

    if (!(await canManageRelationships(user, existing.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const {
      name,
      description,
      fromLabel,
      toLabel,
      pastFromLabel,
      pastToLabel,
      isPeerable,
      metadata
    } = req.body as {
      name?: string;
      description?: string;
      fromLabel?: string;
      toLabel?: string;
      pastFromLabel?: string | null;
      pastToLabel?: string | null;
      isPeerable?: boolean;
      metadata?: Prisma.InputJsonValue;
    };

    const parsedMetadata = parseMetadata(metadata);
    if (parsedMetadata.error) {
      res.status(400).json({ error: parsedMetadata.error });
      return;
    }

    const updated = await prisma.relationshipType.update({
      where: { id },
      data: {
        name,
        description,
        fromLabel,
        toLabel,
        pastFromLabel,
        pastToLabel,
        isPeerable,
        metadata:
          parsedMetadata.metadata === undefined ? undefined : parsedMetadata.metadata
      }
    });

    res.json(updated);
  });

  app.delete("/api/relationship-types/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.relationshipType.findUnique({
      where: { id },
      select: { worldId: true }
    });
    if (!existing) {
      res.status(404).json({ error: "Relationship type not found." });
      return;
    }

    if (!(await canManageRelationships(user, existing.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const relationshipCount = await prisma.relationship.count({
      where: { relationshipTypeId: id }
    });
    if (relationshipCount > 0) {
      res.status(400).json({ error: "Relationship type is in use." });
      return;
    }

    const ruleCount = await prisma.relationshipTypeRule.count({
      where: { relationshipTypeId: id }
    });
    if (ruleCount > 0) {
      res.status(400).json({ error: "Relationship type has rules." });
      return;
    }

    await prisma.relationshipType.delete({ where: { id } });
    res.json({ ok: true });
  });

  app.get("/api/relationship-type-rules", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    const relationshipTypeId =
      typeof req.query.relationshipTypeId === "string" ? req.query.relationshipTypeId : undefined;

    if (relationshipTypeId) {
      const relationshipType = await prisma.relationshipType.findUnique({
        where: { id: relationshipTypeId },
        select: {
          id: true,
          name: true,
          fromLabel: true,
          toLabel: true,
          worldId: true
        }
      });
      if (!relationshipType) {
        res.status(404).json({ error: "Relationship type not found." });
        return;
      }

      if (!(await canManageRelationships(user, relationshipType.worldId))) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }

      const rules = await prisma.relationshipTypeRule.findMany({
        where: { relationshipTypeId },
        orderBy: { createdAt: "desc" },
        include: {
          fromEntityType: { select: { id: true, name: true } },
          toEntityType: { select: { id: true, name: true } }
        }
      });

      res.json({ relationshipType, rules });
      return;
    }

    if (!worldId) {
      if (isAdmin(user)) {
        const rules = await prisma.relationshipTypeRule.findMany({
          orderBy: { createdAt: "desc" }
        });
        res.json(rules);
        return;
      }
      res.json([]);
      return;
    }

    if (!(await canManageRelationships(user, worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const rules = await prisma.relationshipTypeRule.findMany({
      where: { relationshipType: { worldId } },
      orderBy: { createdAt: "desc" }
    });
    res.json(rules);
  });

  app.get("/api/relationship-type-rules/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const rule = await prisma.relationshipTypeRule.findUnique({
      where: { id },
      include: { relationshipType: { select: { worldId: true } } }
    });
    if (!rule) {
      res.status(404).json({ error: "Relationship type rule not found." });
      return;
    }

    if (!(await canManageRelationships(user, rule.relationshipType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const { relationshipType, ...payload } = rule;
    res.json(payload);
  });

  app.post("/api/relationship-type-rules", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { relationshipTypeId, fromEntityTypeId, toEntityTypeId } = req.body as {
      relationshipTypeId?: string;
      fromEntityTypeId?: string | string[];
      toEntityTypeId?: string | string[];
    };

    const fromTypeIds = normalizeIdArray(fromEntityTypeId);
    const toTypeIds = normalizeIdArray(toEntityTypeId);

    if (!relationshipTypeId || fromTypeIds.length === 0 || toTypeIds.length === 0) {
      res.status(400).json({
        error: "relationshipTypeId, fromEntityTypeId, and toEntityTypeId are required."
      });
      return;
    }

    const [relationshipType, fromTypes, toTypes] = await Promise.all([
      prisma.relationshipType.findUnique({
        where: { id: relationshipTypeId },
        select: { worldId: true }
      }),
      prisma.entityType.findMany({
        where: { id: { in: fromTypeIds } },
        select: { id: true, worldId: true, isTemplate: true }
      }),
      prisma.entityType.findMany({
        where: { id: { in: toTypeIds } },
        select: { id: true, worldId: true, isTemplate: true }
      })
    ]);

    if (!relationshipType) {
      res.status(404).json({ error: "Relationship type not found." });
      return;
    }
    if (fromTypes.length !== fromTypeIds.length || toTypes.length !== toTypeIds.length) {
      res.status(404).json({ error: "Entity type not found." });
      return;
    }
    if (fromTypes.some((type) => type.isTemplate) || toTypes.some((type) => type.isTemplate)) {
      res.status(400).json({ error: "Rules can only target world entity types." });
      return;
    }
    const worldId = relationshipType.worldId;
    if (
      fromTypes.some((type) => !type.worldId || type.worldId !== worldId) ||
      toTypes.some((type) => !type.worldId || type.worldId !== worldId)
    ) {
      res.status(400).json({ error: "Entity types must belong to the same world as the relationship type." });
      return;
    }

    if (!(await canManageRelationships(user, worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    try {
      const existingRules = await prisma.relationshipTypeRule.findMany({
        where: {
          relationshipTypeId,
          fromEntityTypeId: { in: fromTypeIds },
          toEntityTypeId: { in: toTypeIds }
        },
        select: { fromEntityTypeId: true, toEntityTypeId: true }
      });
      const existingPairs = new Set(
        existingRules.map((rule) => `${rule.fromEntityTypeId}:${rule.toEntityTypeId}`)
      );

      const createPayloads = fromTypeIds.flatMap((fromId) =>
        toTypeIds
          .filter((toId) => !existingPairs.has(`${fromId}:${toId}`))
          .map((toId) => ({
            relationshipTypeId,
            fromEntityTypeId: fromId,
            toEntityTypeId: toId
          }))
      );

      if (createPayloads.length === 0) {
        res.status(409).json({ error: "Rule already exists for this type pair." });
        return;
      }

      const created = await prisma.$transaction(
        createPayloads.map((payload) =>
          prisma.relationshipTypeRule.create({
            data: payload
          })
        )
      );

      res.status(201).json({
        id: created[0]?.id,
        createdCount: created.length,
        skippedCount: fromTypeIds.length * toTypeIds.length - created.length,
        created
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({ error: "Rule already exists for this type pair." });
        return;
      }
      throw error;
    }
  });

  app.put("/api/relationship-type-rules/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.relationshipTypeRule.findUnique({
      where: { id },
      include: { relationshipType: { select: { worldId: true } } }
    });
    if (!existing) {
      res.status(404).json({ error: "Relationship type rule not found." });
      return;
    }

    const { relationshipTypeId, fromEntityTypeId, toEntityTypeId } = req.body as {
      relationshipTypeId?: string;
      fromEntityTypeId?: string | string[];
      toEntityTypeId?: string | string[];
    };

    const nextRelationshipTypeId = relationshipTypeId ?? existing.relationshipTypeId;
    const fromTypeIds = Array.isArray(fromEntityTypeId)
      ? normalizeIdArray(fromEntityTypeId)
      : normalizeIdArray(fromEntityTypeId ?? existing.fromEntityTypeId);
    const toTypeIds = Array.isArray(toEntityTypeId)
      ? normalizeIdArray(toEntityTypeId)
      : normalizeIdArray(toEntityTypeId ?? existing.toEntityTypeId);

    if (fromTypeIds.length === 0 || toTypeIds.length === 0) {
      res.status(400).json({ error: "fromEntityTypeId and toEntityTypeId are required." });
      return;
    }

    const [relationshipType, fromTypes, toTypes] = await Promise.all([
      prisma.relationshipType.findUnique({
        where: { id: nextRelationshipTypeId },
        select: { worldId: true }
      }),
      prisma.entityType.findMany({
        where: { id: { in: fromTypeIds } },
        select: { id: true, worldId: true, isTemplate: true }
      }),
      prisma.entityType.findMany({
        where: { id: { in: toTypeIds } },
        select: { id: true, worldId: true, isTemplate: true }
      })
    ]);

    if (!relationshipType) {
      res.status(404).json({ error: "Relationship type not found." });
      return;
    }
    if (fromTypes.length !== fromTypeIds.length || toTypes.length !== toTypeIds.length) {
      res.status(404).json({ error: "Entity type not found." });
      return;
    }
    if (fromTypes.some((type) => type.isTemplate) || toTypes.some((type) => type.isTemplate)) {
      res.status(400).json({ error: "Rules can only target world entity types." });
      return;
    }
    if (
      fromTypes.some((type) => !type.worldId || type.worldId !== relationshipType.worldId) ||
      toTypes.some((type) => !type.worldId || type.worldId !== relationshipType.worldId)
    ) {
      res.status(400).json({ error: "Entity types must belong to the same world as the relationship type." });
      return;
    }

    if (!(await canManageRelationships(user, relationshipType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const usingMultiple =
      Array.isArray(fromEntityTypeId) ||
      Array.isArray(toEntityTypeId) ||
      fromTypeIds.length > 1 ||
      toTypeIds.length > 1;

    if (usingMultiple) {
      const pairMap = new Map<string, { fromEntityTypeId: string; toEntityTypeId: string }>();
      fromTypeIds.forEach((fromId) => {
        toTypeIds.forEach((toId) => {
          const key = `${fromId}:${toId}`;
          if (!pairMap.has(key)) {
            pairMap.set(key, { fromEntityTypeId: fromId, toEntityTypeId: toId });
          }
        });
      });
      const uniquePairs = Array.from(pairMap.values());

      const existingRules = await prisma.relationshipTypeRule.findMany({
        where: {
          relationshipTypeId: nextRelationshipTypeId,
          fromEntityTypeId: { in: fromTypeIds },
          toEntityTypeId: { in: toTypeIds }
        },
        select: { id: true, fromEntityTypeId: true, toEntityTypeId: true }
      });

      const takenByOthers = new Set(
        existingRules
          .filter((rule) => rule.id !== id)
          .map((rule) => `${rule.fromEntityTypeId}:${rule.toEntityTypeId}`)
      );

      const primaryPair = uniquePairs.find(
        (pair) => !takenByOthers.has(`${pair.fromEntityTypeId}:${pair.toEntityTypeId}`)
      );

      if (!primaryPair) {
        res.status(409).json({
          error: "All selected pairs already exist. Remove duplicates or delete this rule."
        });
        return;
      }

      const primaryKey = `${primaryPair.fromEntityTypeId}:${primaryPair.toEntityTypeId}`;
      const createPayloads = uniquePairs
        .filter((pair) => {
          const key = `${pair.fromEntityTypeId}:${pair.toEntityTypeId}`;
          if (key === primaryKey) return false;
          if (takenByOthers.has(key)) return false;
          return true;
        })
        .map((pair) => ({
          relationshipTypeId: nextRelationshipTypeId,
          fromEntityTypeId: pair.fromEntityTypeId,
          toEntityTypeId: pair.toEntityTypeId
        }));

      const result = await prisma.$transaction(async (tx) => {
        await tx.relationshipTypeRule.update({
          where: { id },
          data: {
            relationshipTypeId: nextRelationshipTypeId,
            fromEntityTypeId: primaryPair.fromEntityTypeId,
            toEntityTypeId: primaryPair.toEntityTypeId
          }
        });
        if (createPayloads.length > 0) {
          return tx.relationshipTypeRule.createMany({
            data: createPayloads,
            skipDuplicates: true
          });
        }
        return { count: 0 };
      });

      res.json({
        ok: true,
        updatedId: id,
        createdCount: result.count,
        skippedCount: uniquePairs.length - 1 - result.count
      });
      return;
    }

    try {
      const rule = await prisma.relationshipTypeRule.update({
        where: { id },
        data: {
          relationshipTypeId: nextRelationshipTypeId,
          fromEntityTypeId: fromTypeIds[0],
          toEntityTypeId: toTypeIds[0]
        }
      });
      res.json(rule);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({ error: "Rule already exists for this type pair." });
        return;
      }
      throw error;
    }
  });

  app.delete("/api/relationship-type-rules/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.relationshipTypeRule.findUnique({
      where: { id },
      include: { relationshipType: { select: { worldId: true } } }
    });
    if (!existing) {
      res.status(404).json({ error: "Relationship type rule not found." });
      return;
    }

    if (!(await canManageRelationships(user, existing.relationshipType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    await prisma.relationshipTypeRule.delete({ where: { id } });
    res.json({ ok: true });
  });

  app.get("/api/entities/:id/relationships", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
    const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
    const relationshipTypeId =
      typeof req.query.relationshipTypeId === "string" ? req.query.relationshipTypeId : undefined;
    const visibilityScopeParam =
      typeof req.query.visibilityScope === "string" ? req.query.visibilityScope : undefined;

    const entity = await prisma.entity.findUnique({
      where: { id },
      select: { id: true, worldId: true }
    });
    if (!entity) {
      res.status(404).json({ error: "Entity not found." });
      return;
    }

    const accessFilter = isAdmin(user)
      ? { worldId: entity.worldId }
      : await buildEntityAccessFilter(user, entity.worldId, campaignId, characterId);
    const canRead = await prisma.entity.findFirst({
      where: { id, ...accessFilter },
      select: { id: true }
    });
    if (!canRead) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    let statusFilter: Prisma.RelationshipWhereInput = { status: RelationshipStatus.ACTIVE };
    if (statusParam) {
      const normalized = statusParam.toLowerCase();
      if (normalized === "all") {
        statusFilter = {};
      } else if (normalized === "expired") {
        statusFilter = { status: RelationshipStatus.EXPIRED };
      } else if (normalized === "active") {
        statusFilter = { status: RelationshipStatus.ACTIVE };
      } else {
        res.status(400).json({ error: "Invalid status filter." });
        return;
      }
    }

    const canBypassVisibility = await canManageRelationships(user, entity.worldId);
    const visibilityFilters: Prisma.RelationshipWhereInput[] = [
      { visibilityScope: EntityAccessScope.GLOBAL }
    ];
    if (campaignId) {
      visibilityFilters.push({
        visibilityScope: EntityAccessScope.CAMPAIGN,
        visibilityRefId: campaignId
      });
    }
    if (characterId) {
      visibilityFilters.push({
        visibilityScope: EntityAccessScope.CHARACTER,
        visibilityRefId: characterId
      });
    }

    const relationshipFilters: Prisma.RelationshipWhereInput[] = [
      { OR: [{ fromEntityId: id }, { toEntityId: id }] }
    ];
    if (!canBypassVisibility) {
      relationshipFilters.push({ OR: visibilityFilters });
    }
    if (relationshipTypeId) {
      relationshipFilters.push({ relationshipTypeId });
    }

    let visibilityScopeFilter: EntityAccessScope | null = null;
    if (visibilityScopeParam) {
      const normalizedScope = normalizeVisibilityScope(visibilityScopeParam);
      if (!normalizedScope) {
        res.status(400).json({ error: "Invalid visibility scope filter." });
        return;
      }
      visibilityScopeFilter = normalizedScope;
      relationshipFilters.push({ visibilityScope: visibilityScopeFilter });
    }

    const relationships = await prisma.relationship.findMany({
      where: {
        worldId: entity.worldId,
        ...statusFilter,
        AND: relationshipFilters,
        fromEntity: accessFilter,
        toEntity: accessFilter
      },
      include: {
        relationshipType: {
          select: {
            id: true,
            name: true,
            fromLabel: true,
            toLabel: true,
            pastFromLabel: true,
            pastToLabel: true,
            isPeerable: true
          }
        },
        fromEntity: { select: { id: true, name: true, entityTypeId: true } },
        toEntity: { select: { id: true, name: true, entityTypeId: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    const peerBuckets = new Map<string, typeof relationships>();
    const groupedRelationships: typeof relationships = [];

    relationships.forEach((relationship) => {
      if (relationship.peerGroupId) {
        const bucket = peerBuckets.get(relationship.peerGroupId) ?? [];
        bucket.push(relationship);
        peerBuckets.set(relationship.peerGroupId, bucket);
        return;
      }
      groupedRelationships.push(relationship);
    });

    peerBuckets.forEach((bucket, peerGroupId) => {
      const preferred = bucket.find((rel) => rel.fromEntityId === id) ?? bucket[0];
      if (!preferred) return;
      groupedRelationships.push({
        ...preferred,
        peerGroupId
      });
    });

    const grouped = groupedRelationships.map((raw) => {
      const relationship = raw as typeof relationships[number];
      const isExpired = relationship.status === RelationshipStatus.EXPIRED;
      const fromLabel =
        isExpired && relationship.relationshipType.pastFromLabel
          ? relationship.relationshipType.pastFromLabel
          : relationship.relationshipType.fromLabel;
      const toLabel =
        isExpired && relationship.relationshipType.pastToLabel
          ? relationship.relationshipType.pastToLabel
          : relationship.relationshipType.toLabel;
      const isOutgoing = relationship.fromEntityId === id;
      const otherEntity = isOutgoing ? relationship.toEntity : relationship.fromEntity;
      const isPeer = Boolean(relationship.peerGroupId);
      const direction = isPeer ? "peer" : isOutgoing ? "outgoing" : "incoming";
      const label = isPeer ? fromLabel : isOutgoing ? fromLabel : toLabel;

      return {
        id: relationship.peerGroupId ?? relationship.id,
        relationshipId: relationship.id,
        relationshipTypeId: relationship.relationshipTypeId,
        relationshipTypeName: relationship.relationshipType.name,
        label,
        direction,
        status: relationship.status,
        visibilityScope: relationship.visibilityScope,
        visibilityRefId: relationship.visibilityRefId,
        isPeer,
        createdAt: relationship.createdAt,
        expiredAt: relationship.expiredAt,
        relatedEntityId: otherEntity.id,
        relatedEntityName: otherEntity.name,
        relatedEntityTypeId: otherEntity.entityTypeId
      };
    });

    const directionRank = (direction: string) => {
      if (direction === "peer") return 0;
      if (direction === "outgoing") return 1;
      return 2;
    };
    grouped.sort((a, b) => {
      const statusRankA = a.status === RelationshipStatus.ACTIVE ? 0 : 1;
      const statusRankB = b.status === RelationshipStatus.ACTIVE ? 0 : 1;
      if (statusRankA !== statusRankB) return statusRankA - statusRankB;
      const peerRankA = a.isPeer ? 0 : 1;
      const peerRankB = b.isPeer ? 0 : 1;
      if (peerRankA !== peerRankB) return peerRankA - peerRankB;
      const directionOrder = directionRank(a.direction) - directionRank(b.direction);
      if (directionOrder !== 0) return directionOrder;
      const typeCompare = a.relationshipTypeName.localeCompare(b.relationshipTypeName);
      if (typeCompare !== 0) return typeCompare;
      return a.relatedEntityName.localeCompare(b.relatedEntityName);
    });

    res.json({
      canManage: canBypassVisibility,
      relationships: grouped
    });
  });

  app.post("/api/relationships", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const {
      relationshipTypeId,
      fromEntityId,
      toEntityId,
      visibilityScope,
      visibilityRefId,
      contextCampaignId,
      contextCharacterId
    } = req.body as {
      relationshipTypeId?: string;
      fromEntityId?: string;
      toEntityId?: string;
      visibilityScope?: EntityAccessScope;
      visibilityRefId?: string | null;
      contextCampaignId?: string;
      contextCharacterId?: string;
    };

    if (!relationshipTypeId || !fromEntityId || !toEntityId) {
      res.status(400).json({ error: "relationshipTypeId, fromEntityId, and toEntityId are required." });
      return;
    }

    if (fromEntityId === toEntityId) {
      res.status(400).json({ error: "fromEntityId and toEntityId must be different." });
      return;
    }

    const [relationshipType, fromEntity, toEntity] = await Promise.all([
      prisma.relationshipType.findUnique({
        where: { id: relationshipTypeId },
        select: { id: true, worldId: true, isPeerable: true }
      }),
      prisma.entity.findUnique({
        where: { id: fromEntityId },
        select: { id: true, worldId: true, entityTypeId: true }
      }),
      prisma.entity.findUnique({
        where: { id: toEntityId },
        select: { id: true, worldId: true, entityTypeId: true }
      })
    ]);

    if (!relationshipType || !fromEntity || !toEntity) {
      res.status(404).json({ error: "Relationship type or entity not found." });
      return;
    }

    if (
      relationshipType.worldId !== fromEntity.worldId ||
      relationshipType.worldId !== toEntity.worldId
    ) {
      res.status(400).json({ error: "Entities must belong to the same world as the relationship type." });
      return;
    }

    const worldId = relationshipType.worldId;
    if (!(await canManageRelationships(user, worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const accessFilter = isAdmin(user)
      ? { worldId }
      : await buildEntityAccessFilter(user, worldId, contextCampaignId, contextCharacterId);
    const accessible = await prisma.entity.findMany({
      where: { id: { in: [fromEntityId, toEntityId] }, ...accessFilter },
      select: { id: true }
    });
    if (accessible.length !== 2) {
      res.status(403).json({ error: "Entities are not accessible." });
      return;
    }

    const rule = await prisma.relationshipTypeRule.findFirst({
      where: {
        relationshipTypeId,
        fromEntityTypeId: fromEntity.entityTypeId,
        toEntityTypeId: toEntity.entityTypeId
      },
      select: { id: true }
    });
    if (!rule) {
      res.status(400).json({ error: "Relationship type rule does not allow this pairing." });
      return;
    }

    if (relationshipType.isPeerable) {
      const reverseRule = await prisma.relationshipTypeRule.findFirst({
        where: {
          relationshipTypeId,
          fromEntityTypeId: toEntity.entityTypeId,
          toEntityTypeId: fromEntity.entityTypeId
        },
        select: { id: true }
      });
      if (!reverseRule) {
        res.status(400).json({ error: "Peer relationships require a reverse rule." });
        return;
      }
    }

    const existing = await prisma.relationship.findFirst({
      where: {
        worldId,
        relationshipTypeId,
        fromEntityId,
        toEntityId
      },
      select: { id: true }
    });
    if (existing) {
      res.status(409).json({ error: "Relationship already exists." });
      return;
    }

    if (relationshipType.isPeerable) {
      const reverseExisting = await prisma.relationship.findFirst({
        where: {
          worldId,
          relationshipTypeId,
          fromEntityId: toEntityId,
          toEntityId: fromEntityId
        },
        select: { id: true }
      });
      if (reverseExisting) {
        res.status(409).json({ error: "Relationship already exists." });
        return;
      }
    }

    const defaultScope = contextCharacterId
      ? EntityAccessScope.CHARACTER
      : contextCampaignId
        ? EntityAccessScope.CAMPAIGN
        : EntityAccessScope.GLOBAL;
    const resolvedScope = normalizeVisibilityScope(visibilityScope) ?? defaultScope;
    const resolvedRefId =
      resolvedScope === EntityAccessScope.GLOBAL
        ? null
        : (visibilityRefId ?? (resolvedScope === EntityAccessScope.CAMPAIGN ? contextCampaignId : contextCharacterId));
    const visibilityResult = await validateVisibility(worldId, resolvedScope, resolvedRefId);
    if (visibilityResult.error) {
      res.status(400).json({ error: visibilityResult.error });
      return;
    }

    const peerGroupId = relationshipType.isPeerable ? randomUUID() : null;

    const created = await prisma.$transaction(async (tx) => {
      const baseData = {
        worldId,
        relationshipTypeId,
        fromEntityId,
        toEntityId,
        peerGroupId,
        status: RelationshipStatus.ACTIVE,
        visibilityScope: visibilityResult.visibilityScope,
        visibilityRefId: visibilityResult.visibilityRefId,
        createdById: user.id
      };

      const relationship = await tx.relationship.create({ data: baseData });

      if (relationshipType.isPeerable) {
        await tx.relationship.create({
          data: {
            ...baseData,
            fromEntityId: toEntityId,
            toEntityId: fromEntityId
          }
        });
      }

      return relationship;
    });

    res.status(201).json(created);
  });

  app.put("/api/relationships/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const { visibilityScope, visibilityRefId } = req.body as {
      visibilityScope?: EntityAccessScope;
      visibilityRefId?: string | null;
    };

    const existing = await prisma.relationship.findUnique({
      where: { id },
      select: { id: true, worldId: true, peerGroupId: true }
    });
    if (!existing) {
      res.status(404).json({ error: "Relationship not found." });
      return;
    }

    if (!(await canManageRelationships(user, existing.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const scope = normalizeVisibilityScope(visibilityScope);
    if (!scope) {
      res.status(400).json({ error: "visibilityScope is required." });
      return;
    }

    const resolvedRefId = scope === EntityAccessScope.GLOBAL ? null : visibilityRefId ?? null;
    const visibilityResult = await validateVisibility(existing.worldId, scope, resolvedRefId);
    if (visibilityResult.error) {
      res.status(400).json({ error: visibilityResult.error });
      return;
    }

    if (existing.peerGroupId) {
      await prisma.relationship.updateMany({
        where: { peerGroupId: existing.peerGroupId },
        data: {
          visibilityScope: visibilityResult.visibilityScope,
          visibilityRefId: visibilityResult.visibilityRefId
        }
      });
    } else {
      await prisma.relationship.update({
        where: { id },
        data: {
          visibilityScope: visibilityResult.visibilityScope,
          visibilityRefId: visibilityResult.visibilityRefId
        }
      });
    }

    const updated = await prisma.relationship.findUnique({ where: { id } });
    res.json(updated);
  });

  app.post("/api/relationships/:id/expire", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.relationship.findUnique({
      where: { id },
      select: { id: true, worldId: true, peerGroupId: true }
    });
    if (!existing) {
      res.status(404).json({ error: "Relationship not found." });
      return;
    }

    if (!(await canManageRelationships(user, existing.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const now = new Date();
    if (existing.peerGroupId) {
      await prisma.relationship.updateMany({
        where: { peerGroupId: existing.peerGroupId },
        data: {
          status: RelationshipStatus.EXPIRED,
          expiredAt: now
        }
      });
    } else {
      await prisma.relationship.update({
        where: { id },
        data: {
          status: RelationshipStatus.EXPIRED,
          expiredAt: now
        }
      });
    }

    const updated = await prisma.relationship.findUnique({ where: { id } });
    res.json(updated);
  });

  app.delete("/api/relationships/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.relationship.findUnique({
      where: { id },
      select: { id: true, worldId: true, peerGroupId: true }
    });
    if (!existing) {
      res.status(404).json({ error: "Relationship not found." });
      return;
    }

    if (!(await canManageRelationships(user, existing.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    if (existing.peerGroupId) {
      await prisma.relationship.deleteMany({ where: { peerGroupId: existing.peerGroupId } });
    } else {
      await prisma.relationship.delete({ where: { id } });
    }

    res.json({ ok: true });
  });
};

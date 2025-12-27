import express from "express";
import { Prisma, WorldEntityPermissionScope } from "@prisma/client";
import { prisma, requireAuth, isAdmin, isWorldArchitect } from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";

export const registerWorldsRoutes = (app: express.Express) => {
  app.get("/api/worlds", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    const accessClause: Prisma.WorldWhereInput = isAdmin(user)
      ? {}
      : {
          OR: [
            { primaryArchitectId: user.id },
            { architects: { some: { userId: user.id } } },
            { gameMasters: { some: { userId: user.id } } },
            { campaignCreators: { some: { userId: user.id } } },
            { characterCreators: { some: { userId: user.id } } }
          ]
        };
  
    const whereClause: Prisma.WorldWhereInput = worldId
      ? { AND: [accessClause, { id: worldId }] }
      : accessClause;
  
    const worlds = await prisma.world.findMany({
      where: whereClause,
      orderBy: { name: "asc" }
    });
  
    res.json(worlds);
  });

  app.post("/api/worlds", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const {
      name,
      description,
      dmLabelKey,
      themeKey,
      primaryArchitectId,
      characterCreatorIds,
      entityPermissionScope
    } =
      req.body as {
      name?: string;
      description?: string;
      dmLabelKey?: string;
      themeKey?: string;
      primaryArchitectId?: string;
      characterCreatorIds?: string[];
      entityPermissionScope?: WorldEntityPermissionScope;
    };
  
    if (!name) {
      res.status(400).json({ error: "name is required." });
      return;
    }
  
    const architectId = primaryArchitectId ?? user.id;
    if (primaryArchitectId && !isAdmin(user)) {
      res.status(403).json({ error: "Only admins can set the primary architect." });
      return;
    }
  
    const world = await prisma.world.create({
      data: {
        name,
        description,
        dmLabelKey,
        themeKey,
        primaryArchitectId: architectId,
        entityPermissionScope
      }
    });
  
    await prisma.worldArchitect.upsert({
      where: { worldId_userId: { worldId: world.id, userId: architectId } },
      update: {},
      create: { worldId: world.id, userId: architectId }
    });
  
    if (Array.isArray(characterCreatorIds) && characterCreatorIds.length > 0) {
      await prisma.worldCharacterCreator.createMany({
        data: characterCreatorIds.map((userId) => ({ worldId: world.id, userId })),
        skipDuplicates: true
      });
    }
  
    res.status(201).json(world);
  });

  app.get("/api/worlds/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const isArchitect = await isWorldArchitect(user.id, id);
    const canRead =
      isAdmin(user) ||
      isArchitect ||
      (await prisma.worldGameMaster.findFirst({
        where: { worldId: id, userId: user.id }
      })) ||
      (await prisma.worldCampaignCreator.findFirst({
        where: { worldId: id, userId: user.id }
      })) ||
      (await prisma.worldCharacterCreator.findFirst({
        where: { worldId: id, userId: user.id }
      }));
  
    if (!canRead) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const world = await prisma.world.findUnique({
      where: { id },
      include: { characterCreators: true }
    });
    if (!world) {
      res.status(404).json({ error: "World not found." });
      return;
    }
  
    res.json({
      ...world,
      characterCreatorIds: world.characterCreators.map((entry) => entry.userId)
    });
  });

  app.get("/api/worlds/:id/world-admin", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const allowed = isAdmin(user) || (await isWorldArchitect(user.id, id));
    res.json({ allowed });
  });

  app.put("/api/worlds/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const isArchitect = await isWorldArchitect(user.id, id);
  
    if (!isAdmin(user) && !isArchitect) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const {
      name,
      description,
      dmLabelKey,
      themeKey,
      primaryArchitectId,
      characterCreatorIds,
      entityPermissionScope
    } =
      req.body as {
      name?: string;
      description?: string;
      dmLabelKey?: string;
      themeKey?: string;
      primaryArchitectId?: string;
      characterCreatorIds?: string[];
      entityPermissionScope?: WorldEntityPermissionScope;
    };
  
    if (primaryArchitectId && !isAdmin(user)) {
      res.status(403).json({ error: "Only admins can change the primary architect." });
      return;
    }
  
    const world = await prisma.world.update({
      where: { id },
      data: { name, description, dmLabelKey, themeKey, primaryArchitectId, entityPermissionScope }
    });
  
    if (primaryArchitectId) {
      await prisma.worldArchitect.upsert({
        where: { worldId_userId: { worldId: world.id, userId: primaryArchitectId } },
        update: {},
        create: { worldId: world.id, userId: primaryArchitectId }
      });
    }
  
    if (Array.isArray(characterCreatorIds)) {
      await prisma.worldCharacterCreator.deleteMany({ where: { worldId: id } });
      if (characterCreatorIds.length > 0) {
        await prisma.worldCharacterCreator.createMany({
          data: characterCreatorIds.map((userId) => ({ worldId: id, userId })),
          skipDuplicates: true
        });
      }
    }
  
    res.json(world);
  });

  app.delete("/api/worlds/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const isArchitect = await isWorldArchitect(user.id, id);
    if (!isAdmin(user) && !isArchitect) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    await prisma.$transaction(async (tx) => {
      const campaignIds = (
        await tx.campaign.findMany({ where: { worldId: id }, select: { id: true } })
      ).map((campaign) => campaign.id);
      const characterIds = (
        await tx.character.findMany({ where: { worldId: id }, select: { id: true } })
      ).map((character) => character.id);
      const entityIds = (
        await tx.entity.findMany({ where: { worldId: id }, select: { id: true } })
      ).map((entity) => entity.id);
      const entityTypeIds = (
        await tx.entityType.findMany({ where: { worldId: id }, select: { id: true } })
      ).map((entityType) => entityType.id);
  
      if (campaignIds.length > 0) {
        await tx.characterCampaign.deleteMany({ where: { campaignId: { in: campaignIds } } });
        await tx.campaignDelegate.deleteMany({ where: { campaignId: { in: campaignIds } } });
        await tx.campaignCharacterCreator.deleteMany({
          where: { campaignId: { in: campaignIds } }
        });
      }
  
      if (characterIds.length > 0) {
        await tx.characterCampaign.deleteMany({ where: { characterId: { in: characterIds } } });
      }
  
      if (entityIds.length > 0) {
        await tx.entityAccess.deleteMany({ where: { entityId: { in: entityIds } } });
        await tx.entityFieldValue.deleteMany({ where: { entityId: { in: entityIds } } });
        await tx.entity.deleteMany({ where: { id: { in: entityIds } } });
      }
  
      if (entityTypeIds.length > 0) {
        await tx.entityFieldChoice.deleteMany({
          where: { entityField: { entityTypeId: { in: entityTypeIds } } }
        });
        await tx.entityField.deleteMany({ where: { entityTypeId: { in: entityTypeIds } } });
        await tx.entityFormSection.deleteMany({ where: { entityTypeId: { in: entityTypeIds } } });
        await tx.entityType.deleteMany({ where: { id: { in: entityTypeIds } } });
      }
  
      if (characterIds.length > 0) {
        await tx.character.deleteMany({ where: { id: { in: characterIds } } });
      }
  
      if (campaignIds.length > 0) {
        await tx.campaign.deleteMany({ where: { id: { in: campaignIds } } });
      }
  
      await tx.worldDelegate.deleteMany({ where: { worldId: id } });
      await tx.worldArchitect.deleteMany({ where: { worldId: id } });
      await tx.worldGameMaster.deleteMany({ where: { worldId: id } });
      await tx.worldCampaignCreator.deleteMany({ where: { worldId: id } });
      await tx.worldCharacterCreator.deleteMany({ where: { worldId: id } });
      await tx.world.delete({ where: { id } });
    });
    res.json({ ok: true });
  });

  app.post("/api/worlds/:id/architects", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const { userId } = req.body as { userId?: string };
  
    if (!userId) {
      res.status(400).json({ error: "userId is required." });
      return;
    }
  
    const isArchitect = await isWorldArchitect(user.id, id);
    if (!isAdmin(user) && !isArchitect) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const architect = await prisma.worldArchitect.upsert({
      where: { worldId_userId: { worldId: id, userId } },
      update: {},
      create: { worldId: id, userId }
    });
  
    res.status(201).json(architect);
  });

  app.delete("/api/worlds/:id/architects/:userId", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id, userId } = req.params;
    const isArchitect = await isWorldArchitect(user.id, id);
    if (!isAdmin(user) && !isArchitect) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const world = await prisma.world.findUnique({
      where: { id },
      select: { primaryArchitectId: true }
    });
  
    if (world?.primaryArchitectId === userId) {
      res.status(400).json({ error: "Cannot remove the primary architect." });
      return;
    }
  
    await prisma.worldArchitect.delete({
      where: { worldId_userId: { worldId: id, userId } }
    });
  
    res.json({ ok: true });
  });

  app.post("/api/worlds/:id/campaign-creators", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const { userId } = req.body as { userId?: string };
  
    if (!userId) {
      res.status(400).json({ error: "userId is required." });
      return;
    }
  
    const isArchitect = await isWorldArchitect(user.id, id);
    if (!isAdmin(user) && !isArchitect) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const creator = await prisma.worldCampaignCreator.upsert({
      where: { worldId_userId: { worldId: id, userId } },
      update: {},
      create: { worldId: id, userId }
    });
  
    res.status(201).json(creator);
  });

  app.delete("/api/worlds/:id/campaign-creators/:userId", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id, userId } = req.params;
    const isArchitect = await isWorldArchitect(user.id, id);
    if (!isAdmin(user) && !isArchitect) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    await prisma.worldCampaignCreator.delete({
      where: { worldId_userId: { worldId: id, userId } }
    });
  
    res.json({ ok: true });
  });

  app.post("/api/worlds/:id/character-creators", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const { userId } = req.body as { userId?: string };
  
    if (!userId) {
      res.status(400).json({ error: "userId is required." });
      return;
    }
  
    const isArchitect = await isWorldArchitect(user.id, id);
    if (!isAdmin(user) && !isArchitect) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const creator = await prisma.worldCharacterCreator.upsert({
      where: { worldId_userId: { worldId: id, userId } },
      update: {},
      create: { worldId: id, userId }
    });
  
    res.status(201).json(creator);
  });

  app.delete("/api/worlds/:id/character-creators/:userId", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id, userId } = req.params;
    const isArchitect = await isWorldArchitect(user.id, id);
    if (!isAdmin(user) && !isArchitect) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    await prisma.worldCharacterCreator.delete({
      where: { worldId_userId: { worldId: id, userId } }
    });
  
    res.json({ ok: true });
  });

};

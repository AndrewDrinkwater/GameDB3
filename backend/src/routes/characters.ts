import express from "express";
import { Prisma } from "@prisma/client";
import { prisma, requireAuth, isAdmin, isWorldArchitect, canCreateCharacterInWorld, canCreateCharacterInCampaign } from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";

export const registerCharactersRoutes = (app: express.Express) => {
  app.get("/api/characters", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
  
    const accessClause: Prisma.CharacterWhereInput = isAdmin(user)
      ? {}
      : {
          OR: [
            { playerId: user.id },
            { world: { primaryArchitectId: user.id } },
            { world: { architects: { some: { userId: user.id } } } },
            { campaigns: { some: { campaign: { gmUserId: user.id } } } }
          ]
        };
  
    const filters: Prisma.CharacterWhereInput[] = [accessClause];
    if (worldId) filters.push({ worldId });
    if (campaignId) filters.push({ campaigns: { some: { campaignId } } });
    if (characterId) filters.push({ id: characterId });
  
    const whereClause: Prisma.CharacterWhereInput =
      filters.length > 1 ? { AND: filters } : accessClause;
  
    const characters = await prisma.character.findMany({
      where: whereClause,
      orderBy: { name: "asc" }
    });
  
    res.json(characters);
  });

  app.post("/api/characters", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { worldId, name, description, statusKey, playerId, campaignId } = req.body as {
      worldId?: string;
      name?: string;
      description?: string;
      statusKey?: string;
      playerId?: string;
      campaignId?: string;
    };
  
    if (!worldId || !name) {
      res.status(400).json({ error: "worldId and name are required." });
      return;
    }
  
    if (campaignId) {
      const canCreate = isAdmin(user) || (await canCreateCharacterInCampaign(user.id, campaignId));
      if (!canCreate) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    } else {
      const canCreate = isAdmin(user) || (await canCreateCharacterInWorld(user.id, worldId));
      if (!canCreate) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }
  
    if (campaignId) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { worldId: true }
      });
  
      if (!campaign || campaign.worldId !== worldId) {
        res.status(400).json({ error: "Campaign world mismatch." });
        return;
      }
    }
  
    const effectivePlayerId = isAdmin(user) && playerId ? playerId : user.id;
  
    const character = await prisma.character.create({
      data: {
        name,
        description,
        statusKey,
        playerId: effectivePlayerId,
        worldId
      }
    });
  
    if (campaignId) {
      await prisma.characterCampaign.create({
        data: {
          campaignId,
          characterId: character.id,
          status: "ACTIVE"
        }
      });
    }
  
    res.status(201).json(character);
  });

  app.get("/api/characters/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const character = await prisma.character.findUnique({
      where: { id },
      include: {
        world: { include: { architects: true } },
        campaigns: { include: { campaign: { select: { gmUserId: true } } } }
      }
    });
  
    if (!character) {
      res.status(404).json({ error: "Character not found." });
      return;
    }
  
    const canAccess =
      isAdmin(user) ||
      character.playerId === user.id ||
      character.world.primaryArchitectId === user.id ||
      character.world.architects.some((architect) => architect.userId === user.id) ||
      character.campaigns.some((entry) => entry.campaign.gmUserId === user.id);
  
    if (!canAccess) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const { campaigns, ...characterData } = character;
    res.json({
      ...characterData,
      campaignIds: campaigns.map((campaign) => campaign.campaignId)
    });
  });

  app.put("/api/characters/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const character = await prisma.character.findUnique({
      where: { id },
      select: { playerId: true, worldId: true }
    });
  
    if (!character) {
      res.status(404).json({ error: "Character not found." });
      return;
    }
  
    const isArchitect = await isWorldArchitect(user.id, character.worldId);
    if (!isAdmin(user) && !isArchitect && character.playerId !== user.id) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const { name, description, statusKey, worldId, playerId } = req.body as {
      name?: string;
      description?: string;
      statusKey?: string;
      worldId?: string;
      playerId?: string;
    };
  
    if (worldId && worldId !== character.worldId) {
      res.status(400).json({ error: "Character world cannot be changed." });
      return;
    }
  
    const updated = await prisma.character.update({
      where: { id },
      data: {
        name,
        description,
        statusKey,
        playerId: isAdmin(user) && playerId ? playerId : undefined
      }
    });
  
    res.json(updated);
  });

  app.delete("/api/characters/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const character = await prisma.character.findUnique({
      where: { id },
      select: { playerId: true, worldId: true }
    });
  
    if (!character) {
      res.status(404).json({ error: "Character not found." });
      return;
    }
  
    const isArchitect = await isWorldArchitect(user.id, character.worldId);
    if (!isAdmin(user) && !isArchitect && character.playerId !== user.id) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    await prisma.character.delete({ where: { id } });
    res.json({ ok: true });
  });

};

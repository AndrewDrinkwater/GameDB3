import express from "express";
import { Prisma, EntityAccessScope, EntityAccessType, LocationFieldType, LocationStatus, NoteTagType, NoteVisibility, Role } from "@prisma/client";
import { prisma, requireAuth, isAdmin, canAccessWorld, isWorldArchitect, isWorldGameMaster, isWorldGm, canCreateLocationInWorld, buildLocationAccessFilter, isCampaignGm, buildEntityAccessFilter, extractNoteTags, logSystemAudit, canWriteLocation, buildAccessSignature } from "../lib/helpers";
import type { AuthRequest, LocationFieldRecord, LocationFieldValueWrite, LocationAccessEntry } from "../lib/helpers";
import { hasLocationCycle, getAllowedLocationParentTypeIds, getWorldAccessUserIds } from "./shared";
import { listLocations, getLocationById, createLocation, updateLocation, deleteLocation } from "../services/locationService";
import { ServiceError } from "../services/serviceError";

const handleLocationServiceError = (res: express.Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof ServiceError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(fallbackMessage, error);
  res.status(500).json({ error: fallbackMessage });
};

export const registerLocationsRoutes = (app: express.Express) => {
  app.get("/api/locations", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    const locationTypeId = typeof req.query.locationTypeId === "string" ? req.query.locationTypeId : undefined;
    const parentLocationId = typeof req.query.parentLocationId === "string" ? req.query.parentLocationId : undefined;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
    const fieldKeys = typeof req.query.fieldKeys === "string" ? req.query.fieldKeys : undefined;
    const filters = typeof req.query.filters === "string" ? req.query.filters : undefined;

    try {
      const locations = await listLocations({
        user,
        query: {
          worldId,
          locationTypeId,
          parentLocationId,
          campaignId,
          characterId,
          fieldKeys,
          filters
        }
      });
      res.json(locations);
    } catch (error) {
      handleLocationServiceError(res, error, "Failed to list locations.");
    }
  });
  app.post("/api/locations", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const body = req.body as {
      worldId?: string;
      locationTypeId?: string;
      parentLocationId?: string | null;
      name?: string;
      description?: string;
      status?: LocationStatus;
      metadata?: Prisma.InputJsonValue;
      fieldValues?: Record<string, unknown>;
      contextCampaignId?: string;
      contextCharacterId?: string;
      access?: {
        read?: { global?: boolean; campaigns?: string[]; characters?: string[] };
        write?: { global?: boolean; campaigns?: string[]; characters?: string[] };
      };
    };

    try {
      const created = await createLocation({
        user,
        payload: {
          worldId: body.worldId,
          locationTypeId: body.locationTypeId,
          parentLocationId: body.parentLocationId,
          name: body.name,
          description: body.description,
          status: body.status,
          metadata: body.metadata,
          fieldValues: body.fieldValues,
          contextCampaignId: body.contextCampaignId,
          contextCharacterId: body.contextCharacterId,
          access: body.access
        }
      });
      res.status(201).json(created);
    } catch (error) {
      handleLocationServiceError(res, error, "Failed to create location.");
    }
  });
  app.get("/api/locations/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;

    try {
      const location = await getLocationById({
        user,
        locationId: req.params.id,
        context: { campaignId, characterId }
      });
      res.json(location);
    } catch (error) {
      handleLocationServiceError(res, error, "Failed to load location.");
    }
  });
  app.put("/api/locations/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
    const body = req.body as {
      name?: string;
      description?: string;
      parentLocationId?: string | null;
      status?: LocationStatus;
      metadata?: Prisma.InputJsonValue;
      fieldValues?: Record<string, unknown>;
    };

    try {
      const updated = await updateLocation({
        user,
        locationId: req.params.id,
        payload: {
          name: body.name,
          description: body.description,
          parentLocationId: body.parentLocationId,
          status: body.status,
          metadata: body.metadata,
          fieldValues: body.fieldValues
        },
        context: { campaignId, characterId }
      });
      res.json(updated);
    } catch (error) {
      handleLocationServiceError(res, error, "Failed to update location.");
    }
  });
  app.delete("/api/locations/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;

    try {
      await deleteLocation({ user, locationId: req.params.id });
      res.json({ ok: true });
    } catch (error) {
      handleLocationServiceError(res, error, "Failed to delete location.");
    }
  });
  app.get("/api/locations/:id/access", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const location = await prisma.location.findUnique({
      where: { id },
      select: { worldId: true }
    });
    if (!location) {
      res.status(404).json({ error: "Location not found." });
      return;
    }
  
    const isArchitect = await isWorldArchitect(user.id, location.worldId);
    const isGm =
      (await isWorldGameMaster(user.id, location.worldId)) ||
      (await isWorldGm(user.id, location.worldId));
    if (!isAdmin(user) && !isArchitect && !isGm) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const access = await prisma.locationAccess.findMany({ where: { locationId: id } });
    const read = {
      global: access.some(
        (entry) =>
          entry.accessType === EntityAccessType.READ &&
          entry.scopeType === EntityAccessScope.GLOBAL
      ),
      campaigns: access
        .filter(
          (entry) =>
            entry.accessType === EntityAccessType.READ &&
            entry.scopeType === EntityAccessScope.CAMPAIGN
        )
        .map((entry) => entry.scopeId)
        .filter(Boolean) as string[],
      characters: access
        .filter(
          (entry) =>
            entry.accessType === EntityAccessType.READ &&
            entry.scopeType === EntityAccessScope.CHARACTER
        )
        .map((entry) => entry.scopeId)
        .filter(Boolean) as string[]
    };
  
    const write = {
      global: access.some(
        (entry) =>
          entry.accessType === EntityAccessType.WRITE &&
          entry.scopeType === EntityAccessScope.GLOBAL
      ),
      campaigns: access
        .filter(
          (entry) =>
            entry.accessType === EntityAccessType.WRITE &&
            entry.scopeType === EntityAccessScope.CAMPAIGN
        )
        .map((entry) => entry.scopeId)
        .filter(Boolean) as string[],
      characters: access
        .filter(
          (entry) =>
            entry.accessType === EntityAccessType.WRITE &&
            entry.scopeType === EntityAccessScope.CHARACTER
        )
        .map((entry) => entry.scopeId)
        .filter(Boolean) as string[]
    };
  
    res.json({ read, write });
  });

  app.get("/api/locations/:id/audit", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const location = await prisma.location.findUnique({
      where: { id },
      select: { worldId: true }
    });
    if (!location) {
      res.status(404).json({ error: "Location not found." });
      return;
    }
  
    const isArchitect = await isWorldArchitect(user.id, location.worldId);
    const isGm =
      (await isWorldGameMaster(user.id, location.worldId)) ||
      (await isWorldGm(user.id, location.worldId));
    if (!isAdmin(user) && !isArchitect && !isGm) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const access = await prisma.locationAccess.findMany({ where: { locationId: id } });
    const readGlobal = access.some(
      (entry) =>
        entry.accessType === EntityAccessType.READ &&
        entry.scopeType === EntityAccessScope.GLOBAL
    );
    const writeGlobal = access.some(
      (entry) =>
        entry.accessType === EntityAccessType.WRITE &&
        entry.scopeType === EntityAccessScope.GLOBAL
    );
    const readCampaignIds = access
      .filter(
        (entry) =>
          entry.accessType === EntityAccessType.READ &&
          entry.scopeType === EntityAccessScope.CAMPAIGN
      )
      .map((entry) => entry.scopeId)
      .filter(Boolean) as string[];
    const writeCampaignIds = access
      .filter(
        (entry) =>
          entry.accessType === EntityAccessType.WRITE &&
          entry.scopeType === EntityAccessScope.CAMPAIGN
      )
      .map((entry) => entry.scopeId)
      .filter(Boolean) as string[];
    const readCharacterIds = access
      .filter(
        (entry) =>
          entry.accessType === EntityAccessType.READ &&
          entry.scopeType === EntityAccessScope.CHARACTER
      )
      .map((entry) => entry.scopeId)
      .filter(Boolean) as string[];
    const writeCharacterIds = access
      .filter(
        (entry) =>
          entry.accessType === EntityAccessType.WRITE &&
          entry.scopeType === EntityAccessScope.CHARACTER
      )
      .map((entry) => entry.scopeId)
      .filter(Boolean) as string[];
  
    const campaignIds = Array.from(new Set([...readCampaignIds, ...writeCampaignIds]));
    const characterIds = Array.from(new Set([...readCharacterIds, ...writeCharacterIds]));
  
    const [campaigns, characters] = await Promise.all([
      campaignIds.length > 0
        ? prisma.campaign.findMany({
            where: { id: { in: campaignIds } },
            select: {
              id: true,
              name: true,
              gmUserId: true,
              roster: { select: { character: { select: { playerId: true } } } }
            }
          })
        : Promise.resolve([]),
      characterIds.length > 0
        ? prisma.character.findMany({
            where: { id: { in: characterIds } },
            select: { id: true, name: true, playerId: true }
          })
        : Promise.resolve([])
    ]);
  
    const campaignUserMap = new Map<string, { label: string; userIds: Set<string> }>();
    campaigns.forEach((campaign) => {
      const userIds = new Set<string>([campaign.gmUserId]);
      campaign.roster.forEach((entry) => {
        userIds.add(entry.character.playerId);
      });
      campaignUserMap.set(campaign.id, { label: `Campaign: ${campaign.name}`, userIds });
    });
  
    const characterUserMap = new Map<string, { label: string; userId: string }>();
    characters.forEach((character) => {
      characterUserMap.set(character.id, {
        label: `Character: ${character.name}`,
        userId: character.playerId
      });
    });
  
    const needsGlobal = readGlobal || writeGlobal;
    const scopedUserIds = new Set<string>();
    campaignUserMap.forEach((entry) => entry.userIds.forEach((id) => scopedUserIds.add(id)));
    characterUserMap.forEach((entry) => scopedUserIds.add(entry.userId));

    const worldUserIds = needsGlobal ? await getWorldAccessUserIds(location.worldId) : [];
    const [globalUsers, scopedUsers] = await Promise.all([
      worldUserIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: worldUserIds }, role: Role.USER },
            select: { id: true, name: true, email: true }
          })
        : Promise.resolve([]),
      scopedUserIds.size > 0
        ? prisma.user.findMany({
            where: { id: { in: Array.from(scopedUserIds) }, role: Role.USER },
            select: { id: true, name: true, email: true }
          })
        : Promise.resolve([])
    ]);
  
    const userDirectory = new Map<string, { id: string; name: string | null; email: string }>();
    globalUsers.forEach((entry) => userDirectory.set(entry.id, entry));
    scopedUsers.forEach((entry) => userDirectory.set(entry.id, entry));
  
    const accessMap = new Map<
      string,
      {
        user: { id: string; name: string | null; email: string };
        readContexts: Set<string>;
        writeContexts: Set<string>;
      }
    >();
  
    const ensureAccessEntry = (userId: string) => {
      const userInfo = userDirectory.get(userId);
      if (!userInfo) return;
      if (!accessMap.has(userId)) {
        accessMap.set(userId, {
          user: userInfo,
          readContexts: new Set<string>(),
          writeContexts: new Set<string>()
        });
      }
    };
  
    if (readGlobal || writeGlobal) {
      globalUsers.forEach((entry) => {
        ensureAccessEntry(entry.id);
        const accessEntry = accessMap.get(entry.id);
        if (!accessEntry) return;
        if (readGlobal) accessEntry.readContexts.add("Global");
        if (writeGlobal) accessEntry.writeContexts.add("Global");
      });
    }
  
    readCampaignIds.forEach((campaignId) => {
      const campaign = campaignUserMap.get(campaignId);
      if (!campaign) return;
      campaign.userIds.forEach((userId) => {
        ensureAccessEntry(userId);
        accessMap.get(userId)?.readContexts.add(campaign.label);
      });
    });
  
    writeCampaignIds.forEach((campaignId) => {
      const campaign = campaignUserMap.get(campaignId);
      if (!campaign) return;
      campaign.userIds.forEach((userId) => {
        ensureAccessEntry(userId);
        accessMap.get(userId)?.writeContexts.add(campaign.label);
      });
    });
  
    readCharacterIds.forEach((characterId) => {
      const character = characterUserMap.get(characterId);
      if (!character) return;
      ensureAccessEntry(character.userId);
      accessMap.get(character.userId)?.readContexts.add(character.label);
    });
  
    writeCharacterIds.forEach((characterId) => {
      const character = characterUserMap.get(characterId);
      if (!character) return;
      ensureAccessEntry(character.userId);
      accessMap.get(character.userId)?.writeContexts.add(character.label);
    });
  
    const changes = await prisma.systemAudit.findMany({
      where: { entityKey: "locations", entityId: id },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" }
    });
  
    const world = await prisma.world.findUnique({
      where: { id: location.worldId },
      select: {
        primaryArchitectId: true,
        architects: { select: { userId: true } }
      }
    });
    const architectIds = world
      ? [
          world.primaryArchitectId,
          ...world.architects.map((entry) => entry.userId)
        ].filter(Boolean)
      : [];
    const missingArchitectIds = architectIds.filter((id) => !userDirectory.has(id));
    if (missingArchitectIds.length > 0) {
      const architectUsers = await prisma.user.findMany({
        where: { id: { in: missingArchitectIds } },
        select: { id: true, name: true, email: true }
      });
      architectUsers.forEach((entry) => userDirectory.set(entry.id, entry));
    }
  
    architectIds.forEach((architectId) => {
      ensureAccessEntry(architectId);
      const accessEntry = accessMap.get(architectId);
      if (!accessEntry) return;
      accessEntry.readContexts.add("Architect");
      accessEntry.writeContexts.add("Architect");
    });
  
    const accessSummary = Array.from(accessMap.values())
      .map((entry) => ({
        id: entry.user.id,
        name: entry.user.name,
        email: entry.user.email,
        readContexts: Array.from(entry.readContexts).sort(),
        writeContexts: Array.from(entry.writeContexts).sort()
      }))
      .sort((a, b) => {
        const labelA = (a.name ?? a.email).toLowerCase();
        const labelB = (b.name ?? b.email).toLowerCase();
        return labelA.localeCompare(labelB);
      });
  
    res.json({
      access: accessSummary,
      changes: changes.map((entry) => ({
        id: entry.id,
        action: entry.action,
        createdAt: entry.createdAt,
        actor: entry.actor,
        details: entry.details
      }))
    });
  });

  app.put("/api/locations/:id/access", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const location = await prisma.location.findUnique({
      where: { id },
      select: { worldId: true }
    });
    if (!location) {
      res.status(404).json({ error: "Location not found." });
      return;
    }
  
    const isArchitect = await isWorldArchitect(user.id, location.worldId);
    const isGm =
      (await isWorldGameMaster(user.id, location.worldId)) ||
      (await isWorldGm(user.id, location.worldId));
    if (!isAdmin(user) && !isArchitect && !isGm) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const existingAccess = await prisma.locationAccess.findMany({ where: { locationId: id } });
    const currentSignature = buildAccessSignature(existingAccess);
  
    const { read, write } = req.body as {
      read?: { global?: boolean; campaigns?: string[]; characters?: string[] };
      write?: { global?: boolean; campaigns?: string[]; characters?: string[] };
    };
  
    const accessEntries: LocationAccessEntry[] = [];
    if (read?.global) {
      accessEntries.push({
        locationId: id,
        accessType: EntityAccessType.READ,
        scopeType: EntityAccessScope.GLOBAL
      });
    }
    read?.campaigns?.forEach((campaignId) =>
      accessEntries.push({
        locationId: id,
        accessType: EntityAccessType.READ,
        scopeType: EntityAccessScope.CAMPAIGN,
        scopeId: campaignId
      })
    );
    read?.characters?.forEach((characterId) =>
      accessEntries.push({
        locationId: id,
        accessType: EntityAccessType.READ,
        scopeType: EntityAccessScope.CHARACTER,
        scopeId: characterId
      })
    );
  
    if (write?.global) {
      accessEntries.push({
        locationId: id,
        accessType: EntityAccessType.WRITE,
        scopeType: EntityAccessScope.GLOBAL
      });
    }
    write?.campaigns?.forEach((campaignId) =>
      accessEntries.push({
        locationId: id,
        accessType: EntityAccessType.WRITE,
        scopeType: EntityAccessScope.CAMPAIGN,
        scopeId: campaignId
      })
    );
    write?.characters?.forEach((characterId) =>
      accessEntries.push({
        locationId: id,
        accessType: EntityAccessType.WRITE,
        scopeType: EntityAccessScope.CHARACTER,
        scopeId: characterId
      })
    );
  
    const nextSignature = buildAccessSignature(accessEntries);
    const accessChanged = currentSignature !== nextSignature;
  
    const operations: Prisma.PrismaPromise<unknown>[] = [
      prisma.locationAccess.deleteMany({ where: { locationId: id } }),
      prisma.locationAccess.createMany({ data: accessEntries })
    ];
  
    if (accessChanged) {
      operations.push(
        prisma.systemAudit.create({
          data: {
            entityKey: "locations",
            entityId: id,
            action: "access_update",
            actorId: user.id,
            details: { read: read ?? null, write: write ?? null }
          }
        })
      );
    }
  
    await prisma.$transaction(operations);
  
    res.json({ ok: true });
  });

  app.get("/api/locations/:id/notes", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId =
      typeof req.query.characterId === "string" ? req.query.characterId : undefined;
  
    const location = await prisma.location.findUnique({
      where: { id },
      select: { id: true, worldId: true }
    });
    if (!location) {
      res.status(404).json({ error: "Location not found." });
      return;
    }
  
    const accessFilter = await buildLocationAccessFilter(
      user,
      location.worldId,
      campaignId,
      characterId
    );
    const canRead = await prisma.location.findFirst({
      where: { id, ...accessFilter },
      select: { id: true }
    });
    if (!canRead) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const isAdminUser = isAdmin(user);
    const isArchitect = await isWorldArchitect(user.id, location.worldId);
    const isWorldGmFlag = await isWorldGameMaster(user.id, location.worldId);
    const isContextCampaignGm = campaignId ? await isCampaignGm(user.id, campaignId) : false;
  
    const baseWhere: Prisma.NoteWhereInput = {
      locationId: id,
      campaignId: campaignId ?? null
    };
  
    const notes = await prisma.note.findMany({
      where: baseWhere,
      include: {
        author: { select: { id: true, name: true, email: true } },
        character: { select: { id: true, name: true } },
        tags: true,
        shares: { select: { characterId: true } }
      },
      orderBy: { createdAt: "desc" }
    });
  
    const playerCharacterIds = campaignId
      ? await prisma.characterCampaign.findMany({
          where: { campaignId, character: { playerId: user.id } },
          select: { characterId: true }
        })
      : [];
    const playerCharacterIdSet = new Set(playerCharacterIds.map((entry) => entry.characterId));
  
    const canSeePrivate = isAdminUser || isArchitect || isWorldGmFlag;
    const visibleNotes = notes.filter((note) => {
      if (isAdminUser) return true;
      if (note.visibility === NoteVisibility.GM) {
        if (!campaignId) return false;
        if (isContextCampaignGm) return true;
        if (note.shareWithArchitect && isArchitect) return true;
        if (note.shares.some((share) => playerCharacterIdSet.has(share.characterId))) {
          return true;
        }
        return false;
      }
      if (note.visibility === NoteVisibility.SHARED) return true;
      if (note.authorId === user.id) return true;
      if (campaignId && isContextCampaignGm) return true;
      if (canSeePrivate) return true;
      return false;
    });
  
    const world = await prisma.world.findUnique({
      where: { id: location.worldId },
      select: {
        primaryArchitectId: true,
        architects: { select: { userId: true } }
      }
    });
    const architectIds = new Set<string>(
      world
        ? [world.primaryArchitectId, ...world.architects.map((entry) => entry.userId)]
        : []
    );
    const campaignIds = Array.from(
      new Set(visibleNotes.map((note) => note.campaignId).filter(Boolean))
    ) as string[];
    const campaigns = campaignIds.length
      ? await prisma.campaign.findMany({
          where: { id: { in: campaignIds } },
          select: { id: true, gmUserId: true }
        })
      : [];
    const campaignGmMap = new Map(campaigns.map((campaign) => [campaign.id, campaign.gmUserId]));
  
    const entityTagIds = Array.from(
      new Set(
        visibleNotes
          .flatMap((note) => note.tags)
          .filter((tag) => tag.tagType === NoteTagType.ENTITY)
          .map((tag) => tag.targetId)
      )
    );
    const locationTagIds = Array.from(
      new Set(
        visibleNotes
          .flatMap((note) => note.tags)
          .filter((tag) => tag.tagType === NoteTagType.LOCATION)
          .map((tag) => tag.targetId)
      )
    );
  
    const accessibleEntityTagIds = new Set<string>();
    if (entityTagIds.length > 0) {
      const entityAccessFilter = await buildEntityAccessFilter(
        user,
        location.worldId,
        campaignId,
        characterId
      );
      const accessibleEntities = await prisma.entity.findMany({
        where: { id: { in: entityTagIds }, ...entityAccessFilter },
        select: { id: true }
      });
      accessibleEntities.forEach((entry) => accessibleEntityTagIds.add(entry.id));
    }
    const accessibleLocationTagIds = new Set<string>();
    if (locationTagIds.length > 0) {
      const locationAccessFilter = await buildLocationAccessFilter(
        user,
        location.worldId,
        campaignId,
        characterId
      );
      const accessibleLocations = await prisma.location.findMany({
        where: { id: { in: locationTagIds }, ...locationAccessFilter },
        select: { id: true }
      });
      accessibleLocations.forEach((entry) => accessibleLocationTagIds.add(entry.id));
    }
  
    res.json(
      visibleNotes.map((note) => {
        const authorBase = note.author.name ?? note.author.email;
        const authorLabel = note.character?.name
          ? `${note.character.name} played by ${authorBase}`
          : authorBase;
        const isArchitectAuthor = architectIds.has(note.authorId);
        const isGmAuthor = note.campaignId
          ? campaignGmMap.get(note.campaignId) === note.authorId
          : false;
        const authorRoleLabel =
          note.visibility === NoteVisibility.GM
            ? "GM"
            : note.visibility === NoteVisibility.SHARED
              ? isArchitectAuthor
                ? "Architect"
                : isGmAuthor
                  ? "GM"
                  : null
              : null;
  
        return {
          id: note.id,
          body: note.body,
          visibility: note.visibility,
          shareWithArchitect: note.shareWithArchitect,
          shareCharacterIds: note.shares.map((share) => share.characterId),
          createdAt: note.createdAt,
          author: note.author,
          authorLabel,
          authorRoleLabel,
          tags: note.tags.map((tag) => ({
            id: tag.id,
            tagType: tag.tagType,
            targetId: tag.targetId,
            label: tag.label,
            canAccess:
              tag.tagType === NoteTagType.ENTITY
                ? accessibleEntityTagIds.has(tag.targetId)
                : tag.tagType === NoteTagType.LOCATION
                  ? accessibleLocationTagIds.has(tag.targetId)
                  : false
          }))
        };
      })
    );
  });

  app.get("/api/locations/:id/mentions", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId =
      typeof req.query.characterId === "string" ? req.query.characterId : undefined;
  
    const location = await prisma.location.findUnique({
      where: { id },
      select: { id: true, worldId: true }
    });
    if (!location) {
      res.status(404).json({ error: "Location not found." });
      return;
    }
  
    const locationAccessFilter = await buildLocationAccessFilter(
      user,
      location.worldId,
      campaignId,
      characterId
    );
    const entityAccessFilter = await buildEntityAccessFilter(
      user,
      location.worldId,
      campaignId,
      characterId
    );
    const canRead = await prisma.location.findFirst({
      where: { id, ...locationAccessFilter },
      select: { id: true }
    });
    if (!canRead) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const isAdminUser = isAdmin(user);
    const isArchitect = await isWorldArchitect(user.id, location.worldId);
    const isWorldGmFlag = await isWorldGameMaster(user.id, location.worldId);
    const isContextCampaignGm = campaignId ? await isCampaignGm(user.id, campaignId) : false;
  
    const baseWhere: Prisma.NoteWhereInput = {
      campaignId: campaignId ?? null,
      tags: { some: { tagType: NoteTagType.LOCATION, targetId: id } },
      OR: [{ entity: entityAccessFilter }, { location: locationAccessFilter }]
    };
  
    const notes = await prisma.note.findMany({
      where: baseWhere,
      include: {
        author: { select: { id: true, name: true, email: true } },
        character: { select: { id: true, name: true } },
        tags: true,
        shares: { select: { characterId: true } },
        entity: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: "desc" }
    });
  
    const playerCharacterIds = campaignId
      ? await prisma.characterCampaign.findMany({
          where: { campaignId, character: { playerId: user.id } },
          select: { characterId: true }
        })
      : [];
    const playerCharacterIdSet = new Set(playerCharacterIds.map((entry) => entry.characterId));
  
    const canSeePrivate = isAdminUser || isArchitect || isWorldGmFlag;
    const visibleNotes = notes.filter((note) => {
      if (isAdminUser) return true;
      if (note.visibility === NoteVisibility.GM) {
        if (!campaignId) return false;
        if (isContextCampaignGm) return true;
        if (note.shareWithArchitect && isArchitect) return true;
        if (note.shares.some((share) => playerCharacterIdSet.has(share.characterId))) {
          return true;
        }
        return false;
      }
      if (note.visibility === NoteVisibility.SHARED) return true;
      if (note.authorId === user.id) return true;
      if (campaignId && isContextCampaignGm) return true;
      if (canSeePrivate) return true;
      return false;
    });
  
    const world = await prisma.world.findUnique({
      where: { id: location.worldId },
      select: {
        primaryArchitectId: true,
        architects: { select: { userId: true } }
      }
    });
    const architectIds = new Set<string>(
      world
        ? [world.primaryArchitectId, ...world.architects.map((entry) => entry.userId)]
        : []
    );
    const campaignIds = Array.from(
      new Set(visibleNotes.map((note) => note.campaignId).filter(Boolean))
    ) as string[];
    const campaigns = campaignIds.length
      ? await prisma.campaign.findMany({
          where: { id: { in: campaignIds } },
          select: { id: true, gmUserId: true }
        })
      : [];
    const campaignGmMap = new Map(campaigns.map((campaign) => [campaign.id, campaign.gmUserId]));
  
    const entityTagIds = Array.from(
      new Set(
        visibleNotes
          .flatMap((note) => note.tags)
          .filter((tag) => tag.tagType === NoteTagType.ENTITY)
          .map((tag) => tag.targetId)
      )
    );
    const locationTagIds = Array.from(
      new Set(
        visibleNotes
          .flatMap((note) => note.tags)
          .filter((tag) => tag.tagType === NoteTagType.LOCATION)
          .map((tag) => tag.targetId)
      )
    );
  
    const accessibleEntityTagIds = new Set<string>();
    if (entityTagIds.length > 0) {
      const entityAccessFilter = await buildEntityAccessFilter(
        user,
        location.worldId,
        campaignId,
        characterId
      );
      const accessibleEntities = await prisma.entity.findMany({
        where: { id: { in: entityTagIds }, ...entityAccessFilter },
        select: { id: true }
      });
      accessibleEntities.forEach((entry) => accessibleEntityTagIds.add(entry.id));
    }
    const accessibleLocationTagIds = new Set<string>();
    if (locationTagIds.length > 0) {
      const locAccessFilter = await buildLocationAccessFilter(
        user,
        location.worldId,
        campaignId,
        characterId
      );
      const accessibleLocations = await prisma.location.findMany({
        where: { id: { in: locationTagIds }, ...locAccessFilter },
        select: { id: true }
      });
      accessibleLocations.forEach((entry) => accessibleLocationTagIds.add(entry.id));
    }
  
    res.json(
      visibleNotes.map((note) => {
        const authorBase = note.author.name ?? note.author.email;
        const authorLabel = note.character?.name
          ? `${note.character.name} played by ${authorBase}`
          : authorBase;
        const isArchitectAuthor = architectIds.has(note.authorId);
        const isGmAuthor = note.campaignId
          ? campaignGmMap.get(note.campaignId) === note.authorId
          : false;
        const authorRoleLabel =
          note.visibility === NoteVisibility.GM
            ? "GM"
            : note.visibility === NoteVisibility.SHARED
              ? isArchitectAuthor
                ? "Architect"
                : isGmAuthor
                  ? "GM"
                  : null
              : null;
  
        return {
          id: note.id,
          body: note.body,
          visibility: note.visibility,
          shareWithArchitect: note.shareWithArchitect,
          shareCharacterIds: note.shares.map((share) => share.characterId),
          createdAt: note.createdAt,
          author: note.author,
          authorLabel,
          authorRoleLabel,
          entity: note.entity,
          location: note.location,
          tags: note.tags.map((tag) => ({
            id: tag.id,
            tagType: tag.tagType,
            targetId: tag.targetId,
            label: tag.label,
            canAccess:
              tag.tagType === NoteTagType.ENTITY
                ? accessibleEntityTagIds.has(tag.targetId)
                : tag.tagType === NoteTagType.LOCATION
                  ? accessibleLocationTagIds.has(tag.targetId)
                  : false
          }))
        };
      })
    );
  });

  app.post("/api/locations/:id/notes", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const { body, visibility, campaignId, characterId, shareWithArchitect, shareCharacterIds } =
      req.body as {
        body?: string;
        visibility?: string;
        campaignId?: string | null;
        characterId?: string | null;
        shareWithArchitect?: boolean;
        shareCharacterIds?: string[];
      };
  
    if (!body || body.trim() === "") {
      res.status(400).json({ error: "Note body is required." });
      return;
    }
  
    const location = await prisma.location.findUnique({
      where: { id },
      select: { id: true, worldId: true }
    });
    if (!location) {
      res.status(404).json({ error: "Location not found." });
      return;
    }
  
    const accessFilter = await buildLocationAccessFilter(
      user,
      location.worldId,
      campaignId ?? undefined,
      characterId ?? undefined
    );
    const canRead = await prisma.location.findFirst({
      where: { id, ...accessFilter },
      select: { id: true }
    });
    if (!canRead) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const resolvedVisibility =
      visibility === "PRIVATE" || visibility === "SHARED" || visibility === "GM"
        ? (visibility as NoteVisibility)
        : NoteVisibility.SHARED;
  
    if (resolvedVisibility === NoteVisibility.SHARED && !campaignId) {
      res.status(400).json({ error: "Shared notes require a campaign context." });
      return;
    }
    if (resolvedVisibility === NoteVisibility.GM && !campaignId) {
      res.status(400).json({ error: "GM notes require a campaign context." });
      return;
    }
  
    const campaign = campaignId
      ? await prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { id: true, worldId: true, gmUserId: true }
        })
      : null;
    if (campaignId && !campaign) {
      res.status(400).json({ error: "Campaign not found." });
      return;
    }
    if (campaign && campaign.worldId !== location.worldId) {
      res.status(400).json({ error: "Campaign world mismatch." });
      return;
    }
  
    const character = characterId
      ? await prisma.character.findUnique({
          where: { id: characterId },
          select: { id: true, worldId: true, playerId: true }
        })
      : null;
    if (characterId && !character) {
      res.status(400).json({ error: "Character not found." });
      return;
    }
    if (character && character.worldId !== location.worldId) {
      res.status(400).json({ error: "Character world mismatch." });
      return;
    }
  
    if (campaignId && characterId) {
      const inCampaign = await prisma.characterCampaign.findFirst({
        where: { campaignId, characterId }
      });
      if (!inCampaign) {
        res.status(400).json({ error: "Character is not in the campaign." });
        return;
      }
    }
  
    const isArchitect = await isWorldArchitect(user.id, location.worldId);
    const isWorldGmFlag = await isWorldGameMaster(user.id, location.worldId);
    const isCampaignGmFlag = campaignId ? campaign?.gmUserId === user.id : false;
    const canAuthor = isAdmin(user) || isArchitect || isWorldGmFlag || isCampaignGmFlag;
  
    if (!campaignId && !isAdmin(user) && !isArchitect) {
      res.status(403).json({ error: "Campaign context required." });
      return;
    }
  
    if (!canAuthor) {
      if (!character || !campaignId || character.playerId !== user.id) {
        res.status(403).json({ error: "Player context required." });
        return;
      }
    }
  
    if (resolvedVisibility === NoteVisibility.GM && !isCampaignGmFlag) {
      res.status(403).json({ error: "Only the campaign GM can write GM notes." });
      return;
    }
  
    const shareCharacterIdList = Array.isArray(shareCharacterIds)
      ? shareCharacterIds.filter(Boolean)
      : [];
    if (resolvedVisibility !== NoteVisibility.GM) {
      if (shareCharacterIdList.length > 0) {
        res.status(400).json({ error: "GM note sharing is not available for this note." });
        return;
      }
    }
  
    if (resolvedVisibility === NoteVisibility.GM && shareCharacterIdList.length > 0) {
      const campaignCharacters = await prisma.characterCampaign.findMany({
        where: { campaignId: campaignId as string, characterId: { in: shareCharacterIdList } },
        select: { characterId: true }
      });
      const allowed = new Set(campaignCharacters.map((entry) => entry.characterId));
      const missing = shareCharacterIdList.filter((entry) => !allowed.has(entry));
      if (missing.length > 0) {
        res.status(400).json({ error: "One or more shared characters are not in the campaign." });
        return;
      }
    }
  
    const tags = extractNoteTags(body);
    const entityTagIds = tags
      .filter((tag) => tag.tagType === NoteTagType.ENTITY)
      .map((tag) => tag.targetId);
    const locationTagIds = tags
      .filter((tag) => tag.tagType === NoteTagType.LOCATION)
      .map((tag) => tag.targetId);
  
    if (entityTagIds.length > 0) {
      const entityAccessFilter = await buildEntityAccessFilter(
        user,
        location.worldId,
        campaignId ?? undefined,
        characterId ?? undefined
      );
      const accessibleEntities = await prisma.entity.findMany({
        where: { id: { in: entityTagIds }, ...entityAccessFilter },
        select: { id: true }
      });
      const accessibleIds = new Set(accessibleEntities.map((entry) => entry.id));
      const missing = entityTagIds.filter((targetId) => !accessibleIds.has(targetId));
      if (missing.length > 0) {
        res.status(400).json({ error: "One or more tagged entities are not accessible." });
        return;
      }
    }
    if (locationTagIds.length > 0) {
      const locationAccessFilter = await buildLocationAccessFilter(
        user,
        location.worldId,
        campaignId ?? undefined,
        characterId ?? undefined
      );
      const accessibleLocations = await prisma.location.findMany({
        where: { id: { in: locationTagIds }, ...locationAccessFilter },
        select: { id: true }
      });
      const accessibleIds = new Set(accessibleLocations.map((entry) => entry.id));
      const missing = locationTagIds.filter((targetId) => !accessibleIds.has(targetId));
      if (missing.length > 0) {
        res.status(400).json({ error: "One or more tagged locations are not accessible." });
        return;
      }
    }
  
    const created = await prisma.$transaction(async (tx) => {
      const note = await tx.note.create({
        data: {
          locationId: id,
          authorId: user.id,
          campaignId: campaignId ?? null,
          characterId: characterId ?? null,
          visibility: resolvedVisibility,
          shareWithArchitect:
            resolvedVisibility === NoteVisibility.GM ? Boolean(shareWithArchitect) : false,
          body
        },
        include: {
          author: { select: { id: true, name: true, email: true } },
          character: { select: { id: true, name: true } }
        }
      });
  
      if (tags.length > 0) {
        await tx.noteTag.createMany({
          data: tags.map((tag) => ({
            noteId: note.id,
            tagType: tag.tagType,
            targetId: tag.targetId,
            label: tag.label
          }))
        });
      }
  
      if (resolvedVisibility === NoteVisibility.GM && shareCharacterIdList.length > 0) {
        await tx.noteShare.createMany({
          data: shareCharacterIdList.map((characterId) => ({
            noteId: note.id,
            characterId
          })),
          skipDuplicates: true
        });
      }
  
      return note;
    });
  
    const noteTags = await prisma.noteTag.findMany({ where: { noteId: created.id } });
    const noteShares = await prisma.noteShare.findMany({
      where: { noteId: created.id },
      select: { characterId: true }
    });
  
    const authorBase = created.author.name ?? created.author.email;
    const authorLabel = created.character?.name
      ? `${created.character.name} played by ${authorBase}`
      : authorBase;
    const authorRoleLabel =
      created.visibility === NoteVisibility.GM
        ? "GM"
        : created.visibility === NoteVisibility.SHARED
          ? isArchitect
            ? "Architect"
            : isCampaignGmFlag
              ? "GM"
              : null
          : null;
  
    res.status(201).json({
      id: created.id,
      body: created.body,
      visibility: created.visibility,
      shareWithArchitect: created.shareWithArchitect,
      shareCharacterIds: noteShares.map((share) => share.characterId),
      createdAt: created.createdAt,
      author: created.author,
      authorLabel,
      authorRoleLabel,
      tags: noteTags.map((tag) => ({
        id: tag.id,
        tagType: tag.tagType,
        targetId: tag.targetId,
        label: tag.label,
        canAccess: true
      }))
    });
  });

};

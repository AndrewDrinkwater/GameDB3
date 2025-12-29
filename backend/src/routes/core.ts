import express from "express";
import { Prisma, EntityAccessScope, EntityAccessType, SystemViewType } from "@prisma/client";
import { prisma, requireAuth, requireSystemAdmin, isAdmin, ensureSeededView, relatedListSeeds, ensureSeededRelatedList, canAccessCampaign, canAccessWorld, isWorldArchitect, isWorldGameMaster, isWorldGm, canManageCampaign, canAccessEntityType, canManageEntityType, canAccessLocationType, canManageLocationType, canCreateCampaign, canCreateCharacterInWorld, canCreateEntityInWorld, canCreateLocationInWorld, canCreateCharacterInCampaign, buildLocationAccessFilter, isCampaignGm, getLabelFieldForEntity, canWriteEntity, canWriteLocation, getReferenceResults } from "../lib/helpers";
import type { AuthRequest, ListViewFilterRule, ListViewFilterGroup } from "../lib/helpers";
import { getAllowedLocationParentTypeIds } from "./shared";

export const registerCoreRoutes = (app: express.Express) => {
  app.get("/api/choices", requireAuth, async (req, res) => {
    const listKey = typeof req.query.listKey === "string" ? req.query.listKey : undefined;
    if (!listKey) {
      res.status(400).json({ error: "listKey is required." });
      return;
    }
  
    let choices = await prisma.systemChoice.findMany({
      where: { listKey, isActive: true },
      orderBy: { sortOrder: "asc" }
    });
  
    if (choices.length === 0) {
      const defaults: Record<
        string,
        Array<{ value: string; label: string; sortOrder: number }>
      > = {
        entity_field_type: [
          { value: "TEXT", label: "Single line text", sortOrder: 1 },
          { value: "TEXTAREA", label: "Multi line text", sortOrder: 2 },
          { value: "BOOLEAN", label: "Boolean", sortOrder: 3 },
          { value: "CHOICE", label: "Choice", sortOrder: 4 },
          { value: "ENTITY_REFERENCE", label: "Reference (Entity)", sortOrder: 5 },
          { value: "LOCATION_REFERENCE", label: "Reference (Location)", sortOrder: 6 }
        ],
        world_entity_permission: [
          { value: "ARCHITECT", label: "Architects only", sortOrder: 1 },
          { value: "ARCHITECT_GM", label: "Architects and GMs", sortOrder: 2 },
          { value: "ARCHITECT_GM_PLAYER", label: "Architects, GMs, and Players", sortOrder: 3 }
        ],
        location_status: [
          { value: "ACTIVE", label: "Active", sortOrder: 1 },
          { value: "INACTIVE", label: "Inactive", sortOrder: 2 }
        ],
        pack_posture: [
          { value: "opinionated", label: "Opinionated", sortOrder: 1 },
          { value: "minimal", label: "Minimal", sortOrder: 2 }
        ],
        location_field_type: [
          { value: "TEXT", label: "Single line text", sortOrder: 1 },
          { value: "TEXTAREA", label: "Multi line text", sortOrder: 2 },
          { value: "NUMBER", label: "Number", sortOrder: 3 },
          { value: "BOOLEAN", label: "Boolean", sortOrder: 4 },
          { value: "CHOICE", label: "Choice", sortOrder: 5 },
          { value: "ENTITY_REFERENCE", label: "Reference (Entity)", sortOrder: 6 },
          { value: "LOCATION_REFERENCE", label: "Reference (Location)", sortOrder: 7 }
        ]
      };
  
      const seed = defaults[listKey];
      if (seed) {
        await prisma.systemChoice.createMany({
          data: seed.map((entry) => ({
            listKey,
            value: entry.value,
            label: entry.label,
            sortOrder: entry.sortOrder,
            isActive: true
          })),
          skipDuplicates: true
        });
        choices = await prisma.systemChoice.findMany({
          where: { listKey, isActive: true },
          orderBy: { sortOrder: "asc" }
        });
      }
    }
  
    res.json(choices);
  });

  app.get("/api/views", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const views = await prisma.systemView.findMany({
      where: isAdmin(user) ? {} : { adminOnly: false },
      include: { fields: true },
      orderBy: { title: "asc" }
    });
  
    res.json(views);
  });

  app.get("/api/views/:key", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const view = await prisma.systemView.findUnique({
      where: { key: req.params.key },
      include: { fields: true }
    });
  
    if (!view) {
      const seeded = await ensureSeededView(req.params.key);
      if (!seeded) {
        res.status(404).json({ error: "View not found." });
        return;
      }
      if (seeded.adminOnly && !isAdmin(user)) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      res.json(seeded);
      return;
    }
  
    if (view.adminOnly && !isAdmin(user)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    if (view.entityKey === "campaigns") {
      const fields = view.fields.map((field) => {
        if (field.fieldKey === "gmUserId" && !field.referenceScope) {
          return { ...field, referenceScope: "world_gm" };
        }
        return field;
      });
      res.json({ ...view, fields });
      return;
    }
  
    res.json(view);
  });

  app.get("/api/list-view-preferences", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const viewKey = typeof req.query.viewKey === "string" ? req.query.viewKey : undefined;
    const entityTypeId =
      typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : null;
  
    if (!viewKey) {
      res.status(400).json({ error: "viewKey is required." });
      return;
    }
  
    const preference = await prisma.userListViewPreference.findFirst({
      where: { userId: user.id, viewKey, entityTypeId }
    });
  
    const defaults = entityTypeId
      ? await prisma.entityTypeListViewDefault.findUnique({
          where: { entityTypeId }
        })
      : null;
  
    res.json({
      user: preference,
      defaults
    });
  });

  app.put("/api/list-view-preferences", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const viewKey = typeof req.query.viewKey === "string" ? req.query.viewKey : undefined;
    const entityTypeId =
      typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : null;
  
    if (!viewKey) {
      res.status(400).json({ error: "viewKey is required." });
      return;
    }
  
    const { columns, filters } = req.body as {
      columns?: string[];
      filters?: ListViewFilterRule[] | ListViewFilterGroup;
    };
  
    const columnsJson = columns ? (columns as Prisma.InputJsonValue) : undefined;
    const filtersJson = filters ? (filters as Prisma.InputJsonValue) : undefined;
  
    let preference;
    if (entityTypeId) {
      preference = await prisma.userListViewPreference.upsert({
        where: { userId_viewKey_entityTypeId: { userId: user.id, viewKey, entityTypeId } },
        update: {
          columnsJson,
          filtersJson
        },
        create: {
          userId: user.id,
          viewKey,
          entityTypeId,
          columnsJson,
          filtersJson
        }
      });
    } else {
      const existing = await prisma.userListViewPreference.findFirst({
        where: { userId: user.id, viewKey, entityTypeId: null }
      });
  
      preference = existing
        ? await prisma.userListViewPreference.update({
            where: { id: existing.id },
            data: { columnsJson, filtersJson }
          })
        : await prisma.userListViewPreference.create({
            data: { userId: user.id, viewKey, entityTypeId: null, columnsJson, filtersJson }
          });
    }
  
    res.json(preference);
  });

  app.delete("/api/list-view-preferences", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const viewKey = typeof req.query.viewKey === "string" ? req.query.viewKey : undefined;
    const entityTypeId =
      typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : null;
  
    if (!viewKey) {
      res.status(400).json({ error: "viewKey is required." });
      return;
    }
  
    await prisma.userListViewPreference.deleteMany({
      where: { userId: user.id, viewKey, entityTypeId }
    });
  
    res.json({ ok: true });
  });

  app.get("/api/entity-type-list-defaults", requireAuth, requireSystemAdmin, async (req, res) => {
    const entityTypeId =
      typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : undefined;
    if (!entityTypeId) {
      res.status(400).json({ error: "entityTypeId is required." });
      return;
    }
  
    const defaults = await prisma.entityTypeListViewDefault.findUnique({
      where: { entityTypeId }
    });
  
    res.json(defaults);
  });

  app.put("/api/entity-type-list-defaults", requireAuth, requireSystemAdmin, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const entityTypeId =
      typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : undefined;
    if (!entityTypeId) {
      res.status(400).json({ error: "entityTypeId is required." });
      return;
    }
  
    const { columns, filters } = req.body as {
      columns?: string[];
      filters?: ListViewFilterRule[] | ListViewFilterGroup;
    };
  
    const columnsJson = columns ? (columns as Prisma.InputJsonValue) : undefined;
    const filtersJson = filters ? (filters as Prisma.InputJsonValue) : undefined;
  
    const defaults = await prisma.entityTypeListViewDefault.upsert({
      where: { entityTypeId },
      update: {
        columnsJson,
        filtersJson,
        updatedById: user.id
      },
      create: {
        entityTypeId,
        columnsJson,
        filtersJson,
        updatedById: user.id
      }
    });
  
    res.json(defaults);
  });

  app.get("/api/related-lists", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const entityKey = typeof req.query.entityKey === "string" ? req.query.entityKey : undefined;
    if (!entityKey) {
      res.status(400).json({ error: "entityKey is required." });
      return;
    }
  
    if (entityKey === "worlds") {
      await ensureSeededRelatedList("world.game_masters");
      await ensureSeededRelatedList("world.character_creators");
    }
    if (entityKey === "campaigns") {
      await ensureSeededRelatedList("campaign.characters");
    }
    if (entityKey === "entity_types") {
      await ensureSeededRelatedList("entity_types.fields");
      await ensureSeededRelatedList("entity_types.relationship_rules_from");
      await ensureSeededRelatedList("entity_types.relationship_rules_to");
    }
    if (entityKey === "location_types") {
      await ensureSeededRelatedList("location_types.parent_rules");
      await ensureSeededRelatedList("location_types.child_rules");
    }
    if (entityKey === "packs") {
      await ensureSeededRelatedList("packs.entity_type_templates");
      await ensureSeededRelatedList("packs.location_type_templates");
      await ensureSeededRelatedList("packs.relationship_type_templates");
    }
  
    const relatedLists = await prisma.systemRelatedList.findMany({
      where: {
        parentEntityKey: entityKey,
        ...(isAdmin(user) ? {} : { adminOnly: false })
      },
      include: {
        fields: { orderBy: { listOrder: "asc" } }
      },
      orderBy: { listOrder: "asc" }
    });
  
    res.json(relatedLists);
  });

  app.get("/api/related-lists/:key", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { key } = req.params;
    const parentId = typeof req.query.parentId === "string" ? req.query.parentId : undefined;
    if (!parentId) {
      res.status(400).json({ error: "parentId is required." });
      return;
    }
  
    let relatedList = await prisma.systemRelatedList.findUnique({
      where: { key },
      include: { fields: { orderBy: { listOrder: "asc" } } }
    });
    if (!relatedList && relatedListSeeds[key]) {
      relatedList = await ensureSeededRelatedList(key);
    }
  
    if (!relatedList) {
      res.status(404).json({ error: "Related list not found." });
      return;
    }
  
    if (relatedList.adminOnly && !isAdmin(user)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    if (relatedList.parentEntityKey === "campaigns") {
      const canAccess = isAdmin(user) || (await canAccessCampaign(user.id, parentId));
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }
  
    if (relatedList.parentEntityKey === "worlds") {
      const canAccess = isAdmin(user) || (await canAccessWorld(user.id, parentId));
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }
  
    if (relatedList.parentEntityKey === "entity_types") {
      const canAccess = isAdmin(user) || (await canAccessEntityType(user.id, parentId));
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }
  
    if (relatedList.parentEntityKey === "location_types") {
      const canAccess = isAdmin(user) || (await canAccessLocationType(user.id, parentId));
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }
  
    const relatedFields = relatedList.fields.filter((field) => field.source === "RELATED");
    const relatedSelect: Record<string, boolean> = { id: true };
    relatedFields.forEach((field) => {
      if (field.fieldKey === "playerName") return;
      relatedSelect[field.fieldKey] = true;
    });
  
    let items: Array<{
      relatedId: string;
      relatedData: Record<string, unknown>;
      joinData: Record<string, unknown>;
    }> = [];
  
    if (relatedList.joinEntityKey === "characterCampaign") {
      const includePlayer = relatedFields.some((field) => field.fieldKey === "playerName");
      const rows = await prisma.characterCampaign.findMany({
        where: { campaignId: parentId },
        include: {
          character: {
            select: {
              ...(relatedSelect as Record<string, true>),
              ...(includePlayer ? { player: { select: { name: true, email: true } } } : {})
            }
          }
        }
      });
  
      items = rows.map((row) => ({
        relatedId: row.characterId,
        relatedData: {
          ...(row.character as Record<string, unknown>),
          ...(includePlayer
            ? {
                playerName:
                  row.character.player?.name ??
                  row.character.player?.email ??
                  "-"
              }
            : {})
        },
        joinData: { status: row.status }
      }));
    }
  
    if (relatedList.joinEntityKey === "worldCharacterCreator") {
      const rows = await prisma.worldCharacterCreator.findMany({
        where: { worldId: parentId },
        include: { user: { select: relatedSelect as Record<string, true> } }
      });
  
      items = rows.map((row) => ({
        relatedId: row.userId,
        relatedData: row.user as Record<string, unknown>,
        joinData: {}
      }));
    }
  
    if (relatedList.joinEntityKey === "worldCampaignCreator") {
      const rows = await prisma.worldCampaignCreator.findMany({
        where: { worldId: parentId },
        include: { user: { select: relatedSelect as Record<string, true> } }
      });
  
      items = rows.map((row) => ({
        relatedId: row.userId,
        relatedData: row.user as Record<string, unknown>,
        joinData: {}
      }));
    }
  
    if (relatedList.joinEntityKey === "worldArchitect") {
      const rows = await prisma.worldArchitect.findMany({
        where: { worldId: parentId },
        include: { user: { select: relatedSelect as Record<string, true> } }
      });
  
      items = rows.map((row) => ({
        relatedId: row.userId,
        relatedData: row.user as Record<string, unknown>,
        joinData: {}
      }));
    }
  
    if (relatedList.joinEntityKey === "worldGameMaster") {
      const rows = await prisma.worldGameMaster.findMany({
        where: { worldId: parentId },
        include: { user: { select: relatedSelect as Record<string, true> } }
      });
  
      items = rows.map((row) => ({
        relatedId: row.userId,
        relatedData: row.user as Record<string, unknown>,
        joinData: {}
      }));
    }
  
    if (relatedList.joinEntityKey === "campaignCharacterCreator") {
      const rows = await prisma.campaignCharacterCreator.findMany({
        where: { campaignId: parentId },
        include: { user: { select: relatedSelect as Record<string, true> } }
      });
  
      items = rows.map((row) => ({
        relatedId: row.userId,
        relatedData: row.user as Record<string, unknown>,
        joinData: {}
      }));
    }
  
    if (relatedList.joinEntityKey === "entityField") {
      const rows = await prisma.entityField.findMany({
        where: { entityTypeId: parentId },
        select: {
          ...(relatedSelect as Record<string, true>),
          id: true
        },
        orderBy: { listOrder: "asc" }
      });
  
      items = rows.map((row) => ({
        relatedId: row.id,
        relatedData: row as Record<string, unknown>,
        joinData: {}
      }));
    }
  
    if (relatedList.joinEntityKey === "packEntityTypeTemplate") {
      const rows = await prisma.entityTypeTemplate.findMany({
        where: { packId: parentId },
        select: {
          ...(relatedSelect as Record<string, true>),
          id: true
        },
        orderBy: { name: "asc" }
      });
  
      items = rows.map((row) => ({
        relatedId: row.id,
        relatedData: row as Record<string, unknown>,
        joinData: {}
      }));
    }
  
    if (relatedList.joinEntityKey === "packLocationTypeTemplate") {
      const rows = await prisma.locationTypeTemplate.findMany({
        where: { packId: parentId },
        select: {
          ...(relatedSelect as Record<string, true>),
          id: true
        },
        orderBy: { name: "asc" }
      });
  
      items = rows.map((row) => ({
        relatedId: row.id,
        relatedData: row as Record<string, unknown>,
        joinData: {}
      }));
    }
  
    if (relatedList.joinEntityKey === "packRelationshipTypeTemplate") {
      const rows = await prisma.relationshipTypeTemplate.findMany({
        where: { packId: parentId },
        select: {
          ...(relatedSelect as Record<string, true>),
          id: true
        },
        orderBy: { name: "asc" }
      });
  
      items = rows.map((row) => ({
        relatedId: row.id,
        relatedData: row as Record<string, unknown>,
        joinData: {}
      }));
    }
  
    if (relatedList.joinEntityKey === "relationshipTypeRuleFrom") {
      const rows = await prisma.relationshipTypeRule.findMany({
        where: { fromEntityTypeId: parentId },
        include: {
          relationshipType: { select: { name: true } },
          toEntityType: { select: { name: true } }
        }
      });
  
      items = rows.map((row) => ({
        relatedId: row.id,
        relatedData: {},
        joinData: {
          relationshipTypeName: row.relationshipType.name,
          toEntityTypeName: row.toEntityType.name
        }
      }));
    }
  
    if (relatedList.joinEntityKey === "relationshipTypeRuleTo") {
      const rows = await prisma.relationshipTypeRule.findMany({
        where: { toEntityTypeId: parentId },
        include: {
          relationshipType: { select: { name: true } },
          fromEntityType: { select: { name: true } }
        }
      });
  
      items = rows.map((row) => ({
        relatedId: row.id,
        relatedData: {},
        joinData: {
          relationshipTypeName: row.relationshipType.name,
          fromEntityTypeName: row.fromEntityType.name
        }
      }));
    }
  
    if (relatedList.joinEntityKey === "locationTypeRuleParent") {
      const rows = await prisma.locationTypeRule.findMany({
        where: { parentTypeId: parentId },
        include: { childType: { select: { name: true } } }
      });
  
      items = rows.map((row) => ({
        relatedId: row.id,
        relatedData: {},
        joinData: {
          childTypeName: row.childType.name,
          allowed: row.allowed
        }
      }));
    }
  
    if (relatedList.joinEntityKey === "locationTypeRuleChild") {
      const rows = await prisma.locationTypeRule.findMany({
        where: { childTypeId: parentId },
        include: { parentType: { select: { name: true } } }
      });
  
      items = rows.map((row) => ({
        relatedId: row.id,
        relatedData: {},
        joinData: {
          parentTypeName: row.parentType.name,
          allowed: row.allowed
        }
      }));
    }
  
    res.json({ items });
  });

  app.post("/api/related-lists/:key", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { key } = req.params;
    const { parentId, relatedId } = req.body as { parentId?: string; relatedId?: string };
  
    if (!parentId || !relatedId) {
      res.status(400).json({ error: "parentId and relatedId are required." });
      return;
    }
  
    let relatedList = await prisma.systemRelatedList.findUnique({ where: { key } });
    if (!relatedList && relatedListSeeds[key]) {
      relatedList = await ensureSeededRelatedList(key);
    }
    if (!relatedList) {
      res.status(404).json({ error: "Related list not found." });
      return;
    }
  
    if (relatedList.adminOnly && !isAdmin(user)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    if (relatedList.parentEntityKey === "campaigns") {
      const canManage = isAdmin(user) || (await canManageCampaign(user.id, parentId));
      if (!canManage) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }
  
    if (relatedList.parentEntityKey === "worlds") {
      const canManage = isAdmin(user) || (await isWorldArchitect(user.id, parentId));
      if (!canManage) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }
  
    if (relatedList.parentEntityKey === "entity_types") {
      const canManage = isAdmin(user) || (await canManageEntityType(user.id, parentId));
      if (!canManage) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }
  
    if (relatedList.parentEntityKey === "location_types") {
      const canManage = isAdmin(user) || (await canManageLocationType(user.id, parentId));
      if (!canManage) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }
  
    if (relatedList.joinEntityKey === "characterCampaign") {
      const campaign = await prisma.campaign.findUnique({
        where: { id: parentId },
        select: { worldId: true }
      });
      const character = await prisma.character.findUnique({
        where: { id: relatedId },
        select: { worldId: true }
      });
  
      if (!campaign || !character || campaign.worldId !== character.worldId) {
        res.status(400).json({ error: "World mismatch." });
        return;
      }
  
      const entry = await prisma.characterCampaign.upsert({
        where: { characterId_campaignId: { characterId: relatedId, campaignId: parentId } },
        update: {},
        create: { characterId: relatedId, campaignId: parentId, status: "ACTIVE" }
      });
      res.status(201).json(entry);
      return;
    }
  
    if (relatedList.joinEntityKey === "worldCharacterCreator") {
      const entry = await prisma.worldCharacterCreator.upsert({
        where: { worldId_userId: { worldId: parentId, userId: relatedId } },
        update: {},
        create: { worldId: parentId, userId: relatedId }
      });
      res.status(201).json(entry);
      return;
    }
  
    if (relatedList.joinEntityKey === "worldCampaignCreator") {
      const entry = await prisma.worldCampaignCreator.upsert({
        where: { worldId_userId: { worldId: parentId, userId: relatedId } },
        update: {},
        create: { worldId: parentId, userId: relatedId }
      });
      res.status(201).json(entry);
      return;
    }
  
    if (relatedList.joinEntityKey === "worldArchitect") {
      const entry = await prisma.worldArchitect.upsert({
        where: { worldId_userId: { worldId: parentId, userId: relatedId } },
        update: {},
        create: { worldId: parentId, userId: relatedId }
      });
      res.status(201).json(entry);
      return;
    }
  
    if (relatedList.joinEntityKey === "worldGameMaster") {
      const canManage = isAdmin(user) || (await isWorldArchitect(user.id, parentId));
      if (!canManage) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      const entry = await prisma.worldGameMaster.upsert({
        where: { worldId_userId: { worldId: parentId, userId: relatedId } },
        update: {},
        create: { worldId: parentId, userId: relatedId }
      });
      res.status(201).json(entry);
      return;
    }
  
    if (relatedList.joinEntityKey === "campaignCharacterCreator") {
      const entry = await prisma.campaignCharacterCreator.upsert({
        where: { campaignId_userId: { campaignId: parentId, userId: relatedId } },
        update: {},
        create: { campaignId: parentId, userId: relatedId }
      });
      res.status(201).json(entry);
      return;
    }
  
    if (relatedList.joinEntityKey === "entityField") {
      res.status(400).json({ error: "Use /api/entity-fields to create fields." });
      return;
    }
  
    res.status(400).json({ error: "Unsupported related list." });
  });

  app.delete("/api/related-lists/:key", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { key } = req.params;
    const { parentId, relatedId } = req.body as { parentId?: string; relatedId?: string };
  
    if (!parentId || !relatedId) {
      res.status(400).json({ error: "parentId and relatedId are required." });
      return;
    }
  
    let relatedList = await prisma.systemRelatedList.findUnique({ where: { key } });
    if (!relatedList && relatedListSeeds[key]) {
      relatedList = await ensureSeededRelatedList(key);
    }
    if (!relatedList) {
      res.status(404).json({ error: "Related list not found." });
      return;
    }
  
    if (relatedList.adminOnly && !isAdmin(user)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    if (relatedList.parentEntityKey === "campaigns") {
      const canManage = isAdmin(user) || (await canManageCampaign(user.id, parentId));
      if (!canManage) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }
  
    if (relatedList.parentEntityKey === "worlds") {
      const canManage = isAdmin(user) || (await isWorldArchitect(user.id, parentId));
      if (!canManage) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }
  
    if (relatedList.parentEntityKey === "entity_types") {
      const canManage = isAdmin(user) || (await canManageEntityType(user.id, parentId));
      if (!canManage) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }
  
    if (relatedList.parentEntityKey === "location_types") {
      const canManage = isAdmin(user) || (await canManageLocationType(user.id, parentId));
      if (!canManage) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }
  
    if (relatedList.joinEntityKey === "characterCampaign") {
      await prisma.characterCampaign.delete({
        where: { characterId_campaignId: { characterId: relatedId, campaignId: parentId } }
      });
      res.json({ ok: true });
      return;
    }
  
    if (relatedList.joinEntityKey === "worldCharacterCreator") {
      await prisma.worldCharacterCreator.delete({
        where: { worldId_userId: { worldId: parentId, userId: relatedId } }
      });
      res.json({ ok: true });
      return;
    }
  
    if (relatedList.joinEntityKey === "worldCampaignCreator") {
      await prisma.worldCampaignCreator.delete({
        where: { worldId_userId: { worldId: parentId, userId: relatedId } }
      });
      res.json({ ok: true });
      return;
    }
  
    if (relatedList.joinEntityKey === "worldArchitect") {
      await prisma.worldArchitect.delete({
        where: { worldId_userId: { worldId: parentId, userId: relatedId } }
      });
      res.json({ ok: true });
      return;
    }
  
    if (relatedList.joinEntityKey === "worldGameMaster") {
      const canManage = isAdmin(user) || (await isWorldArchitect(user.id, parentId));
      if (!canManage) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      await prisma.worldGameMaster.delete({
        where: { worldId_userId: { worldId: parentId, userId: relatedId } }
      });
      res.json({ ok: true });
      return;
    }
  
    if (relatedList.joinEntityKey === "campaignCharacterCreator") {
      await prisma.campaignCharacterCreator.delete({
        where: { campaignId_userId: { campaignId: parentId, userId: relatedId } }
      });
      res.json({ ok: true });
      return;
    }
  
    if (relatedList.joinEntityKey === "entityField") {
      const existing = await prisma.entityField.findFirst({
        where: { id: relatedId, entityTypeId: parentId },
        select: { id: true }
      });
      if (!existing) {
        res.status(404).json({ error: "Field not found." });
        return;
      }
      await prisma.entityField.delete({ where: { id: relatedId } });
      res.json({ ok: true });
      return;
    }
  
    res.status(400).json({ error: "Unsupported related list." });
  });

  app.get("/api/references", requireAuth, async (req, res) => {
    const entityKey = typeof req.query.entityKey === "string" ? req.query.entityKey : undefined;
    const query = typeof req.query.query === "string" ? req.query.query : undefined;
    const idsParam = typeof req.query.ids === "string" ? req.query.ids : undefined;
    const scope = typeof req.query.scope === "string" ? req.query.scope : undefined;
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
    const entityTypeId = typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : undefined;
    const entityTypeIdsParam =
      typeof req.query.entityTypeIds === "string" ? req.query.entityTypeIds : undefined;
    const includeEntityTypeId =
      typeof req.query.includeEntityTypeId === "string"
        ? req.query.includeEntityTypeId.toLowerCase() === "true" ||
          req.query.includeEntityTypeId === "1"
        : false;
    const locationTypeId =
      typeof req.query.locationTypeId === "string" ? req.query.locationTypeId : undefined;
  
    if (!entityKey) {
      res.status(400).json({ error: "entityKey is required." });
      return;
    }
  
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const adminOnlyEntities = new Set([
      "packs",
      "entity_type_templates",
      "entity_type_template_fields",
      "location_type_templates",
      "location_type_template_fields",
      "location_type_rule_templates",
      "relationship_type_templates",
      "relationship_type_template_roles"
    ]);
    if (adminOnlyEntities.has(entityKey) && !isAdmin(user)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const ids = idsParam ? idsParam.split(",").map((id) => id.trim()).filter(Boolean) : undefined;
    const queryValue = query?.trim();
  
    if (entityKey === "campaigns") {
      const labelField = await getLabelFieldForEntity(entityKey);
      const baseClause: Prisma.CampaignWhereInput = ids
        ? { id: { in: ids } }
        : queryValue
          ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
          : {};
  
      const filters: Prisma.CampaignWhereInput[] = [baseClause];
      if (worldId) filters.push({ worldId });
      if (characterId) {
        filters.push({ roster: { some: { characterId } } });
      }
  
        if (user && !isAdmin(user)) {
          filters.push({
            OR: [
              { gmUserId: user.id },
              { createdById: user.id },
              { world: { primaryArchitectId: user.id } },
              { world: { architects: { some: { userId: user.id } } } },
              { roster: { some: { character: { playerId: user.id } } } }
            ]
          });
        }
  
      const whereClause: Prisma.CampaignWhereInput =
        filters.length > 1 ? { AND: filters } : baseClause;
  
      const select: Record<string, boolean> = { id: true };
      select[labelField] = true;
  
      const campaigns = await prisma.campaign.findMany({
        where: whereClause,
        select: select as Record<string, true>,
        orderBy: { name: "asc" },
        take: 25
      });
  
      const results = campaigns.map((campaign) => {
        const labelValue = (campaign as Record<string, unknown>)[labelField];
        return {
          id: campaign.id,
          label: labelValue ? String(labelValue) : campaign.id
        };
      });
  
      res.json(results);
      return;
    }
  
      if (entityKey === "characters") {
        const labelField = await getLabelFieldForEntity(entityKey);
        const baseClause: Prisma.CharacterWhereInput = ids
          ? { id: { in: ids } }
          : queryValue
            ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
            : {};
  
        const campaign =
          campaignId
            ? await prisma.campaign.findUnique({
                where: { id: campaignId },
                select: { worldId: true, gmUserId: true }
              })
            : null;
        const isCampaignGm = Boolean(campaign && campaign.gmUserId === user.id);
        const isCampaignWorldArchitect =
          Boolean(campaign && (await isWorldArchitect(user.id, campaign.worldId)));
        const expandCampaignScope = Boolean(
          campaign && (isAdmin(user) || isCampaignGm || isCampaignWorldArchitect)
        );
  
        const filters: Prisma.CharacterWhereInput[] = [baseClause];
        if (expandCampaignScope && campaign) {
          filters.push({ worldId: campaign.worldId });
        } else {
          if (worldId) filters.push({ worldId });
          if (campaignId) {
            filters.push({ campaigns: { some: { campaignId } } });
          }
        }
  
        if (user && !isAdmin(user)) {
          const restrictToOwn =
            Boolean(campaignId) && !isCampaignGm;
          if (restrictToOwn) {
            filters.push({ playerId: user.id });
          } else {
            const orFilters: Prisma.CharacterWhereInput[] = [
              { playerId: user.id },
              { world: { primaryArchitectId: user.id } },
              { world: { architects: { some: { userId: user.id } } } },
              { campaigns: { some: { campaign: { gmUserId: user.id } } } }
            ];
            if (isCampaignGm && campaign) {
              orFilters.push({ worldId: campaign.worldId });
            }
            filters.push({ OR: orFilters });
          }
        }
  
      const whereClause: Prisma.CharacterWhereInput =
        filters.length > 1 ? { AND: filters } : baseClause;
  
      const characters = await prisma.character.findMany({
        where: whereClause,
        include: {
          player: { select: { name: true, email: true, id: true } },
          world: { select: { primaryArchitectId: true, architects: { select: { userId: true } } } },
          campaigns: { select: { campaign: { select: { gmUserId: true } } } }
        },
        orderBy: { name: "asc" },
        take: 25
      });
  
        const results = characters.map((character) => {
          const labelValue = (character as Record<string, unknown>)[labelField];
          const canSeeOwner =
            isAdmin(user) ||
            isCampaignGm ||
            character.world.primaryArchitectId === user.id ||
            character.world.architects.some((entry) => entry.userId === user.id) ||
            character.campaigns.some((entry) => entry.campaign.gmUserId === user.id);
        const ownerLabel = canSeeOwner
          ? character.player.name ?? character.player.email ?? character.player.id
          : undefined;
        return {
          id: character.id,
          label: labelValue ? String(labelValue) : character.id,
          ownerLabel
        };
      });
  
      res.json(results);
      return;
    }
  
    if (entityKey === "entity_fields") {
      const labelField = await getLabelFieldForEntity(entityKey);
      const baseClause: Prisma.EntityFieldWhereInput = ids
        ? { id: { in: ids } }
        : queryValue
          ? { label: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
          : {};
  
      const filters: Prisma.EntityFieldWhereInput[] = [baseClause];
      if (worldId) {
        if (!isAdmin(user) && !(await isWorldArchitect(user.id, worldId))) {
          res.status(403).json({ error: "Forbidden." });
          return;
        }
        filters.push({ entityType: { worldId } });
      } else if (!isAdmin(user) && !ids) {
        res.json([]);
        return;
      }
  
      const whereClause: Prisma.EntityFieldWhereInput =
        filters.length > 1 ? { AND: filters } : baseClause;
  
      const select: Record<string, boolean> = { id: true };
      select[labelField] = true;
  
      const fields = await prisma.entityField.findMany({
        where: whereClause,
        select: select as Record<string, true>,
        orderBy: { label: "asc" },
        take: 25
      });
  
      const results = fields.map((field) => {
        const labelValue = (field as Record<string, unknown>)[labelField];
        return {
          id: field.id,
          label: labelValue ? String(labelValue) : field.id
        };
      });
  
      res.json(results);
      return;
    }
  
    if (entityKey === "entity_types") {
      const labelField = await getLabelFieldForEntity(entityKey);
      const baseClause: Prisma.EntityTypeWhereInput = ids
        ? { id: { in: ids } }
        : queryValue
          ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
          : {};
  
      const filters: Prisma.EntityTypeWhereInput[] = [baseClause];
      if (scope === "entity_type") {
        if (worldId) {
          filters.push({ worldId });
        } else if (!isAdmin(user)) {
          res.json([]);
          return;
        }
      }
  
      if (scope === "entity_type_source") {
        if (!isAdmin(user)) {
          filters.push({ isTemplate: true });
        }
      }
  
      if (!scope && !ids && !isAdmin(user)) {
        filters.push({
          OR: [
            { isTemplate: true },
            {
              world: {
                OR: [
                  { primaryArchitectId: user.id },
                  { architects: { some: { userId: user.id } } }
                ]
              }
            }
          ]
        });
      }
  
      const whereClause: Prisma.EntityTypeWhereInput =
        filters.length > 1 ? { AND: filters } : baseClause;
  
      const select: Record<string, boolean> = { id: true };
      select[labelField] = true;
  
      const types = await prisma.entityType.findMany({
        where: whereClause,
        select: select as Record<string, true>,
        orderBy: { name: "asc" },
        take: 25
      });
  
      const results = types.map((entityType) => {
        const labelValue = (entityType as Record<string, unknown>)[labelField];
        return {
          id: entityType.id,
          label: labelValue ? String(labelValue) : entityType.id
        };
      });
  
      res.json(results);
      return;
    }

    if (entityKey === "relationship_types") {
      const labelField = await getLabelFieldForEntity(entityKey);
      const baseClause: Prisma.RelationshipTypeWhereInput = ids
        ? { id: { in: ids } }
        : queryValue
          ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
          : {};

      const filters: Prisma.RelationshipTypeWhereInput[] = [baseClause];
      if (scope === "relationship_type") {
        if (worldId) {
          if (!isAdmin(user) && !(await canAccessWorld(user.id, worldId))) {
            res.status(403).json({ error: "Forbidden." });
            return;
          }
          filters.push({ worldId });
        } else if (!isAdmin(user)) {
          res.json([]);
          return;
        }
      } else if (worldId) {
        if (!isAdmin(user) && !(await canAccessWorld(user.id, worldId))) {
          res.status(403).json({ error: "Forbidden." });
          return;
        }
        filters.push({ worldId });
      } else if (!isAdmin(user) && !ids) {
        res.json([]);
        return;
      }

      const whereClause: Prisma.RelationshipTypeWhereInput =
        filters.length > 1 ? { AND: filters } : baseClause;

      const select: Record<string, boolean> = { id: true };
      select[labelField] = true;

      const types = await prisma.relationshipType.findMany({
        where: whereClause,
        select: select as Record<string, true>,
        orderBy: { name: "asc" },
        take: 25
      });

      const results = types.map((relationshipType) => {
        const labelValue = (relationshipType as Record<string, unknown>)[labelField];
        return {
          id: relationshipType.id,
          label: labelValue ? String(labelValue) : relationshipType.id
        };
      });

      res.json(results);
      return;
    }

    if (entityKey === "entities") {
      const labelField = await getLabelFieldForEntity(entityKey);
      const baseClause: Prisma.EntityWhereInput = ids
        ? { id: { in: ids } }
        : queryValue
          ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
          : {};

      const filters: Prisma.EntityWhereInput[] = [baseClause];
      if (worldId) filters.push({ worldId });
      const entityTypeIds = entityTypeIdsParam
        ? entityTypeIdsParam
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
        : undefined;
      if (entityTypeIds && entityTypeIds.length > 0) {
        filters.push({ entityTypeId: { in: entityTypeIds } });
      } else if (entityTypeId) {
        filters.push({ entityTypeId });
      }
  
        if (!isAdmin(user)) {
          if (!worldId) {
            res.json([]);
            return;
          }
  
          const canAccess = await canAccessWorld(user.id, worldId);
          if (!canAccess) {
            res.json([]);
            return;
          }
  
          const isArchitect = await isWorldArchitect(user.id, worldId);
          if (!isArchitect || characterId) {
            const accessFilters: Prisma.EntityWhereInput[] = [
              { access: { some: { accessType: EntityAccessType.READ, scopeType: EntityAccessScope.GLOBAL } } }
            ];
            if (campaignId) {
              accessFilters.push({
                access: { some: { accessType: EntityAccessType.READ, scopeType: EntityAccessScope.CAMPAIGN, scopeId: campaignId } }
              });
            }
            if (characterId) {
              accessFilters.push({
                access: { some: { accessType: EntityAccessType.READ, scopeType: EntityAccessScope.CHARACTER, scopeId: characterId } }
              });
            }
  
            filters.push({ OR: accessFilters });
          }
        }
  
      const whereClause: Prisma.EntityWhereInput = filters.length > 1 ? { AND: filters } : baseClause;
      const select: Record<string, boolean> = { id: true };
      select[labelField] = true;
      if (includeEntityTypeId) {
        select.entityTypeId = true;
      }

      const entities = await prisma.entity.findMany({
        where: whereClause,
        select: select as Record<string, true>,
        orderBy: { name: "asc" },
        take: 25
      });
  
      const results = entities.map((entity) => {
        const labelValue = (entity as Record<string, unknown>)[labelField];
        const payload: Record<string, unknown> = {
          id: entity.id,
          label: labelValue ? String(labelValue) : entity.id
        };
        if (includeEntityTypeId) {
          payload.entityTypeId = (entity as { entityTypeId?: string }).entityTypeId;
        }
        return payload;
      });

      res.json(results);
      return;
    }

    if (entityKey === "location_types") {
      const labelField = await getLabelFieldForEntity(entityKey);
      const baseClause: Prisma.LocationTypeWhereInput = ids
        ? { id: { in: ids } }
        : queryValue
          ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
          : {};

      const filters: Prisma.LocationTypeWhereInput[] = [baseClause];
      if (worldId) filters.push({ worldId });

      if (!isAdmin(user)) {
        if (!worldId) {
          res.json([]);
          return;
        }
        const canAccess = await canAccessWorld(user.id, worldId);
        if (!canAccess) {
          res.json([]);
          return;
        }
      }

      const whereClause: Prisma.LocationTypeWhereInput =
        filters.length > 1 ? { AND: filters } : baseClause;
      const select: Record<string, boolean> = { id: true };
      select[labelField] = true;

      const types = await prisma.locationType.findMany({
        where: whereClause,
        select: select as Record<string, true>,
        orderBy: { name: "asc" },
        take: 25
      });

      const results = types.map((locationType) => {
        const labelValue = (locationType as Record<string, unknown>)[labelField];
        return {
          id: locationType.id,
          label: labelValue ? String(labelValue) : locationType.id
        };
      });

      res.json(results);
      return;
    }

    if (entityKey === "locations") {
      const labelField = await getLabelFieldForEntity(entityKey);
      const baseClause: Prisma.LocationWhereInput = ids
        ? { id: { in: ids } }
        : queryValue
          ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
          : {};

      const filters: Prisma.LocationWhereInput[] = [baseClause];
      let parentScopeWorldId: string | undefined;
      if (locationTypeId && scope !== "location_parent") {
        filters.push({ locationTypeId });
      }

      if (scope === "location_parent") {
        if (!locationTypeId) {
          res.json([]);
          return;
        }
        parentScopeWorldId = worldId;
        if (!parentScopeWorldId) {
          const childType = await prisma.locationType.findUnique({
            where: { id: locationTypeId },
            select: { worldId: true }
          });
          parentScopeWorldId = childType?.worldId;
        }
        if (!parentScopeWorldId) {
          res.json([]);
          return;
        }
        const allowedParentTypeIds = await getAllowedLocationParentTypeIds(
          locationTypeId,
          parentScopeWorldId
        );
        if (allowedParentTypeIds.size === 0) {
          res.json([]);
          return;
        }
        filters.push({ locationTypeId: { in: Array.from(allowedParentTypeIds) } });
      }

      const effectiveWorldId = parentScopeWorldId ?? worldId;
      if (effectiveWorldId) {
        filters.push({ worldId: effectiveWorldId });
      }

      if (!isAdmin(user)) {
        if (!effectiveWorldId) {
          res.json([]);
          return;
        }
        const canAccess = await canAccessWorld(user.id, effectiveWorldId);
        if (!canAccess) {
          res.json([]);
          return;
        }
        const accessFilter = await buildLocationAccessFilter(
          user,
          effectiveWorldId,
          campaignId,
          characterId
        );
        filters.push(accessFilter);
      }

      const whereClause: Prisma.LocationWhereInput =
        filters.length > 1 ? { AND: filters } : baseClause;
      const select: Record<string, boolean> = { id: true };
      select[labelField] = true;

      const locations = await prisma.location.findMany({
        where: whereClause,
        select: select as Record<string, true>,
        orderBy: { name: "asc" },
        take: 25
      });

      const results = locations.map((location) => {
        const labelValue = (location as Record<string, unknown>)[labelField];
        return {
          id: location.id,
          label: labelValue ? String(labelValue) : location.id
        };
      });

      res.json(results);
      return;
    }

    if (entityKey === "location_type_fields") {
      const labelField = await getLabelFieldForEntity(entityKey);
      const baseClause: Prisma.LocationTypeFieldWhereInput = ids
        ? { id: { in: ids } }
        : queryValue
          ? { fieldLabel: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
          : {};

      const filters: Prisma.LocationTypeFieldWhereInput[] = [baseClause];
      if (worldId) {
        filters.push({ locationType: { worldId } });
      }

      if (!isAdmin(user)) {
        if (!worldId) {
          res.json([]);
          return;
        }
        const canManage = await isWorldArchitect(user.id, worldId);
        if (!canManage) {
          res.json([]);
          return;
        }
      }

      const whereClause: Prisma.LocationTypeFieldWhereInput =
        filters.length > 1 ? { AND: filters } : baseClause;
      const select: Record<string, boolean> = { id: true };
      select[labelField] = true;

      const fields = await prisma.locationTypeField.findMany({
        where: whereClause,
        select: select as Record<string, true>,
        orderBy: { fieldLabel: "asc" },
        take: 25
      });

      const results = fields.map((field) => {
        const labelValue = (field as Record<string, unknown>)[labelField];
        return {
          id: field.id,
          label: labelValue ? String(labelValue) : field.id
        };
      });

      res.json(results);
      return;
    }
  
    let results = await getReferenceResults(entityKey, query, ids);
  
    if (entityKey === "users" && scope === "world_gm" && !ids) {
      if (!worldId) {
        res.json([]);
        return;
      }
      const canSeeAll = isAdmin(user) || (await isWorldArchitect(user.id, worldId));
      if (!canSeeAll) {
        const gmUsers = await prisma.worldGameMaster.findMany({
          where: { worldId },
          select: { userId: true }
        });
        const allowedIds = new Set(gmUsers.map((entry) => entry.userId));
        results = results.filter((item) => allowedIds.has(item.id));
      }
    }
  
    if (entityKey === "worlds") {
      if (user && !isAdmin(user) && !ids) {
        let whereClause = {
          OR: [
            { primaryArchitectId: user.id },
            { architects: { some: { userId: user.id } } },
            { gameMasters: { some: { userId: user.id } } },
            { campaignCreators: { some: { userId: user.id } } },
            { characterCreators: { some: { userId: user.id } } }
          ]
        };
  
        if (scope === "character_create") {
          whereClause = {
            OR: [
              { primaryArchitectId: user.id },
              { architects: { some: { userId: user.id } } },
              { characterCreators: { some: { userId: user.id } } }
            ]
          };
        }
  
        if (scope === "campaign_create") {
          whereClause = {
            OR: [
              { primaryArchitectId: user.id },
              { architects: { some: { userId: user.id } } },
              { gameMasters: { some: { userId: user.id } } },
              { campaignCreators: { some: { userId: user.id } } }
            ]
          };
        }
  
        const allowedWorlds = await prisma.world.findMany({
          where: whereClause,
          select: { id: true }
        });
        const allowedIds = new Set(allowedWorlds.map((world) => world.id));
        results = results.filter((item) => allowedIds.has(item.id));
      }
      if (worldId) {
        results = results.filter((item) => item.id === worldId);
      }
    }
    res.json(results);
  });

  app.get("/api/context/summary", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
  
    let worldRole: string | null = null;
    let campaignRole: string | null = null;
    let characterOwnerLabel: string | null = null;
  
    if (worldId) {
      const world = await prisma.world.findUnique({
        where: { id: worldId },
        select: {
          primaryArchitectId: true,
          architects: { select: { userId: true } }
        }
      });
      if (world) {
        const isArchitect =
          world.primaryArchitectId === user.id ||
          world.architects.some((entry) => entry.userId === user.id);
        worldRole = isArchitect ? "Architect" : "Member";
      }
    }
  
    if (campaignId) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { gmUserId: true }
      });
      if (campaign) {
        campaignRole = campaign.gmUserId === user.id ? "GM" : "Player";
      }
    }
  
    if (characterId) {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        select: {
          player: { select: { name: true, email: true, id: true } },
          world: { select: { primaryArchitectId: true, architects: { select: { userId: true } } } },
          campaigns: { select: { campaign: { select: { gmUserId: true } } } }
        }
      });
      if (character) {
        const canSeeOwner =
          isAdmin(user) ||
          character.world.primaryArchitectId === user.id ||
          character.world.architects.some((entry) => entry.userId === user.id) ||
          character.campaigns.some((entry) => entry.campaign.gmUserId === user.id);
        characterOwnerLabel = canSeeOwner
          ? character.player.name ?? character.player.email ?? character.player.id
          : null;
      }
    }
  
    res.json({ worldRole, campaignRole, characterOwnerLabel });
  });

  app.get("/api/permissions", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const entityKey = typeof req.query.entityKey === "string" ? req.query.entityKey : undefined;
    const recordId = typeof req.query.recordId === "string" ? req.query.recordId : undefined;
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
    const entityTypeId =
      typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : undefined;
    const entityFieldId =
      typeof req.query.entityFieldId === "string" ? req.query.entityFieldId : undefined;
    const locationTypeId =
      typeof req.query.locationTypeId === "string" ? req.query.locationTypeId : undefined;
    const locationTypeFieldId =
      typeof req.query.locationTypeFieldId === "string"
        ? req.query.locationTypeFieldId
        : undefined;
    const isTemplate = req.query.isTemplate === "true";
  
    if (!entityKey) {
      res.status(400).json({ error: "entityKey is required." });
      return;
    }
  
    const admin = isAdmin(user);
    let canCreate = false;
    let canEdit = false;
    let canDelete = false;
  
    switch (entityKey) {
      case "worlds": {
        canCreate = true;
        if (recordId) {
          const isArchitect = await isWorldArchitect(user.id, recordId);
          canEdit = admin || isArchitect;
          canDelete = canEdit;
        }
        break;
      }
      case "campaigns": {
        if (worldId) {
          canCreate = admin || (await canCreateCampaign(user.id, worldId));
        }
        if (recordId) {
          const canManage = admin || (await canManageCampaign(user.id, recordId));
          canEdit = canManage;
          canDelete = canManage;
        }
        break;
      }
      case "characters": {
        if (campaignId) {
          canCreate = admin || (await canCreateCharacterInCampaign(user.id, campaignId));
        } else if (worldId) {
          canCreate = admin || (await canCreateCharacterInWorld(user.id, worldId));
        }
        if (recordId) {
          const character = await prisma.character.findUnique({
            where: { id: recordId },
            select: { playerId: true, worldId: true }
          });
          if (!character) {
            res.status(404).json({ error: "Character not found." });
            return;
          }
          const isArchitect = await isWorldArchitect(user.id, character.worldId);
          const canManage = admin || isArchitect || character.playerId === user.id;
          canEdit = canManage;
          canDelete = canManage;
        }
        break;
      }
      case "entity_types": {
        if (recordId) {
          const entityType = await prisma.entityType.findUnique({
            where: { id: recordId },
            select: { worldId: true, isTemplate: true }
          });
          if (!entityType) {
            res.status(404).json({ error: "Entity type not found." });
            return;
          }
          if (entityType.isTemplate) {
            canEdit = admin;
            canDelete = admin;
          } else if (entityType.worldId) {
            const isArchitect = await isWorldArchitect(user.id, entityType.worldId);
            canEdit = admin || isArchitect;
            canDelete = canEdit;
          }
        }
        if (isTemplate) {
          canCreate = admin;
        } else if (worldId) {
          canCreate = admin || (await isWorldArchitect(user.id, worldId));
        }
        break;
      }
      case "relationship_types": {
        if (recordId) {
          const relationshipType = await prisma.relationshipType.findUnique({
            where: { id: recordId },
            select: { worldId: true }
          });
          if (!relationshipType) {
            res.status(404).json({ error: "Relationship type not found." });
            return;
          }
          const canManage =
            admin ||
            (await isWorldArchitect(user.id, relationshipType.worldId)) ||
            (await isWorldGameMaster(user.id, relationshipType.worldId)) ||
            (await isWorldGm(user.id, relationshipType.worldId));
          canEdit = canManage;
          canDelete = canManage;
        }
        if (worldId) {
          canCreate =
            admin ||
            (await isWorldArchitect(user.id, worldId)) ||
            (await isWorldGameMaster(user.id, worldId)) ||
            (await isWorldGm(user.id, worldId));
        }
        break;
      }
      case "location_types": {
        if (worldId) {
          canCreate = admin || (await isWorldArchitect(user.id, worldId));
        }
        if (recordId) {
          const locationType = await prisma.locationType.findUnique({
            where: { id: recordId },
            select: { worldId: true }
          });
          if (!locationType) {
            res.status(404).json({ error: "Location type not found." });
            return;
          }
          const canManage = admin || (await isWorldArchitect(user.id, locationType.worldId));
          canEdit = canManage;
          canDelete = canManage;
        }
        break;
      }
      case "entity_fields": {
        let resolvedEntityTypeId = entityTypeId;
        if (recordId) {
          const field = await prisma.entityField.findUnique({
            where: { id: recordId },
            select: { entityTypeId: true }
          });
          if (!field) {
            res.status(404).json({ error: "Entity field not found." });
            return;
          }
          resolvedEntityTypeId = field.entityTypeId;
        }
        if (resolvedEntityTypeId) {
          const canManage = admin || (await canManageEntityType(user.id, resolvedEntityTypeId));
          canCreate = canManage;
          if (recordId) {
            canEdit = canManage;
            canDelete = canManage;
          }
        }
        break;
      }
      case "entity_field_choices": {
        let resolvedEntityFieldId = entityFieldId;
        if (recordId) {
          const choice = await prisma.entityFieldChoice.findUnique({
            where: { id: recordId },
            select: { entityFieldId: true }
          });
          if (!choice) {
            res.status(404).json({ error: "Choice not found." });
            return;
          }
          resolvedEntityFieldId = choice.entityFieldId;
        }
        if (resolvedEntityFieldId) {
          const field = await prisma.entityField.findUnique({
            where: { id: resolvedEntityFieldId },
            select: { entityTypeId: true }
          });
          if (!field) {
            res.status(404).json({ error: "Entity field not found." });
            return;
          }
          const canManage = admin || (await canManageEntityType(user.id, field.entityTypeId));
          canCreate = canManage;
          if (recordId) {
            canEdit = canManage;
            canDelete = canManage;
          }
        }
        break;
      }
      case "relationship_type_rules": {
        if (recordId) {
          const rule = await prisma.relationshipTypeRule.findUnique({
            where: { id: recordId },
            include: { relationshipType: { select: { worldId: true } } }
          });
          if (!rule) {
            res.status(404).json({ error: "Relationship type rule not found." });
            return;
          }
          const canManage =
            admin ||
            (await isWorldArchitect(user.id, rule.relationshipType.worldId)) ||
            (await isWorldGameMaster(user.id, rule.relationshipType.worldId)) ||
            (await isWorldGm(user.id, rule.relationshipType.worldId));
          canEdit = canManage;
          canDelete = canManage;
        }
        if (worldId) {
          canCreate =
            admin ||
            (await isWorldArchitect(user.id, worldId)) ||
            (await isWorldGameMaster(user.id, worldId)) ||
            (await isWorldGm(user.id, worldId));
        }
        break;
      }
      case "location_type_fields": {
        if (worldId) {
          canCreate = admin || (await isWorldArchitect(user.id, worldId));
        }
        if (recordId) {
          const field = await prisma.locationTypeField.findUnique({
            where: { id: recordId },
            select: { locationType: { select: { worldId: true } } }
          });
          if (!field) {
            res.status(404).json({ error: "Location field not found." });
            return;
          }
          const canManage = admin || (await isWorldArchitect(user.id, field.locationType.worldId));
          canEdit = canManage;
          canDelete = canManage;
        }
        break;
      }
      case "location_type_field_choices": {
        if (locationTypeFieldId) {
          const field = await prisma.locationTypeField.findUnique({
            where: { id: locationTypeFieldId },
            select: { locationType: { select: { worldId: true } } }
          });
          if (!field) {
            res.status(404).json({ error: "Location field not found." });
            return;
          }
          const canManage = admin || (await isWorldArchitect(user.id, field.locationType.worldId));
          canCreate = canManage;
        }
        if (recordId) {
          const choice = await prisma.locationTypeFieldChoice.findUnique({
            where: { id: recordId },
            select: { field: { select: { locationType: { select: { worldId: true } } } } }
          });
          if (!choice) {
            res.status(404).json({ error: "Location field choice not found." });
            return;
          }
          const canManage =
            admin || (await isWorldArchitect(user.id, choice.field.locationType.worldId));
          canEdit = canManage;
          canDelete = canManage;
        }
        break;
      }
      case "location_type_rules": {
        if (worldId) {
          canCreate = admin || (await isWorldArchitect(user.id, worldId));
        }
        if (recordId) {
          const rule = await prisma.locationTypeRule.findUnique({
            where: { id: recordId },
            select: { parentType: { select: { worldId: true } } }
          });
          if (!rule) {
            res.status(404).json({ error: "Location type rule not found." });
            return;
          }
          const canManage = admin || (await isWorldArchitect(user.id, rule.parentType.worldId));
          canEdit = canManage;
          canDelete = canManage;
        }
        break;
      }
      case "packs":
      case "entity_type_templates":
      case "entity_type_template_fields":
      case "location_type_templates":
      case "location_type_template_fields":
      case "location_type_rule_templates":
      case "relationship_type_templates":
      case "relationship_type_template_roles": {
        canCreate = admin;
        if (recordId) {
          canEdit = admin;
          canDelete = admin;
        }
        break;
      }
      case "entities": {
        if (worldId) {
          canCreate = admin || (await canCreateEntityInWorld(user.id, worldId));
        }
        if (recordId) {
          const entity = await prisma.entity.findUnique({
            where: { id: recordId },
            select: { worldId: true }
          });
          if (!entity) {
            res.status(404).json({ error: "Entity not found." });
            return;
          }
          canEdit = admin || (await canWriteEntity(user, recordId, campaignId, characterId));
          const isArchitect = await isWorldArchitect(user.id, entity.worldId);
          const isGm =
            (await isWorldGameMaster(user.id, entity.worldId)) ||
            (await isWorldGm(user.id, entity.worldId));
          canDelete = admin || isArchitect || isGm;
        }
        break;
      }
      case "locations": {
        if (worldId) {
          canCreate = admin || (await canCreateLocationInWorld(user.id, worldId));
        }
        if (recordId) {
          const location = await prisma.location.findUnique({
            where: { id: recordId },
            select: { worldId: true }
          });
          if (!location) {
            res.status(404).json({ error: "Location not found." });
            return;
          }
          canEdit = admin || (await canWriteLocation(user, recordId, campaignId, characterId));
          const isArchitect = await isWorldArchitect(user.id, location.worldId);
          const isGm =
            (await isWorldGameMaster(user.id, location.worldId)) ||
            (await isWorldGm(user.id, location.worldId));
          canDelete = admin || isArchitect || isGm;
        }
        break;
      }
      default: {
        canCreate = admin;
        canEdit = admin;
        canDelete = admin;
        break;
      }
    }
  
    res.json({ canCreate, canEdit, canDelete });
  });

  app.post("/api/views", requireAuth, requireSystemAdmin, async (req, res) => {
    const { key, title, entityKey, viewType, endpoint, description, adminOnly } = req.body as {
      key?: string;
      title?: string;
      entityKey?: string;
      viewType?: string;
      endpoint?: string;
      description?: string;
      adminOnly?: boolean;
    };
  
    if (!key || !title || !entityKey || !viewType || !endpoint) {
      res.status(400).json({ error: "key, title, entityKey, viewType, and endpoint are required." });
      return;
    }
  
    if (!Object.values(SystemViewType).includes(viewType as SystemViewType)) {
      res.status(400).json({ error: "Invalid viewType." });
      return;
    }
  
    const view = await prisma.systemView.create({
      data: {
        key,
        title,
        entityKey,
        viewType: viewType as SystemViewType,
        endpoint,
        description,
        adminOnly
      }
    });
    res.status(201).json(view);
  });

};

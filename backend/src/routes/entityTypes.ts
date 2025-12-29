import express from "express";
import { Prisma, EntityFieldType, EntityFormSectionLayout } from "@prisma/client";
import { prisma, requireAuth, isAdmin, canAccessWorld, isWorldArchitect, canAccessEntityType, canManageEntityType, buildEntityAccessFilter } from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";

export const registerEntityTypesRoutes = (app: express.Express) => {
  app.get("/api/entity-types", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    const includeTemplates = req.query.includeTemplates === "true";
    const templatesOnly = req.query.templates === "true";
  
    if (!isAdmin(user) && worldId && !(await isWorldArchitect(user.id, worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    if (!isAdmin(user) && !worldId && !templatesOnly) {
      res.json([]);
      return;
    }
  
    const whereClause: Prisma.EntityTypeWhereInput = templatesOnly
      ? { isTemplate: true }
      : worldId
        ? includeTemplates
          ? { OR: [{ worldId }, { isTemplate: true }] }
          : { worldId }
        : isAdmin(user)
          ? {}
          : { isTemplate: true };
  
    const entityTypes = await prisma.entityType.findMany({
      where: whereClause,
      orderBy: { name: "asc" }
    });
  
    res.json(entityTypes);
  });

  app.post("/api/entity-types", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { worldId, name, description, isTemplate, sourceTypeId } = req.body as {
      worldId?: string;
      name?: string;
      description?: string;
      isTemplate?: boolean;
      sourceTypeId?: string;
    };
  
    if (!name) {
      res.status(400).json({ error: "name is required." });
      return;
    }
  
    if (isTemplate && !isAdmin(user)) {
      res.status(403).json({ error: "Only admins can create templates." });
      return;
    }
  
    if (!isTemplate && (!worldId || !(await isWorldArchitect(user.id, worldId))) && !isAdmin(user)) {
      res.status(403).json({ error: "Only world architects can create entity types." });
      return;
    }
  
    let sourceType: { id: string; isTemplate: boolean } | null = null;
    if (sourceTypeId) {
      sourceType = await prisma.entityType.findUnique({
        where: { id: sourceTypeId },
        select: { id: true, isTemplate: true }
      });
      if (!sourceType) {
        res.status(404).json({ error: "Source entity type not found." });
        return;
      }
      if (!isAdmin(user) && !sourceType.isTemplate) {
        res.status(403).json({ error: "Only templates can be copied by non-admins." });
        return;
      }
    }
  
    const entityType = await prisma.entityType.create({
      data: {
        worldId: isTemplate ? null : worldId ?? null,
        name,
        description,
        isTemplate: Boolean(isTemplate),
        createdById: user.id
      }
    });
  
    const sourceSections = sourceType
      ? await prisma.entityFormSection.findMany({
          where: { entityTypeId: sourceType.id },
          orderBy: { sortOrder: "asc" }
        })
      : [];
    const sectionMap = new Map<string, string>();
    let defaultSectionId: string | null = null;
  
    if (sourceSections.length > 0) {
      for (const section of sourceSections) {
        const created = await prisma.entityFormSection.create({
          data: {
            entityTypeId: entityType.id,
            title: section.title,
            layout: section.layout,
            sortOrder: section.sortOrder
          }
        });
        sectionMap.set(section.id, created.id);
      }
    } else {
      const created = await prisma.entityFormSection.create({
        data: {
          entityTypeId: entityType.id,
          title: "General",
          layout: EntityFormSectionLayout.ONE_COLUMN,
          sortOrder: 1
        }
      });
      defaultSectionId = created.id;
    }
  
    if (sourceType) {
      const sourceFields = await prisma.entityField.findMany({
        where: { entityTypeId: sourceType.id }
      });
  
      for (const field of sourceFields) {
        const mappedSectionId =
          (field.formSectionId ? sectionMap.get(field.formSectionId) : undefined) ??
          defaultSectionId ??
          null;
        const createdField = await prisma.entityField.create({
          data: {
            entityTypeId: entityType.id,
            fieldKey: field.fieldKey,
            label: field.label,
            fieldType: field.fieldType,
            description: field.description,
            required: field.required,
            listOrder: field.listOrder,
            formOrder: field.formOrder,
            formSectionId: mappedSectionId,
            formColumn: field.formColumn ?? 1,
            referenceEntityTypeId: field.referenceEntityTypeId,
            referenceLocationTypeKey: field.referenceLocationTypeKey,
            choiceListId: field.choiceListId ?? null,
            conditions: field.conditions ?? undefined
          }
        });
      }
    }
  
    res.status(201).json(entityType);
  });

  app.get("/api/entity-types/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const entityType = await prisma.entityType.findUnique({
      where: { id }
    });
    if (!entityType) {
      res.status(404).json({ error: "Entity type not found." });
      return;
    }
  
    if (!entityType.isTemplate && !isAdmin(user) && !(await canAccessEntityType(user.id, id))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    res.json(entityType);
  });

  app.put("/api/entity-types/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const entityType = await prisma.entityType.findUnique({
      where: { id },
      select: { isTemplate: true, worldId: true }
    });
    if (!entityType) {
      res.status(404).json({ error: "Entity type not found." });
      return;
    }
  
    if (entityType.isTemplate && !isAdmin(user)) {
      res.status(403).json({ error: "Only admins can edit templates." });
      return;
    }
  
    if (!entityType.isTemplate && !isAdmin(user) && !(await isWorldArchitect(user.id, entityType.worldId ?? ""))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const { name, description } = req.body as { name?: string; description?: string };
  
    const updated = await prisma.entityType.update({
      where: { id },
      data: { name, description }
    });
  
    res.json(updated);
  });

  app.delete("/api/entity-types/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const entityType = await prisma.entityType.findUnique({
      where: { id },
      select: { isTemplate: true, worldId: true }
    });
    if (!entityType) {
      res.status(404).json({ error: "Entity type not found." });
      return;
    }
  
    if (entityType.isTemplate && !isAdmin(user)) {
      res.status(403).json({ error: "Only admins can delete templates." });
      return;
    }
  
    if (!entityType.isTemplate && !isAdmin(user) && !(await isWorldArchitect(user.id, entityType.worldId ?? ""))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    await prisma.entityType.delete({ where: { id } });
    res.json({ ok: true });
  });

  app.get("/api/entity-type-stats", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
  
    if (!worldId) {
      res.json([]);
      return;
    }
  
    if (!isAdmin(user) && !(await canAccessWorld(user.id, worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const types = await prisma.entityType.findMany({
      where: { worldId },
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    });
  
    if (types.length === 0) {
      res.json([]);
      return;
    }
  
    const accessFilter = isAdmin(user)
      ? { worldId }
      : await buildEntityAccessFilter(user, worldId, campaignId, characterId);
  
    const grouped = await prisma.entity.groupBy({
      by: ["entityTypeId"],
      where: accessFilter,
      _count: { _all: true }
    });
  
    const countMap = new Map(grouped.map((entry) => [entry.entityTypeId, entry._count._all]));
  
    res.json(
      types.map((type) => ({
        id: type.id,
        name: type.name,
        count: countMap.get(type.id) ?? 0
      }))
    );
  });

  app.get("/api/entity-form-sections", requireAuth, async (req, res) => {
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
  
    if (!isAdmin(user) && !(await canAccessEntityType(user.id, entityTypeId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    let sections = await prisma.entityFormSection.findMany({
      where: { entityTypeId },
      orderBy: { sortOrder: "asc" }
    });
  
    if (sections.length === 0 && (isAdmin(user) || (await canManageEntityType(user.id, entityTypeId)))) {
      const created = await prisma.entityFormSection.create({
        data: {
          entityTypeId,
          title: "General",
          layout: EntityFormSectionLayout.ONE_COLUMN,
          sortOrder: 1
        }
      });
      sections = [created];
    }
  
    res.json(sections);
  });

  app.post("/api/entity-form-sections", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { entityTypeId, title, layout, sortOrder } = req.body as {
      entityTypeId?: string;
      title?: string;
      layout?: EntityFormSectionLayout;
      sortOrder?: number;
    };
  
    if (!entityTypeId || !title) {
      res.status(400).json({ error: "entityTypeId and title are required." });
      return;
    }
  
    if (!isAdmin(user) && !(await canManageEntityType(user.id, entityTypeId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const resolvedLayout = Object.values(EntityFormSectionLayout).includes(
      layout as EntityFormSectionLayout
    )
      ? (layout as EntityFormSectionLayout)
      : EntityFormSectionLayout.ONE_COLUMN;
  
    const section = await prisma.entityFormSection.create({
      data: {
        entityTypeId,
        title,
        layout: resolvedLayout,
        sortOrder: sortOrder ?? 0
      }
    });
  
    res.status(201).json(section);
  });

  app.put("/api/entity-form-sections/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const existing = await prisma.entityFormSection.findUnique({
      where: { id },
      select: { entityTypeId: true }
    });
    if (!existing) {
      res.status(404).json({ error: "Section not found." });
      return;
    }
  
    if (!isAdmin(user) && !(await canManageEntityType(user.id, existing.entityTypeId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const { title, layout, sortOrder } = req.body as {
      title?: string;
      layout?: EntityFormSectionLayout;
      sortOrder?: number;
    };
  
    const resolvedLayout =
      layout && Object.values(EntityFormSectionLayout).includes(layout)
        ? layout
        : undefined;
  
    const section = await prisma.entityFormSection.update({
      where: { id },
      data: {
        title,
        layout: resolvedLayout,
        sortOrder
      }
    });
  
    res.json(section);
  });

  app.delete("/api/entity-form-sections/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const existing = await prisma.entityFormSection.findUnique({
      where: { id },
      select: { entityTypeId: true }
    });
    if (!existing) {
      res.status(404).json({ error: "Section not found." });
      return;
    }
  
    if (!isAdmin(user) && !(await canManageEntityType(user.id, existing.entityTypeId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    await prisma.$transaction([
      prisma.entityField.updateMany({
        where: { formSectionId: id },
        data: { formSectionId: null, formColumn: 1 }
      }),
      prisma.entityFormSection.delete({ where: { id } })
    ]);
  
    res.json({ ok: true });
  });

  app.get("/api/entity-fields", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const entityTypeId = typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : undefined;
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    if (!entityTypeId) {
      if (worldId && !isAdmin(user) && !(await isWorldArchitect(user.id, worldId))) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
  
      const fields = await prisma.entityField.findMany({
        where: {
          ...(worldId ? { entityType: { worldId } } : {}),
          ...(isAdmin(user) || worldId
            ? {}
            : {
                entityType: {
                  world: {
                    OR: [
                      { primaryArchitectId: user.id },
                      { architects: { some: { userId: user.id } } }
                    ]
                  }
                }
              })
        },
        include: { choiceList: { include: { options: true } } },
        orderBy: { formOrder: "asc" }
      });
      res.json(fields);
      return;
    }
  
    const entityType = await prisma.entityType.findUnique({
      where: { id: entityTypeId },
      select: { worldId: true, isTemplate: true }
    });
    if (!entityType) {
      res.status(404).json({ error: "Entity type not found." });
      return;
    }
  
    if (!entityType.isTemplate && !isAdmin(user) && !(await canAccessEntityType(user.id, entityTypeId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const fields = await prisma.entityField.findMany({
      where: { entityTypeId },
      include: { choiceList: { include: { options: true } } },
      orderBy: { formOrder: "asc" }
    });
  
    res.json(fields);
  });

  app.post("/api/entity-fields", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const {
      entityTypeId,
      fieldKey,
      label,
      fieldType,
      description,
      required,
      listOrder,
      formOrder,
      formSectionId,
      formColumn,
      referenceEntityTypeId,
      referenceLocationTypeKey,
      conditions,
      choiceListId
    } = req.body as {
      entityTypeId?: string;
      fieldKey?: string;
      label?: string;
      fieldType?: EntityFieldType;
      description?: string;
      required?: boolean;
      listOrder?: number;
      formOrder?: number;
      formSectionId?: string;
      formColumn?: number;
      referenceEntityTypeId?: string;
      referenceLocationTypeKey?: string;
      conditions?: Prisma.InputJsonValue;
      choiceListId?: string;
    };
  
    if (!entityTypeId || !fieldKey || !label || !fieldType) {
      res.status(400).json({ error: "entityTypeId, fieldKey, label, and fieldType are required." });
      return;
    }
  
    const entityType = await prisma.entityType.findUnique({
      where: { id: entityTypeId },
      select: { worldId: true, isTemplate: true }
    });
    if (!entityType) {
      res.status(404).json({ error: "Entity type not found." });
      return;
    }
  
    if (entityType.isTemplate && !isAdmin(user)) {
      res.status(403).json({ error: "Only admins can edit templates." });
      return;
    }
  
    if (!entityType.isTemplate && !isAdmin(user) && !(await isWorldArchitect(user.id, entityType.worldId ?? ""))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    let resolvedChoiceListId: string | null = choiceListId ?? null;
    if (fieldType !== EntityFieldType.CHOICE) {
      resolvedChoiceListId = null;
    }
    if (fieldType === EntityFieldType.CHOICE && !resolvedChoiceListId) {
      res.status(400).json({ error: "choiceListId is required for choice fields." });
      return;
    }
    if (resolvedChoiceListId) {
      const choiceList = await prisma.choiceList.findUnique({
        where: { id: resolvedChoiceListId },
        select: { scope: true, worldId: true }
      });
      if (!choiceList || choiceList.scope !== "WORLD" || choiceList.worldId !== entityType.worldId) {
        res.status(400).json({ error: "Choice list must belong to the entity type world." });
        return;
      }
    }

    const field = await prisma.entityField.create({
      data: {
        entityTypeId,
        fieldKey,
        label,
        fieldType,
        description,
        required: Boolean(required),
        listOrder: listOrder ?? 0,
        formOrder: formOrder ?? 0,
        formSectionId: formSectionId ?? null,
        formColumn: formColumn ?? 1,
        referenceEntityTypeId,
        referenceLocationTypeKey,
        choiceListId: resolvedChoiceListId,
        conditions: conditions ?? undefined
      }
    });
  
    res.status(201).json(field);
  });

  app.get("/api/entity-fields/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const field = await prisma.entityField.findUnique({
      where: { id },
      include: { choiceList: { include: { options: true } } }
    });
    if (!field) {
      res.status(404).json({ error: "Field not found." });
      return;
    }
  
    if (!isAdmin(user) && !(await canAccessEntityType(user.id, field.entityTypeId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    res.json(field);
  });

  app.put("/api/entity-fields/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const existing = await prisma.entityField.findUnique({
      where: { id },
      select: { entityTypeId: true }
    });
    if (!existing) {
      res.status(404).json({ error: "Field not found." });
      return;
    }
  
    if (!isAdmin(user) && !(await canManageEntityType(user.id, existing.entityTypeId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const {
      fieldKey,
      label,
      fieldType,
      description,
      required,
      listOrder,
      formOrder,
      formSectionId,
      formColumn,
      referenceEntityTypeId,
      referenceLocationTypeKey,
      conditions,
      choiceListId
    } = req.body as {
      fieldKey?: string;
      label?: string;
      fieldType?: EntityFieldType;
      description?: string;
      required?: boolean;
      listOrder?: number;
      formOrder?: number;
      formSectionId?: string | null;
      formColumn?: number;
      referenceEntityTypeId?: string;
      referenceLocationTypeKey?: string;
      conditions?: Prisma.InputJsonValue;
      choiceListId?: string;
    };

    let resolvedChoiceListId: string | null | undefined = choiceListId ?? null;
    if (fieldType && fieldType !== EntityFieldType.CHOICE) {
      resolvedChoiceListId = null;
    }
    if (fieldType === EntityFieldType.CHOICE && !resolvedChoiceListId) {
      res.status(400).json({ error: "choiceListId is required for choice fields." });
      return;
    }
    if (resolvedChoiceListId) {
      const entityType = await prisma.entityType.findUnique({
        where: { id: existing.entityTypeId },
        select: { worldId: true }
      });
      const choiceList = await prisma.choiceList.findUnique({
        where: { id: resolvedChoiceListId },
        select: { scope: true, worldId: true }
      });
      if (!entityType || !choiceList || choiceList.scope !== "WORLD" || choiceList.worldId !== entityType.worldId) {
        res.status(400).json({ error: "Choice list must belong to the entity type world." });
        return;
      }
    }
  
    const field = await prisma.entityField.update({
      where: { id },
      data: {
        fieldKey,
        label,
        fieldType,
        description,
        required,
        listOrder,
        formOrder,
        formSectionId,
        formColumn,
        referenceEntityTypeId,
        referenceLocationTypeKey,
        choiceListId: resolvedChoiceListId,
        conditions: conditions ?? undefined
      }
    });
  
    res.json(field);
  });

  app.delete("/api/entity-fields/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const existing = await prisma.entityField.findUnique({
      where: { id },
      select: { entityTypeId: true }
    });
    if (!existing) {
      res.status(404).json({ error: "Field not found." });
      return;
    }
  
    if (!isAdmin(user) && !(await canManageEntityType(user.id, existing.entityTypeId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    await prisma.entityField.delete({ where: { id } });
    res.json({ ok: true });
  });


};

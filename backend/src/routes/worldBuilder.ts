import express from "express";
import { EntityFieldType, EntityFormSectionLayout, LocationFieldType } from "@prisma/client";
import { prisma, requireAuth, isAdmin, isWorldArchitect } from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";

type BuilderEntityField = {
  fieldKey: string;
  label: string;
  fieldType: EntityFieldType;
  required?: boolean;
  enabled: boolean;
  choiceListKey?: string | null;
};

type BuilderEntityType = {
  key: string;
  name: string;
  description?: string;
  fields: BuilderEntityField[];
};

type BuilderLocationField = {
  fieldKey: string;
  fieldLabel: string;
  fieldType: LocationFieldType;
  required?: boolean;
  enabled: boolean;
  choiceListKey?: string | null;
};

type BuilderLocationType = {
  key: string;
  name: string;
  description?: string;
  fields: BuilderLocationField[];
};

type BuilderLocationRule = {
  parentKey: string;
  childKey: string;
  allowed?: boolean;
};

type BuilderRelationshipMapping = {
  fromRole: string;
  toRole: string;
  fromTypeKey: string;
  toTypeKey: string;
};

type BuilderRelationshipType = {
  key: string;
  name: string;
  description?: string;
  isPeerable: boolean;
  fromLabel: string;
  toLabel: string;
  pastFromLabel?: string;
  pastToLabel?: string;
  enabled: boolean;
  roleMappings: BuilderRelationshipMapping[];
};

type BuilderChoiceOption = {
  value: string;
  label: string;
  order?: number;
  isActive?: boolean;
};

type BuilderChoiceList = {
  key: string;
  name: string;
  description?: string;
  options: BuilderChoiceOption[];
};

const ensureArchitectOnly = async (req: AuthRequest, res: express.Response) => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return false;
  }
  if (isAdmin(user)) {
    res.status(403).json({ error: "Admins cannot use the guided builder." });
    return false;
  }
  const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
  if (!worldId) {
    res.status(400).json({ error: "worldId is required." });
    return false;
  }
  const isArchitect = await isWorldArchitect(user.id, worldId);
  if (!isArchitect) {
    res.status(403).json({ error: "Forbidden." });
    return false;
  }
  return true;
};

export const registerWorldBuilderRoutes = (app: express.Express) => {
  app.get("/api/world-builder/packs", requireAuth, async (req, res) => {
    const allowed = await ensureArchitectOnly(req as AuthRequest, res);
    if (!allowed) return;

    const packs = await prisma.pack.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" }
    });
    res.json(packs);
  });

  app.get("/api/world-builder/packs/:id", requireAuth, async (req, res) => {
    const allowed = await ensureArchitectOnly(req as AuthRequest, res);
    if (!allowed) return;

    const pack = await prisma.pack.findUnique({
      where: { id: req.params.id },
      include: {
        choiceLists: { include: { options: true } },
        entityTypeTemplates: { include: { fields: { include: { choiceList: true } } } },
        locationTypeTemplates: { include: { fields: { include: { choiceList: true } } } },
        locationTypeRuleTemplates: true,
        relationshipTypeTemplates: { include: { roles: true } }
      }
    });
    if (!pack || !pack.isActive) {
      res.status(404).json({ error: "Pack not found." });
      return;
    }
    res.json(pack);
  });

  app.post("/api/world-builder/apply", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    if (isAdmin(user)) {
      res.status(403).json({ error: "Admins cannot apply packs to worlds." });
      return;
    }

    const { worldId, packId, choiceLists, entityTypes, locationTypes, locationRules, relationshipTypes } =
      req.body as {
        worldId?: string;
        packId?: string;
        choiceLists?: BuilderChoiceList[];
        entityTypes?: BuilderEntityType[];
        locationTypes?: BuilderLocationType[];
        locationRules?: BuilderLocationRule[];
        relationshipTypes?: BuilderRelationshipType[];
      };

    if (!worldId || !packId) {
      res.status(400).json({ error: "worldId and packId are required." });
      return;
    }

    const isArchitect = await isWorldArchitect(user.id, worldId);
    if (!isArchitect) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const pack = await prisma.pack.findUnique({ where: { id: packId } });
    if (!pack || !pack.isActive) {
      res.status(404).json({ error: "Pack not found." });
      return;
    }

    const safeChoiceLists = Array.isArray(choiceLists) ? choiceLists : [];
    const safeEntityTypes = Array.isArray(entityTypes) ? entityTypes : [];
    const safeLocationTypes = Array.isArray(locationTypes) ? locationTypes : [];
    const safeLocationRules = Array.isArray(locationRules) ? locationRules : [];
    const safeRelationshipTypes = Array.isArray(relationshipTypes) ? relationshipTypes : [];

    try {
      const result = await prisma.$transaction(async (tx) => {
        const entityTypeMap = new Map<string, string>();
        const locationTypeMap = new Map<string, string>();

        const choiceListMap = new Map<string, string>();

        for (const list of safeChoiceLists) {
          const createdList = await tx.choiceList.create({
            data: {
              name: list.name,
              description: list.description ?? null,
              scope: "WORLD",
              worldId
            }
          });
          choiceListMap.set(list.key, createdList.id);

          if (list.options && list.options.length > 0) {
            await tx.choiceOption.createMany({
              data: list.options.map((option, index) => ({
                choiceListId: createdList.id,
                value: option.value,
                label: option.label,
                order: option.order ?? index,
                isActive: option.isActive ?? true
              }))
            });
          }
        }

        for (const entry of safeEntityTypes) {
          const created = await tx.entityType.create({
            data: {
              worldId,
              name: entry.name,
              description: entry.description,
              isTemplate: false,
              createdById: user.id
            }
          });
          entityTypeMap.set(entry.key, created.id);

          const section = await tx.entityFormSection.create({
            data: {
              entityTypeId: created.id,
              title: "General",
              layout: EntityFormSectionLayout.ONE_COLUMN,
              sortOrder: 1
            }
          });

          for (const field of entry.fields ?? []) {
            if (!field.enabled) continue;
            const choiceListId =
              field.fieldType === EntityFieldType.CHOICE && field.choiceListKey
                ? choiceListMap.get(field.choiceListKey) ?? null
                : null;
            if (field.fieldType === EntityFieldType.CHOICE && !choiceListId) {
              throw new Error(`Choice list missing for entity field ${field.fieldKey}`);
            }
            await tx.entityField.create({
              data: {
                entityTypeId: created.id,
                fieldKey: field.fieldKey,
                label: field.label,
                fieldType: field.fieldType,
                required: Boolean(field.required),
                listOrder: 0,
                formOrder: 0,
                formSectionId: section.id,
                formColumn: 1,
                choiceListId
              }
            });
          }
        }

        for (const entry of safeLocationTypes) {
          const created = await tx.locationType.create({
            data: {
              worldId,
              name: entry.name,
              description: entry.description
            }
          });
          locationTypeMap.set(entry.key, created.id);

          for (const field of entry.fields ?? []) {
            if (!field.enabled) continue;
            const choiceListId =
              field.fieldType === LocationFieldType.CHOICE && field.choiceListKey
                ? choiceListMap.get(field.choiceListKey) ?? null
                : null;
            if (field.fieldType === LocationFieldType.CHOICE && !choiceListId) {
              throw new Error(`Choice list missing for location field ${field.fieldKey}`);
            }
            await tx.locationTypeField.create({
              data: {
                locationTypeId: created.id,
                fieldKey: field.fieldKey,
                fieldLabel: field.fieldLabel,
                fieldType: field.fieldType,
                required: Boolean(field.required),
                listOrder: 0,
                formOrder: 0,
                choiceListId
              }
            });
          }
        }

        for (const rule of safeLocationRules) {
          const parentTypeId = locationTypeMap.get(rule.parentKey);
          const childTypeId = locationTypeMap.get(rule.childKey);
          if (!parentTypeId || !childTypeId) continue;
          await tx.locationTypeRule.create({
            data: {
              parentTypeId,
              childTypeId,
              allowed: rule.allowed ?? true
            }
          });
        }

        for (const relationship of safeRelationshipTypes) {
          if (!relationship.enabled) continue;
          const created = await tx.relationshipType.create({
            data: {
              worldId,
              name: relationship.name,
              description: relationship.description,
              isPeerable: relationship.isPeerable,
              fromLabel: relationship.fromLabel,
              toLabel: relationship.toLabel,
              pastFromLabel: relationship.pastFromLabel,
              pastToLabel: relationship.pastToLabel
            }
          });

          for (const mapping of relationship.roleMappings ?? []) {
            const fromEntityTypeId = entityTypeMap.get(mapping.fromTypeKey);
            const toEntityTypeId = entityTypeMap.get(mapping.toTypeKey);
            if (!fromEntityTypeId || !toEntityTypeId) continue;
            await tx.relationshipTypeRule.create({
              data: {
                relationshipTypeId: created.id,
                fromEntityTypeId,
                toEntityTypeId
              }
            });
          }
        }

        return {
          entityTypes: entityTypeMap.size,
          locationTypes: locationTypeMap.size,
          relationships: safeRelationshipTypes.filter((entry) => entry.enabled).length
        };
      });

      res.json({ ok: true, created: result });
    } catch (error) {
      res.status(500).json({ error: "Failed to apply pack." });
    }
  });
};

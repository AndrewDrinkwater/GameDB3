import express from "express";
import { Prisma, LocationFieldType } from "@prisma/client";
import { prisma, requireAuth, isAdmin, canAccessWorld, isWorldArchitect, buildLocationAccessFilter } from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";

export const registerLocationTypesRoutes = (app: express.Express) => {
  app.get("/api/location-types", requireAuth, async (req, res) => {
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

    const locationTypes = await prisma.locationType.findMany({
      where: worldId ? { worldId } : {},
      orderBy: { name: "asc" }
    });

    res.json(locationTypes);
  });

  app.post("/api/location-types", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { worldId, name, description, icon, colour, menu, metadata } = req.body as {
      worldId?: string;
      name?: string;
      description?: string;
      icon?: string | null;
      colour?: string | null;
      menu?: boolean;
      metadata?: Prisma.InputJsonValue;
    };

    if (!worldId || !name) {
      res.status(400).json({ error: "worldId and name are required." });
      return;
    }

    if (!isAdmin(user) && !(await isWorldArchitect(user.id, worldId))) {
      res.status(403).json({ error: "Only world architects can create location types." });
      return;
    }

    const locationType = await prisma.locationType.create({
      data: {
        worldId,
        name,
        description,
        icon,
        colour,
        menu: menu ?? false,
        metadata: metadata ?? undefined
      }
    });

    res.status(201).json(locationType);
  });

  app.get("/api/location-types/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const locationType = await prisma.locationType.findUnique({
      where: { id }
    });
    if (!locationType) {
      res.status(404).json({ error: "Location type not found." });
      return;
    }

    if (!isAdmin(user) && !(await canAccessWorld(user.id, locationType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    res.json(locationType);
  });

  app.put("/api/location-types/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const locationType = await prisma.locationType.findUnique({
      where: { id },
      select: { worldId: true }
    });
    if (!locationType) {
      res.status(404).json({ error: "Location type not found." });
      return;
    }

    if (!isAdmin(user) && !(await isWorldArchitect(user.id, locationType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const { name, description, icon, colour, menu, metadata } = req.body as {
      name?: string;
      description?: string;
      icon?: string | null;
      colour?: string | null;
      menu?: boolean;
      metadata?: Prisma.InputJsonValue;
    };

    const updated = await prisma.locationType.update({
      where: { id },
      data: {
        name,
        description,
        icon,
        colour,
        menu,
        metadata: metadata ?? undefined
      }
    });

    res.json(updated);
  });

  app.delete("/api/location-types/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const locationType = await prisma.locationType.findUnique({
      where: { id },
      select: { worldId: true }
    });
    if (!locationType) {
      res.status(404).json({ error: "Location type not found." });
      return;
    }

    if (!isAdmin(user) && !(await isWorldArchitect(user.id, locationType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const locationCount = await prisma.location.count({ where: { locationTypeId: id } });
    if (locationCount > 0) {
      res.status(400).json({ error: "Location type is in use." });
      return;
    }

    await prisma.locationType.delete({ where: { id } });
    res.json({ ok: true });
  });

  app.get("/api/location-type-stats", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId =
      typeof req.query.characterId === "string" ? req.query.characterId : undefined;

    if (!worldId) {
      res.json([]);
      return;
    }

    if (!isAdmin(user) && !(await canAccessWorld(user.id, worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const types = await prisma.locationType.findMany({
      where: { worldId, menu: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    });

    if (types.length === 0) {
      res.json([]);
      return;
    }

    const accessFilter = isAdmin(user)
      ? { worldId }
      : await buildLocationAccessFilter(user, worldId, campaignId, characterId);

    const grouped = await prisma.location.groupBy({
      by: ["locationTypeId"],
      where: accessFilter,
      _count: { _all: true }
    });

    const countMap = new Map(grouped.map((entry) => [entry.locationTypeId, entry._count._all]));

    res.json(
      types.map((type) => ({
        id: type.id,
        name: type.name,
        count: countMap.get(type.id) ?? 0
      }))
    );
  });

  app.get("/api/location-type-fields", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const locationTypeId =
      typeof req.query.locationTypeId === "string" ? req.query.locationTypeId : undefined;
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    if (!locationTypeId) {
      if (worldId && !isAdmin(user) && !(await isWorldArchitect(user.id, worldId))) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }

      const fields = await prisma.locationTypeField.findMany({
        where: {
          ...(worldId ? { locationType: { worldId } } : {}),
          ...(isAdmin(user) || worldId
            ? {}
            : {
                locationType: {
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

    const locationType = await prisma.locationType.findUnique({
      where: { id: locationTypeId },
      select: { worldId: true }
    });
    if (!locationType) {
      res.status(404).json({ error: "Location type not found." });
      return;
    }

    if (!isAdmin(user) && !(await canAccessWorld(user.id, locationType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const fields = await prisma.locationTypeField.findMany({
      where: { locationTypeId },
      include: { choiceList: { include: { options: true } } },
      orderBy: { formOrder: "asc" }
    });

    res.json(fields);
  });

  app.get("/api/location-type-fields/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const field = await prisma.locationTypeField.findUnique({
      where: { id },
      include: {
        locationType: { select: { worldId: true } },
        choiceList: { include: { options: true } }
      }
    });
    if (!field) {
      res.status(404).json({ error: "Location field not found." });
      return;
    }

    if (!isAdmin(user) && !(await canAccessWorld(user.id, field.locationType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const { locationType, ...fieldData } = field;
    res.json(fieldData);
  });

  app.post("/api/location-type-fields", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const {
      locationTypeId,
      fieldKey,
      fieldLabel,
      fieldType,
      required,
      defaultValue,
      validationRules,
      choiceListId,
      listOrder,
      formOrder
    } = req.body as {
      locationTypeId?: string;
      fieldKey?: string;
      fieldLabel?: string;
      fieldType?: LocationFieldType;
      required?: boolean;
      defaultValue?: Prisma.InputJsonValue;
      validationRules?: Prisma.InputJsonValue;
      choiceListId?: string;
      listOrder?: number;
      formOrder?: number;
    };

    if (!locationTypeId || !fieldKey || !fieldLabel || !fieldType) {
      res.status(400).json({ error: "locationTypeId, fieldKey, fieldLabel, and fieldType are required." });
      return;
    }

    const locationType = await prisma.locationType.findUnique({
      where: { id: locationTypeId },
      select: { worldId: true }
    });
    if (!locationType) {
      res.status(404).json({ error: "Location type not found." });
      return;
    }

    if (!isAdmin(user) && !(await isWorldArchitect(user.id, locationType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    let resolvedChoiceListId: string | null = choiceListId ?? null;
    if (fieldType !== LocationFieldType.CHOICE) {
      resolvedChoiceListId = null;
    }
    if (fieldType === LocationFieldType.CHOICE && !resolvedChoiceListId) {
      res.status(400).json({ error: "choiceListId is required for choice fields." });
      return;
    }
    if (resolvedChoiceListId) {
      const choiceList = await prisma.choiceList.findUnique({
        where: { id: resolvedChoiceListId },
        select: { scope: true, worldId: true }
      });
      if (!choiceList || choiceList.scope !== "WORLD" || choiceList.worldId !== locationType.worldId) {
        res.status(400).json({ error: "Choice list must belong to the location type world." });
        return;
      }
    }

    try {
      const field = await prisma.locationTypeField.create({
        data: {
          locationTypeId,
          fieldKey,
          fieldLabel,
          fieldType,
          required: Boolean(required),
          defaultValue: defaultValue ?? undefined,
          validationRules: validationRules ?? undefined,
          choiceListId: resolvedChoiceListId,
          listOrder: listOrder ?? 0,
          formOrder: formOrder ?? 0
        }
      });
      res.status(201).json(field);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({ error: "Field key already exists for this location type." });
        return;
      }
      throw error;
    }
  });

  app.put("/api/location-type-fields/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.locationTypeField.findUnique({
      where: { id },
      select: { locationType: { select: { worldId: true } } }
    });
    if (!existing) {
      res.status(404).json({ error: "Location field not found." });
      return;
    }

    if (!isAdmin(user) && !(await isWorldArchitect(user.id, existing.locationType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const {
      fieldKey,
      fieldLabel,
      fieldType,
      required,
      defaultValue,
      validationRules,
      choiceListId,
      listOrder,
      formOrder
    } = req.body as {
      fieldKey?: string;
      fieldLabel?: string;
      fieldType?: LocationFieldType;
      required?: boolean;
      defaultValue?: Prisma.InputJsonValue;
      validationRules?: Prisma.InputJsonValue;
      choiceListId?: string;
      listOrder?: number;
      formOrder?: number;
    };

    let resolvedChoiceListId: string | null | undefined = choiceListId ?? null;
    if (fieldType && fieldType !== LocationFieldType.CHOICE) {
      resolvedChoiceListId = null;
    }
    if (fieldType === LocationFieldType.CHOICE && !resolvedChoiceListId) {
      res.status(400).json({ error: "choiceListId is required for choice fields." });
      return;
    }
    if (resolvedChoiceListId) {
      const choiceList = await prisma.choiceList.findUnique({
        where: { id: resolvedChoiceListId },
        select: { scope: true, worldId: true }
      });
      if (!choiceList || choiceList.scope !== "WORLD" || choiceList.worldId !== existing.locationType.worldId) {
        res.status(400).json({ error: "Choice list must belong to the location type world." });
        return;
      }
    }

    const field = await prisma.locationTypeField.update({
      where: { id },
      data: {
        fieldKey,
        fieldLabel,
        fieldType,
        required,
        defaultValue: defaultValue ?? undefined,
        validationRules: validationRules ?? undefined,
        choiceListId: resolvedChoiceListId,
        listOrder,
        formOrder
      }
    });

    res.json(field);
  });

  app.delete("/api/location-type-fields/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.locationTypeField.findUnique({
      where: { id },
      select: { locationType: { select: { worldId: true } } }
    });
    if (!existing) {
      res.status(404).json({ error: "Location field not found." });
      return;
    }

    if (!isAdmin(user) && !(await isWorldArchitect(user.id, existing.locationType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    await prisma.locationTypeField.delete({ where: { id } });
    res.json({ ok: true });
  });


  app.get("/api/location-type-rules", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    if (!isAdmin(user) && worldId && !(await isWorldArchitect(user.id, worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    if (!isAdmin(user) && !worldId) {
      res.json([]);
      return;
    }

    const rules = await prisma.locationTypeRule.findMany({
      where: worldId ? { parentType: { worldId } } : {},
      orderBy: { createdAt: "desc" }
    });
    res.json(rules);
  });

  app.get("/api/location-type-rules/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const rule = await prisma.locationTypeRule.findUnique({
      where: { id },
      include: { parentType: { select: { worldId: true } } }
    });
    if (!rule) {
      res.status(404).json({ error: "Location type rule not found." });
      return;
    }

    if (!isAdmin(user) && !(await isWorldArchitect(user.id, rule.parentType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const { parentType, ...ruleData } = rule;
    res.json(ruleData);
  });

  app.post("/api/location-type-rules", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { parentTypeId, childTypeId, allowed } = req.body as {
      parentTypeId?: string;
      childTypeId?: string;
      allowed?: boolean;
    };

    if (!parentTypeId || !childTypeId) {
      res.status(400).json({ error: "parentTypeId and childTypeId are required." });
      return;
    }

    const parentType = await prisma.locationType.findUnique({
      where: { id: parentTypeId },
      select: { worldId: true }
    });
    const childType = await prisma.locationType.findUnique({
      where: { id: childTypeId },
      select: { worldId: true }
    });
    if (!parentType || !childType) {
      res.status(404).json({ error: "Location type not found." });
      return;
    }
    if (parentType.worldId !== childType.worldId) {
      res.status(400).json({ error: "Location types must belong to the same world." });
      return;
    }

    if (!isAdmin(user) && !(await isWorldArchitect(user.id, parentType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    try {
      const rule = await prisma.locationTypeRule.create({
        data: {
          parentTypeId,
          childTypeId,
          allowed: allowed ?? true
        }
      });
      res.status(201).json(rule);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({ error: "Rule already exists for this type pair." });
        return;
      }
      throw error;
    }
  });

  app.put("/api/location-type-rules/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.locationTypeRule.findUnique({
      where: { id },
      select: { parentType: { select: { worldId: true } } }
    });
    if (!existing) {
      res.status(404).json({ error: "Location type rule not found." });
      return;
    }

    if (!isAdmin(user) && !(await isWorldArchitect(user.id, existing.parentType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const { allowed } = req.body as { allowed?: boolean };
    const rule = await prisma.locationTypeRule.update({
      where: { id },
      data: { allowed: allowed ?? undefined }
    });

    res.json(rule);
  });

  app.delete("/api/location-type-rules/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.locationTypeRule.findUnique({
      where: { id },
      select: { parentType: { select: { worldId: true } } }
    });
    if (!existing) {
      res.status(404).json({ error: "Location type rule not found." });
      return;
    }

    if (!isAdmin(user) && !(await isWorldArchitect(user.id, existing.parentType.worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    await prisma.locationTypeRule.delete({ where: { id } });
    res.json({ ok: true });
  });

};

import express from "express";
import { EntityFieldType, LocationFieldType, Prisma } from "@prisma/client";
import { prisma, requireAuth, requireSystemAdmin } from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";

const parseOptionalJson = (value?: unknown) => {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "object") return value as Prisma.InputJsonValue;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Prisma.InputJsonValue;
    } catch {
      return null;
    }
  }
  return null;
};

export const registerPackRoutes = (app: express.Express) => {
  app.get("/api/packs", requireAuth, requireSystemAdmin, async (_req, res) => {
    const packs = await prisma.pack.findMany({
      orderBy: { name: "asc" }
    });
    res.json(packs);
  });

  app.post("/api/packs", requireAuth, requireSystemAdmin, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { name, description, posture, isActive } = req.body as {
      name?: string;
      description?: string;
      posture?: string;
      isActive?: boolean;
    };

    if (!name || !posture) {
      res.status(400).json({ error: "name and posture are required." });
      return;
    }

    const pack = await prisma.pack.create({
      data: {
        name,
        description,
        posture: posture as "opinionated" | "minimal",
        isActive: isActive ?? true,
        createdById: user.id
      }
    });
    res.status(201).json(pack);
  });

  app.get("/api/packs/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const pack = await prisma.pack.findUnique({ where: { id: req.params.id } });
    if (!pack) {
      res.status(404).json({ error: "Pack not found." });
      return;
    }
    res.json(pack);
  });

  app.put("/api/packs/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const { name, description, posture, isActive } = req.body as {
      name?: string;
      description?: string;
      posture?: string;
      isActive?: boolean;
    };

    const pack = await prisma.pack.update({
      where: { id: req.params.id },
      data: {
        name,
        description,
        posture: posture as "opinionated" | "minimal" | undefined,
        isActive
      }
    });
    res.json(pack);
  });

  app.delete("/api/packs/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.pack.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });
    res.json({ ok: true });
  });

  app.get("/api/entity-type-templates", requireAuth, requireSystemAdmin, async (req, res) => {
    const packId = typeof req.query.packId === "string" ? req.query.packId : undefined;
    const templates = await prisma.entityTypeTemplate.findMany({
      where: packId ? { packId } : {},
      orderBy: { name: "asc" }
    });
    res.json(templates);
  });

  app.post("/api/entity-type-templates", requireAuth, requireSystemAdmin, async (req, res) => {
    const { packId, name, description, category, isCore } = req.body as {
      packId?: string;
      name?: string;
      description?: string;
      category?: string;
      isCore?: boolean;
    };

    if (!packId || !name) {
      res.status(400).json({ error: "packId and name are required." });
      return;
    }

    const template = await prisma.entityTypeTemplate.create({
      data: {
        packId,
        name,
        description,
        category,
        isCore: Boolean(isCore)
      }
    });
    res.status(201).json(template);
  });

  app.get("/api/entity-type-templates/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const template = await prisma.entityTypeTemplate.findUnique({
      where: { id: req.params.id }
    });
    if (!template) {
      res.status(404).json({ error: "Template not found." });
      return;
    }
    res.json(template);
  });

  app.put("/api/entity-type-templates/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const { name, description, category, isCore, packId } = req.body as {
      name?: string;
      description?: string;
      category?: string;
      isCore?: boolean;
      packId?: string;
    };

    const template = await prisma.entityTypeTemplate.update({
      where: { id: req.params.id },
      data: {
        name,
        description,
        category,
        isCore,
        packId
      }
    });
    res.json(template);
  });

  app.delete("/api/entity-type-templates/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.entityTypeTemplate.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });

  app.get("/api/entity-type-template-fields", requireAuth, requireSystemAdmin, async (req, res) => {
    const templateId =
      typeof req.query.templateId === "string" ? req.query.templateId : undefined;
    const fields = await prisma.entityTypeTemplateField.findMany({
      where: templateId ? { templateId } : {},
      orderBy: { fieldLabel: "asc" }
    });
    res.json(
      fields.map((field) => ({
        ...field,
        choices: field.choices ? JSON.stringify(field.choices) : null,
        validationRules: field.validationRules ? JSON.stringify(field.validationRules) : null
      }))
    );
  });

  app.post("/api/entity-type-template-fields", requireAuth, requireSystemAdmin, async (req, res) => {
    const {
      templateId,
      fieldKey,
      fieldLabel,
      fieldType,
      required,
      defaultEnabled,
      choices,
      validationRules
    } = req.body as {
      templateId?: string;
      fieldKey?: string;
      fieldLabel?: string;
      fieldType?: string;
      required?: boolean;
      defaultEnabled?: boolean;
      choices?: unknown;
      validationRules?: unknown;
    };

    if (!templateId || !fieldKey || !fieldLabel || !fieldType) {
      res.status(400).json({ error: "templateId, fieldKey, fieldLabel, and fieldType are required." });
      return;
    }

    const parsedChoices = parseOptionalJson(choices);
    const parsedRules = parseOptionalJson(validationRules);
    if (parsedChoices === null || parsedRules === null) {
      res.status(400).json({ error: "choices and validationRules must be valid JSON." });
      return;
    }

    const field = await prisma.entityTypeTemplateField.create({
      data: {
        templateId,
        fieldKey,
        fieldLabel,
        fieldType: fieldType as EntityFieldType,
        required: Boolean(required),
        defaultEnabled: defaultEnabled ?? true,
        choices: parsedChoices,
        validationRules: parsedRules
      }
    });
    res.status(201).json(field);
  });

  app.get("/api/entity-type-template-fields/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const field = await prisma.entityTypeTemplateField.findUnique({
      where: { id: req.params.id }
    });
    if (!field) {
      res.status(404).json({ error: "Template field not found." });
      return;
    }
    res.json({
      ...field,
      choices: field.choices ? JSON.stringify(field.choices) : null,
      validationRules: field.validationRules ? JSON.stringify(field.validationRules) : null
    });
  });

  app.put("/api/entity-type-template-fields/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const {
      templateId,
      fieldKey,
      fieldLabel,
      fieldType,
      required,
      defaultEnabled,
      choices,
      validationRules
    } = req.body as {
      templateId?: string;
      fieldKey?: string;
      fieldLabel?: string;
      fieldType?: string;
      required?: boolean;
      defaultEnabled?: boolean;
      choices?: unknown;
      validationRules?: unknown;
    };

    const parsedChoices = parseOptionalJson(choices);
    const parsedRules = parseOptionalJson(validationRules);
    if (parsedChoices === null || parsedRules === null) {
      res.status(400).json({ error: "choices and validationRules must be valid JSON." });
      return;
    }

    const field = await prisma.entityTypeTemplateField.update({
      where: { id: req.params.id },
      data: {
        templateId,
        fieldKey,
        fieldLabel,
        fieldType: fieldType as EntityFieldType | undefined,
        required,
        defaultEnabled,
        choices: parsedChoices,
        validationRules: parsedRules
      }
    });
    res.json(field);
  });

  app.delete("/api/entity-type-template-fields/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.entityTypeTemplateField.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });

  app.get("/api/location-type-templates", requireAuth, requireSystemAdmin, async (req, res) => {
    const packId = typeof req.query.packId === "string" ? req.query.packId : undefined;
    const templates = await prisma.locationTypeTemplate.findMany({
      where: packId ? { packId } : {},
      orderBy: { name: "asc" }
    });
    res.json(templates);
  });

  app.post("/api/location-type-templates", requireAuth, requireSystemAdmin, async (req, res) => {
    const { packId, name, description, isCore } = req.body as {
      packId?: string;
      name?: string;
      description?: string;
      isCore?: boolean;
    };

    if (!packId || !name) {
      res.status(400).json({ error: "packId and name are required." });
      return;
    }

    const template = await prisma.locationTypeTemplate.create({
      data: {
        packId,
        name,
        description,
        isCore: Boolean(isCore)
      }
    });
    res.status(201).json(template);
  });

  app.get("/api/location-type-templates/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const template = await prisma.locationTypeTemplate.findUnique({
      where: { id: req.params.id }
    });
    if (!template) {
      res.status(404).json({ error: "Template not found." });
      return;
    }
    res.json(template);
  });

  app.put("/api/location-type-templates/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const { packId, name, description, isCore } = req.body as {
      packId?: string;
      name?: string;
      description?: string;
      isCore?: boolean;
    };

    const template = await prisma.locationTypeTemplate.update({
      where: { id: req.params.id },
      data: {
        packId,
        name,
        description,
        isCore
      }
    });
    res.json(template);
  });

  app.delete("/api/location-type-templates/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.locationTypeTemplate.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });

  app.get("/api/location-type-template-fields", requireAuth, requireSystemAdmin, async (req, res) => {
    const templateId =
      typeof req.query.templateId === "string" ? req.query.templateId : undefined;
    const fields = await prisma.locationTypeTemplateField.findMany({
      where: templateId ? { templateId } : {},
      orderBy: { fieldLabel: "asc" }
    });
    res.json(
      fields.map((field) => ({
        ...field,
        choices: field.choices ? JSON.stringify(field.choices) : null,
        validationRules: field.validationRules ? JSON.stringify(field.validationRules) : null
      }))
    );
  });

  app.post("/api/location-type-template-fields", requireAuth, requireSystemAdmin, async (req, res) => {
    const {
      templateId,
      fieldKey,
      fieldLabel,
      fieldType,
      required,
      defaultEnabled,
      choices,
      validationRules
    } = req.body as {
      templateId?: string;
      fieldKey?: string;
      fieldLabel?: string;
      fieldType?: string;
      required?: boolean;
      defaultEnabled?: boolean;
      choices?: unknown;
      validationRules?: unknown;
    };

    if (!templateId || !fieldKey || !fieldLabel || !fieldType) {
      res.status(400).json({ error: "templateId, fieldKey, fieldLabel, and fieldType are required." });
      return;
    }

    const parsedChoices = parseOptionalJson(choices);
    const parsedRules = parseOptionalJson(validationRules);
    if (parsedChoices === null || parsedRules === null) {
      res.status(400).json({ error: "choices and validationRules must be valid JSON." });
      return;
    }

    const field = await prisma.locationTypeTemplateField.create({
      data: {
        templateId,
        fieldKey,
        fieldLabel,
        fieldType: fieldType as LocationFieldType,
        required: Boolean(required),
        defaultEnabled: defaultEnabled ?? true,
        choices: parsedChoices,
        validationRules: parsedRules
      }
    });
    res.status(201).json(field);
  });

  app.get("/api/location-type-template-fields/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const field = await prisma.locationTypeTemplateField.findUnique({
      where: { id: req.params.id }
    });
    if (!field) {
      res.status(404).json({ error: "Template field not found." });
      return;
    }
    res.json({
      ...field,
      choices: field.choices ? JSON.stringify(field.choices) : null,
      validationRules: field.validationRules ? JSON.stringify(field.validationRules) : null
    });
  });

  app.put("/api/location-type-template-fields/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const {
      templateId,
      fieldKey,
      fieldLabel,
      fieldType,
      required,
      defaultEnabled,
      choices,
      validationRules
    } = req.body as {
      templateId?: string;
      fieldKey?: string;
      fieldLabel?: string;
      fieldType?: string;
      required?: boolean;
      defaultEnabled?: boolean;
      choices?: unknown;
      validationRules?: unknown;
    };

    const parsedChoices = parseOptionalJson(choices);
    const parsedRules = parseOptionalJson(validationRules);
    if (parsedChoices === null || parsedRules === null) {
      res.status(400).json({ error: "choices and validationRules must be valid JSON." });
      return;
    }

    const field = await prisma.locationTypeTemplateField.update({
      where: { id: req.params.id },
      data: {
        templateId,
        fieldKey,
        fieldLabel,
        fieldType: fieldType as LocationFieldType | undefined,
        required,
        defaultEnabled,
        choices: parsedChoices,
        validationRules: parsedRules
      }
    });
    res.json(field);
  });

  app.delete("/api/location-type-template-fields/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.locationTypeTemplateField.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });

  app.get("/api/location-type-rule-templates", requireAuth, requireSystemAdmin, async (req, res) => {
    const packId = typeof req.query.packId === "string" ? req.query.packId : undefined;
    const rules = await prisma.locationTypeRuleTemplate.findMany({
      where: packId ? { packId } : {},
      orderBy: { createdAt: "desc" }
    });
    res.json(rules);
  });

  app.post("/api/location-type-rule-templates", requireAuth, requireSystemAdmin, async (req, res) => {
    const { packId, parentLocationTypeTemplateId, childLocationTypeTemplateId } = req.body as {
      packId?: string;
      parentLocationTypeTemplateId?: string;
      childLocationTypeTemplateId?: string;
    };

    if (!packId || !parentLocationTypeTemplateId || !childLocationTypeTemplateId) {
      res.status(400).json({ error: "packId, parentLocationTypeTemplateId, and childLocationTypeTemplateId are required." });
      return;
    }

    const rule = await prisma.locationTypeRuleTemplate.create({
      data: {
        packId,
        parentLocationTypeTemplateId,
        childLocationTypeTemplateId
      }
    });
    res.status(201).json(rule);
  });

  app.get("/api/location-type-rule-templates/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const rule = await prisma.locationTypeRuleTemplate.findUnique({
      where: { id: req.params.id }
    });
    if (!rule) {
      res.status(404).json({ error: "Rule not found." });
      return;
    }
    res.json(rule);
  });

  app.put("/api/location-type-rule-templates/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const { packId, parentLocationTypeTemplateId, childLocationTypeTemplateId } = req.body as {
      packId?: string;
      parentLocationTypeTemplateId?: string;
      childLocationTypeTemplateId?: string;
    };

    const rule = await prisma.locationTypeRuleTemplate.update({
      where: { id: req.params.id },
      data: {
        packId,
        parentLocationTypeTemplateId,
        childLocationTypeTemplateId
      }
    });
    res.json(rule);
  });

  app.delete("/api/location-type-rule-templates/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.locationTypeRuleTemplate.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });

  app.get("/api/relationship-type-templates", requireAuth, requireSystemAdmin, async (req, res) => {
    const packId = typeof req.query.packId === "string" ? req.query.packId : undefined;
    const templates = await prisma.relationshipTypeTemplate.findMany({
      where: packId ? { packId } : {},
      orderBy: { name: "asc" }
    });
    res.json(templates);
  });

  app.post("/api/relationship-type-templates", requireAuth, requireSystemAdmin, async (req, res) => {
    const {
      packId,
      name,
      description,
      isPeerable,
      fromLabel,
      toLabel,
      pastFromLabel,
      pastToLabel
    } = req.body as {
      packId?: string;
      name?: string;
      description?: string;
      isPeerable?: boolean;
      fromLabel?: string;
      toLabel?: string;
      pastFromLabel?: string;
      pastToLabel?: string;
    };

    if (!packId || !name || !fromLabel || !toLabel) {
      res.status(400).json({ error: "packId, name, fromLabel, and toLabel are required." });
      return;
    }

    const template = await prisma.relationshipTypeTemplate.create({
      data: {
        packId,
        name,
        description,
        isPeerable: Boolean(isPeerable),
        fromLabel,
        toLabel,
        pastFromLabel,
        pastToLabel
      }
    });
    res.status(201).json(template);
  });

  app.get("/api/relationship-type-templates/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const template = await prisma.relationshipTypeTemplate.findUnique({
      where: { id: req.params.id }
    });
    if (!template) {
      res.status(404).json({ error: "Template not found." });
      return;
    }
    res.json(template);
  });

  app.put("/api/relationship-type-templates/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const {
      packId,
      name,
      description,
      isPeerable,
      fromLabel,
      toLabel,
      pastFromLabel,
      pastToLabel
    } = req.body as {
      packId?: string;
      name?: string;
      description?: string;
      isPeerable?: boolean;
      fromLabel?: string;
      toLabel?: string;
      pastFromLabel?: string;
      pastToLabel?: string;
    };

    const template = await prisma.relationshipTypeTemplate.update({
      where: { id: req.params.id },
      data: {
        packId,
        name,
        description,
        isPeerable,
        fromLabel,
        toLabel,
        pastFromLabel,
        pastToLabel
      }
    });
    res.json(template);
  });

  app.delete("/api/relationship-type-templates/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.relationshipTypeTemplate.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });

  app.get("/api/relationship-type-template-roles", requireAuth, requireSystemAdmin, async (req, res) => {
    const relationshipTypeTemplateId =
      typeof req.query.relationshipTypeTemplateId === "string"
        ? req.query.relationshipTypeTemplateId
        : undefined;
    const roles = await prisma.relationshipTypeTemplateRole.findMany({
      where: relationshipTypeTemplateId ? { relationshipTypeTemplateId } : {},
      orderBy: { createdAt: "asc" }
    });
    res.json(roles);
  });

  app.post("/api/relationship-type-template-roles", requireAuth, requireSystemAdmin, async (req, res) => {
    const { relationshipTypeTemplateId, fromRole, toRole } = req.body as {
      relationshipTypeTemplateId?: string;
      fromRole?: string;
      toRole?: string;
    };

    if (!relationshipTypeTemplateId || !fromRole || !toRole) {
      res.status(400).json({ error: "relationshipTypeTemplateId, fromRole, and toRole are required." });
      return;
    }

    const role = await prisma.relationshipTypeTemplateRole.create({
      data: {
        relationshipTypeTemplateId,
        fromRole,
        toRole
      }
    });
    res.status(201).json(role);
  });

  app.get("/api/relationship-type-template-roles/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const role = await prisma.relationshipTypeTemplateRole.findUnique({
      where: { id: req.params.id }
    });
    if (!role) {
      res.status(404).json({ error: "Role not found." });
      return;
    }
    res.json(role);
  });

  app.put("/api/relationship-type-template-roles/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const { relationshipTypeTemplateId, fromRole, toRole } = req.body as {
      relationshipTypeTemplateId?: string;
      fromRole?: string;
      toRole?: string;
    };

    const role = await prisma.relationshipTypeTemplateRole.update({
      where: { id: req.params.id },
      data: {
        relationshipTypeTemplateId,
        fromRole,
        toRole
      }
    });
    res.json(role);
  });

  app.delete("/api/relationship-type-template-roles/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.relationshipTypeTemplateRole.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });
};

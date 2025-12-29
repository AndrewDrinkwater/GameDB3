import express from "express";
import { Prisma, ChoiceScope } from "@prisma/client";
import { prisma, requireAuth, isAdmin, isWorldArchitect } from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";

export const registerChoiceRoutes = (app: express.Express) => {
  app.get("/api/choice-lists", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const scope = typeof req.query.scope === "string" ? req.query.scope : undefined;
    const packId = typeof req.query.packId === "string" ? req.query.packId : undefined;
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;

    const whereClause: Prisma.ChoiceListWhereInput = {};
    if (scope && Object.values(ChoiceScope).includes(scope as ChoiceScope)) {
      whereClause.scope = scope as ChoiceScope;
    }
    if (packId) {
      whereClause.packId = packId;
    }
    if (worldId) {
      whereClause.worldId = worldId;
    }

    if (!isAdmin(user)) {
      if (!worldId) {
        res.json([]);
        return;
      }
      const canAccess = await isWorldArchitect(user.id, worldId);
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      whereClause.scope = ChoiceScope.WORLD;
      whereClause.worldId = worldId;
      delete whereClause.packId;
    }

    const lists = await prisma.choiceList.findMany({
      where: whereClause,
      orderBy: { name: "asc" }
    });
    res.json(lists);
  });

  app.get("/api/choice-lists/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const list = await prisma.choiceList.findUnique({ where: { id: req.params.id } });
    if (!list) {
      res.status(404).json({ error: "Choice list not found." });
      return;
    }

    if (!isAdmin(user)) {
      if (list.scope !== ChoiceScope.WORLD || !list.worldId) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      const canAccess = await isWorldArchitect(user.id, list.worldId);
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }

    res.json(list);
  });

  app.post("/api/choice-lists", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { name, description, scope, packId, worldId } = req.body as {
      name?: string;
      description?: string;
      scope?: ChoiceScope;
      packId?: string;
      worldId?: string;
    };

    if (!name || !scope) {
      res.status(400).json({ error: "name and scope are required." });
      return;
    }

    if (scope === ChoiceScope.PACK && !packId) {
      res.status(400).json({ error: "packId is required for pack-scoped lists." });
      return;
    }

    if (scope === ChoiceScope.WORLD && !worldId) {
      res.status(400).json({ error: "worldId is required for world-scoped lists." });
      return;
    }

    if (!isAdmin(user)) {
      if (scope !== ChoiceScope.WORLD || !worldId) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      const canAccess = await isWorldArchitect(user.id, worldId);
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }

    const list = await prisma.choiceList.create({
      data: {
        name,
        description,
        scope,
        packId: scope === ChoiceScope.PACK ? packId ?? null : null,
        worldId: scope === ChoiceScope.WORLD ? worldId ?? null : null
      }
    });
    res.status(201).json(list);
  });

  app.put("/api/choice-lists/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const existing = await prisma.choiceList.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Choice list not found." });
      return;
    }

    if (!isAdmin(user)) {
      if (existing.scope !== ChoiceScope.WORLD || !existing.worldId) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      const canAccess = await isWorldArchitect(user.id, existing.worldId);
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }

    const { name, description } = req.body as {
      name?: string;
      description?: string;
    };

    const list = await prisma.choiceList.update({
      where: { id: req.params.id },
      data: { name, description }
    });
    res.json(list);
  });

  app.delete("/api/choice-lists/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const existing = await prisma.choiceList.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Choice list not found." });
      return;
    }

    if (!isAdmin(user)) {
      if (existing.scope !== ChoiceScope.WORLD || !existing.worldId) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      const canAccess = await isWorldArchitect(user.id, existing.worldId);
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }

    await prisma.choiceOption.deleteMany({ where: { choiceListId: existing.id } });
    await prisma.choiceList.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  });

  app.get("/api/choice-options", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const choiceListId =
      typeof req.query.choiceListId === "string" ? req.query.choiceListId : undefined;

    const whereClause: Prisma.ChoiceOptionWhereInput = choiceListId
      ? { choiceListId }
      : {};

    if (!isAdmin(user)) {
      if (!choiceListId) {
        res.json([]);
        return;
      }
      const list = await prisma.choiceList.findUnique({
        where: { id: choiceListId },
        select: { scope: true, worldId: true }
      });
      if (!list || list.scope !== ChoiceScope.WORLD || !list.worldId) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      const canAccess = await isWorldArchitect(user.id, list.worldId);
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }

    const options = await prisma.choiceOption.findMany({
      where: whereClause,
      orderBy: { order: "asc" }
    });
    res.json(options);
  });

  app.get("/api/choice-options/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const option = await prisma.choiceOption.findUnique({
      where: { id: req.params.id },
      include: { choiceList: { select: { scope: true, worldId: true } } }
    });
    if (!option) {
      res.status(404).json({ error: "Choice option not found." });
      return;
    }

    if (!isAdmin(user)) {
      if (option.choiceList.scope !== ChoiceScope.WORLD || !option.choiceList.worldId) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      const canAccess = await isWorldArchitect(user.id, option.choiceList.worldId);
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }

    const { choiceList, ...optionData } = option;
    res.json(optionData);
  });

  app.post("/api/choice-options", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { choiceListId, value, label, order, isActive } = req.body as {
      choiceListId?: string;
      value?: string;
      label?: string;
      order?: number;
      isActive?: boolean;
    };

    if (!choiceListId || !value || !label) {
      res.status(400).json({ error: "choiceListId, value, and label are required." });
      return;
    }

    const list = await prisma.choiceList.findUnique({
      where: { id: choiceListId },
      select: { scope: true, worldId: true }
    });
    if (!list) {
      res.status(404).json({ error: "Choice list not found." });
      return;
    }

    if (!isAdmin(user)) {
      if (list.scope !== ChoiceScope.WORLD || !list.worldId) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      const canAccess = await isWorldArchitect(user.id, list.worldId);
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }

    try {
      const option = await prisma.choiceOption.create({
        data: {
          choiceListId,
          value,
          label,
          order: order ?? 0,
          isActive: isActive ?? true
        }
      });
      res.status(201).json(option);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({ error: "Choice value already exists for this list." });
        return;
      }
      throw error;
    }
  });

  app.put("/api/choice-options/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const existing = await prisma.choiceOption.findUnique({
      where: { id: req.params.id },
      include: { choiceList: { select: { scope: true, worldId: true } } }
    });
    if (!existing) {
      res.status(404).json({ error: "Choice option not found." });
      return;
    }

    if (!isAdmin(user)) {
      if (existing.choiceList.scope !== ChoiceScope.WORLD || !existing.choiceList.worldId) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      const canAccess = await isWorldArchitect(user.id, existing.choiceList.worldId);
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }

    const { value, label, order, isActive } = req.body as {
      value?: string;
      label?: string;
      order?: number;
      isActive?: boolean;
    };

    const option = await prisma.choiceOption.update({
      where: { id: req.params.id },
      data: {
        value,
        label,
        order,
        isActive
      }
    });
    res.json(option);
  });

  app.delete("/api/choice-options/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const existing = await prisma.choiceOption.findUnique({
      where: { id: req.params.id },
      include: { choiceList: { select: { scope: true, worldId: true } } }
    });
    if (!existing) {
      res.status(404).json({ error: "Choice option not found." });
      return;
    }

    if (!isAdmin(user)) {
      if (existing.choiceList.scope !== ChoiceScope.WORLD || !existing.choiceList.worldId) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      const canAccess = await isWorldArchitect(user.id, existing.choiceList.worldId);
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    }

    await prisma.choiceOption.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  });
};

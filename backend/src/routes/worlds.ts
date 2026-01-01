import express from "express";
import { WorldEntityPermissionScope } from "@prisma/client";
import { requireAuth } from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";
import {
  listWorlds,
  getWorldById,
  createWorld,
  updateWorld,
  deleteWorld,
  addWorldMember,
  removeWorldMember,
  isWorldAdmin
} from "../services/worldService";
import { ServiceError } from "../services/serviceError";

type MemberRole = "architect" | "campaign_creator" | "character_creator";

const handleWorldServiceError = (res: express.Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof ServiceError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(fallbackMessage, error);
  res.status(500).json({ error: fallbackMessage });
};

export const registerWorldsRoutes = (app: express.Express) => {
  app.get("/api/worlds", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;

    try {
      const worlds = await listWorlds({ user, worldId });
      res.json(worlds);
    } catch (error) {
      handleWorldServiceError(res, error, "Failed to list worlds.");
    }
  });

  app.post("/api/worlds", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const body = req.body as {
      name?: string;
      description?: string;
      dmLabelKey?: string;
      themeKey?: string;
      primaryArchitectId?: string;
      characterCreatorIds?: string[];
      entityPermissionScope?: WorldEntityPermissionScope;
    };

    try {
      const world = await createWorld({
        user,
        name: body.name ?? "",
        description: body.description ?? null,
        dmLabelKey: body.dmLabelKey ?? null,
        themeKey: body.themeKey ?? null,
        primaryArchitectId: body.primaryArchitectId,
        characterCreatorIds: body.characterCreatorIds,
        entityPermissionScope: body.entityPermissionScope ?? null
      });
      res.status(201).json(world);
    } catch (error) {
      handleWorldServiceError(res, error, "Failed to create world.");
    }
  });

  app.get("/api/worlds/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const worldId = req.params.id;

    try {
      const world = await getWorldById({ user, worldId });
      res.json(world);
    } catch (error) {
      handleWorldServiceError(res, error, "Failed to load world.");
    }
  });

  app.get("/api/worlds/:id/world-admin", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const worldId = req.params.id;

    try {
      const allowed = await isWorldAdmin({ user, worldId });
      res.json({ allowed });
    } catch (error) {
      handleWorldServiceError(res, error, "Failed to determine world admin status.");
    }
  });

  app.put("/api/worlds/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const worldId = req.params.id;
    const body = req.body as {
      name?: string;
      description?: string;
      dmLabelKey?: string;
      themeKey?: string;
      primaryArchitectId?: string;
      characterCreatorIds?: string[];
      entityPermissionScope?: WorldEntityPermissionScope;
    };

    try {
      const world = await updateWorld({
        user,
        worldId,
        name: body.name,
        description: body.description ?? null,
        dmLabelKey: body.dmLabelKey ?? null,
        themeKey: body.themeKey ?? null,
        primaryArchitectId: body.primaryArchitectId,
        characterCreatorIds: body.characterCreatorIds,
        entityPermissionScope: body.entityPermissionScope ?? null
      });
      res.json(world);
    } catch (error) {
      handleWorldServiceError(res, error, "Failed to update world.");
    }
  });

  app.delete("/api/worlds/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const worldId = req.params.id;

    try {
      await deleteWorld({ user, worldId });
      res.json({ ok: true });
    } catch (error) {
      handleWorldServiceError(res, error, "Failed to delete world.");
    }
  });

  const handleMemberRoute = async (
    req: express.Request,
    res: express.Response,
    role: MemberRole,
    action: "add" | "remove"
  ) => {
    const user = (req as AuthRequest).user!;
    const worldId = req.params.id;
    const memberId =
      action === "add" ? (req.body as { userId?: string }).userId : req.params.userId;

    if (!memberId) {
      res.status(400).json({ error: "userId is required." });
      return;
    }

    try {
      if (action === "add") {
        const result = await addWorldMember({ user, worldId, role, memberId });
        res.status(201).json(result);
      } else {
        await removeWorldMember({ user, worldId, role, memberId });
        res.json({ ok: true });
      }
    } catch (error) {
      handleWorldServiceError(res, error, "Failed to update world members.");
    }
  };

  app.post("/api/worlds/:id/architects", requireAuth, (req, res) => handleMemberRoute(req, res, "architect", "add"));
  app.delete("/api/worlds/:id/architects/:userId", requireAuth, (req, res) =>
    handleMemberRoute(req, res, "architect", "remove")
  );
  app.post("/api/worlds/:id/campaign-creators", requireAuth, (req, res) =>
    handleMemberRoute(req, res, "campaign_creator", "add")
  );
  app.delete("/api/worlds/:id/campaign-creators/:userId", requireAuth, (req, res) =>
    handleMemberRoute(req, res, "campaign_creator", "remove")
  );
  app.post("/api/worlds/:id/character-creators", requireAuth, (req, res) =>
    handleMemberRoute(req, res, "character_creator", "add")
  );
  app.delete("/api/worlds/:id/character-creators/:userId", requireAuth, (req, res) =>
    handleMemberRoute(req, res, "character_creator", "remove")
  );
};

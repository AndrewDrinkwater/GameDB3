import express from "express";
import { requireAuth } from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";
import {
  listCampaigns,
  createCampaign,
  getCampaign,
  updateCampaign,
  deleteCampaign,
  addCharacterToCampaign,
  removeCharacterFromCampaign,
  addCampaignCharacterCreator,
  removeCampaignCharacterCreator
} from "../services/campaignService";
import { ServiceError } from "../services/serviceError";

const handleCampaignServiceError = (res: express.Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof ServiceError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(fallbackMessage, error);
  res.status(500).json({ error: fallbackMessage });
};

export const registerCampaignsRoutes = (app: express.Express) => {
  app.get("/api/campaigns", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;

    try {
      const campaigns = await listCampaigns({ user, worldId, characterId, campaignId });
      res.json(campaigns);
    } catch (error) {
      handleCampaignServiceError(res, error, "Failed to list campaigns.");
    }
  });

  app.post("/api/campaigns", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const body = req.body as {
      worldId?: string;
      name?: string;
      description?: string;
      gmUserId?: string;
      characterIds?: string[];
    };

    try {
      const campaign = await createCampaign({
        user,
        worldId: body.worldId,
        name: body.name,
        description: body.description,
        gmUserId: body.gmUserId,
        characterIds: body.characterIds
      });
      res.status(201).json(campaign);
    } catch (error) {
      handleCampaignServiceError(res, error, "Failed to create campaign.");
    }
  });

  app.get("/api/campaigns/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const campaignId = req.params.id;

    try {
      const campaign = await getCampaign({ user, campaignId });
      res.json(campaign);
    } catch (error) {
      handleCampaignServiceError(res, error, "Failed to load campaign.");
    }
  });

  app.put("/api/campaigns/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const campaignId = req.params.id;
    const body = req.body as {
      name?: string;
      description?: string;
      gmUserId?: string;
      worldId?: string;
      characterIds?: string[];
    };

    try {
      const updated = await updateCampaign({
        user,
        campaignId,
        name: body.name,
        description: body.description,
        gmUserId: body.gmUserId,
        worldId: body.worldId,
        characterIds: body.characterIds
      });
      res.json(updated);
    } catch (error) {
      handleCampaignServiceError(res, error, "Failed to update campaign.");
    }
  });

  app.delete("/api/campaigns/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const campaignId = req.params.id;

    try {
      await deleteCampaign({ user, campaignId });
      res.json({ ok: true });
    } catch (error) {
      handleCampaignServiceError(res, error, "Failed to delete campaign.");
    }
  });

  app.post("/api/campaigns/:id/character-creators", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const campaignId = req.params.id;
    const memberId = (req.body as { userId?: string }).userId;

    if (!memberId) {
      res.status(400).json({ error: "userId is required." });
      return;
    }

    try {
      const creator = await addCampaignCharacterCreator({ user, campaignId, memberId });
      res.status(201).json(creator);
    } catch (error) {
      handleCampaignServiceError(res, error, "Failed to add campaign creator.");
    }
  });

  app.delete("/api/campaigns/:id/character-creators/:userId", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const campaignId = req.params.id;
    const memberId = req.params.userId;

    try {
      await removeCampaignCharacterCreator({ user, campaignId, memberId });
      res.json({ ok: true });
    } catch (error) {
      handleCampaignServiceError(res, error, "Failed to remove campaign creator.");
    }
  });

  app.post("/api/campaigns/:id/roster", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const campaignId = req.params.id;
    const { characterId, status } = req.body as { characterId?: string; status?: string };

    if (!characterId) {
      res.status(400).json({ error: "characterId is required." });
      return;
    }

    try {
      const rosterEntry = await addCharacterToCampaign({ user, campaignId, characterId, status });
      res.status(201).json(rosterEntry);
    } catch (error) {
      handleCampaignServiceError(res, error, "Failed to add roster entry.");
    }
  });

  app.put("/api/campaigns/:id/roster/:characterId", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const campaignId = req.params.id;
    const characterId = req.params.characterId;
    const { status } = req.body as { status?: string };

    try {
      const rosterEntry = await addCharacterToCampaign({ user, campaignId, characterId, status });
      res.json(rosterEntry);
    } catch (error) {
      handleCampaignServiceError(res, error, "Failed to update roster entry.");
    }
  });

  app.delete("/api/campaigns/:id/roster/:characterId", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const campaignId = req.params.id;
    const characterId = req.params.characterId;

    try {
      await removeCharacterFromCampaign({ user, campaignId, characterId });
      res.json({ ok: true });
    } catch (error) {
      handleCampaignServiceError(res, error, "Failed to remove roster entry.");
    }
  });
};

import express from "express";
import { requireAuth } from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";
import {
  listCharacters,
  createCharacter,
  getCharacter,
  updateCharacter,
  deleteCharacter
} from "../services/characterService";
import { ServiceError } from "../services/serviceError";

const handleCharacterServiceError = (res: express.Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof ServiceError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(fallbackMessage, error);
  res.status(500).json({ error: fallbackMessage });
};

export const registerCharactersRoutes = (app: express.Express) => {
  app.get("/api/characters", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;

    try {
      const characters = await listCharacters({ user, worldId, campaignId, characterId });
      res.json(characters);
    } catch (error) {
      handleCharacterServiceError(res, error, "Failed to list characters.");
    }
  });

  app.post("/api/characters", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const body = req.body as {
      worldId?: string;
      name?: string;
      description?: string;
      statusKey?: string;
      playerId?: string;
      campaignId?: string;
    };

    try {
      const character = await createCharacter({
        user,
        worldId: body.worldId,
        name: body.name,
        description: body.description,
        statusKey: body.statusKey,
        playerId: body.playerId,
        campaignId: body.campaignId
      });
      res.status(201).json(character);
    } catch (error) {
      handleCharacterServiceError(res, error, "Failed to create character.");
    }
  });

  app.get("/api/characters/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const characterId = req.params.id;

    try {
      const character = await getCharacter({ user, characterId });
      res.json(character);
    } catch (error) {
      handleCharacterServiceError(res, error, "Failed to load character.");
    }
  });

  app.put("/api/characters/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const characterId = req.params.id;
    const body = req.body as {
      name?: string;
      description?: string;
      statusKey?: string;
      worldId?: string;
      playerId?: string;
    };

    try {
      const updated = await updateCharacter({
        user,
        characterId,
        name: body.name,
        description: body.description,
        statusKey: body.statusKey,
        worldId: body.worldId,
        playerId: body.playerId
      });
      res.json(updated);
    } catch (error) {
      handleCharacterServiceError(res, error, "Failed to update character.");
    }
  });

  app.delete("/api/characters/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const characterId = req.params.id;

    try {
      await deleteCharacter({ user, characterId });
      res.json({ ok: true });
    } catch (error) {
      handleCharacterServiceError(res, error, "Failed to delete character.");
    }
  });
};

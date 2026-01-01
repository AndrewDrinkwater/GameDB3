import express from "express";
import { requireAuth } from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";
import {
  listSessions,
  getSession,
  createSession
} from "../services/sessionService";
import { ServiceError } from "../services/serviceError";

const handleSessionServiceError = (res: express.Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof ServiceError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(fallbackMessage, error);
  res.status(500).json({ error: fallbackMessage });
};

export const registerSessionsRoutes = (app: express.Express) => {
  app.get("/api/sessions", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;

    try {
      const sessions = await listSessions({ user, worldId, campaignId });
      res.json(sessions);
    } catch (error) {
      handleSessionServiceError(res, error, "Failed to list sessions.");
    }
  });

  app.get("/api/sessions/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const sessionId = req.params.id;

    try {
      const session = await getSession({ user, sessionId });
      res.json(session);
    } catch (error) {
      handleSessionServiceError(res, error, "Failed to load session.");
    }
  });

  app.post("/api/sessions", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user!;
    const body = req.body as {
      worldId?: string;
      campaignId?: string | null;
      title?: string;
      startedAt?: string | null;
      endedAt?: string | null;
    };

    try {
      const session = await createSession({
        user,
        worldId: body.worldId,
        campaignId: body.campaignId,
        title: body.title,
        startedAt: body.startedAt,
        endedAt: body.endedAt
      });
      res.json(session);
    } catch (error) {
      handleSessionServiceError(res, error, "Failed to create session.");
    }
  });
};

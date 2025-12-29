import express from "express";
import { prisma, requireAuth, canAccessCampaign, canAccessWorld } from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";

export const registerSessionsRoutes = (app: express.Express) => {
  app.get("/api/sessions", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : "";
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    if (!worldId || !campaignId) {
      res.status(400).json({ error: "worldId and campaignId are required." });
      return;
    }
    const canAccess = await canAccessCampaign(user.id, campaignId);
    if (!canAccess) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const sessions = await prisma.session.findMany({
      where: { worldId, ...(campaignId ? { campaignId } : {}) },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { notes: true } }
      }
    });
    res.json(
      sessions.map((session) => ({
        id: session.id,
        title: session.title,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        createdAt: session.createdAt,
        campaignId: session.campaignId,
        worldId: session.worldId,
        noteCount: session._count.notes
      }))
    );
  });

  app.get("/api/sessions/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const session = await prisma.session.findUnique({
      where: { id: req.params.id }
    });
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    if (!session.campaignId) {
      res.status(400).json({ error: "Session is missing a campaign context." });
      return;
    }
    const canAccess = await canAccessCampaign(user.id, session.campaignId);
    if (!canAccess) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    res.json(session);
  });

  app.post("/api/sessions", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const { worldId, campaignId, title, startedAt, endedAt } = req.body as {
      worldId?: string;
      campaignId?: string | null;
      title?: string;
      startedAt?: string | null;
      endedAt?: string | null;
    };
    if (!worldId || !campaignId || !title || title.trim() === "") {
      res.status(400).json({ error: "worldId, campaignId, and title are required." });
      return;
    }
    const canAccess = await canAccessCampaign(user.id, campaignId);
    if (!canAccess) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const session = await prisma.session.create({
      data: {
        worldId,
        campaignId,
        title: title.trim(),
        startedAt: startedAt ? new Date(startedAt) : null,
        endedAt: endedAt ? new Date(endedAt) : null
      }
    });
    res.json(session);
  });
};

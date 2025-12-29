import express from "express";
import {
  prisma,
  requireAuth,
  canAccessCampaign,
  extractSessionNoteReferences,
  getAccessibleEntity,
  getAccessibleLocation,
  normalizeSessionNoteContent,
  isCampaignGm,
  isWorldArchitect,
  isWorldGameMaster
} from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";
import {
  NoteTagType,
  SessionNoteVisibility,
  SessionTimelineEntryType,
  User
} from "@prisma/client";

type SessionAccess = {
  id: string;
  worldId: string;
  campaignId: string | null;
};

const getSessionForUser = async (userId: string, sessionId: string) => {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, worldId: true, campaignId: true }
  });
  if (!session) return null;
  if (!session.campaignId) return null;
  const allowed = await canAccessCampaign(userId, session.campaignId);
  return allowed ? session : null;
};

const mapSessionNote = (note: {
  id: string;
  content: unknown;
  createdAt: Date;
  updatedAt: Date;
  visibility: SessionNoteVisibility;
  author: { id: string; name: string | null; email: string };
  session?: { id: string; worldId: string; campaignId: string | null; title?: string | null };
  references: Array<{
    id: string;
    targetType: NoteTagType;
    targetId: string;
    label: string;
  }>;
}) => ({
  id: note.id,
  content: note.content,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
  visibility: note.visibility,
  author: note.author,
  session: note.session
    ? {
        id: note.session.id,
        worldId: note.session.worldId,
        campaignId: note.session.campaignId,
        title: note.session.title ?? null
      }
    : undefined,
  references: note.references.map((ref) => ({
    id: ref.id,
    targetType: ref.targetType === NoteTagType.LOCATION ? "location" : "entity",
    targetId: ref.targetId,
    label: ref.label
  }))
});

const validateSessionNoteReferences = async (
  user: User,
  session: SessionAccess,
  references: Array<{ targetType: "entity" | "location"; targetId: string }>
) => {
  for (const reference of references) {
    if (reference.targetType === "entity") {
      const entity = await getAccessibleEntity(
        user,
        reference.targetId,
        session.campaignId ?? undefined,
        undefined
      );
      if (!entity) {
        return {
          ok: false,
          message: "One or more referenced entities are not accessible."
        };
      }
    } else {
      const location = await getAccessibleLocation(
        user,
        reference.targetId,
        session.campaignId ?? undefined,
        undefined
      );
      if (!location) {
        return {
          ok: false,
          message: "One or more referenced locations are not accessible."
        };
      }
    }
  }
  return { ok: true };
};

const resolveSessionNoteVisibility = (value?: string) =>
  value === "PRIVATE" ? SessionNoteVisibility.PRIVATE : SessionNoteVisibility.SHARED;

const canAccessPrivateSessionNotes = async (user: User, session: SessionAccess) => {
  if (session.campaignId && (await isCampaignGm(user.id, session.campaignId))) return true;
  if (await isWorldArchitect(user.id, session.worldId)) return true;
  if (await isWorldGameMaster(user.id, session.worldId)) return true;
  return false;
};

export const registerSessionNotesRoutes = (app: express.Express) => {
  app.get("/api/sessions/:id/draft", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const session = await getSessionForUser(user.id, req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    const draft = await prisma.sessionNoteDraft.findUnique({
      where: { sessionId_authorId: { sessionId: session.id, authorId: user.id } }
    });
    res.json({
      content: draft?.content ?? null,
      visibility: draft?.visibility ?? SessionNoteVisibility.SHARED,
      lastSavedAt: draft?.lastSavedAt ?? null
    });
  });

  app.put("/api/sessions/:id/draft", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const session = await getSessionForUser(user.id, req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    const normalized = normalizeSessionNoteContent(req.body?.content);
    if (!normalized) {
      res.status(400).json({ error: "Invalid draft content." });
      return;
    }
    const visibility = resolveSessionNoteVisibility(req.body?.visibility);
    const now = new Date();
    const draft = await prisma.sessionNoteDraft.upsert({
      where: { sessionId_authorId: { sessionId: session.id, authorId: user.id } },
      create: {
        sessionId: session.id,
        authorId: user.id,
        visibility,
        content: normalized,
        lastSavedAt: now
      },
      update: {
        visibility,
        content: normalized,
        lastSavedAt: now
      }
    });
    res.json({
      content: draft.content,
      visibility: draft.visibility,
      lastSavedAt: draft.lastSavedAt
    });
  });

  app.delete("/api/sessions/:id/draft", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const session = await getSessionForUser(user.id, req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    await prisma.sessionNoteDraft.deleteMany({
      where: { sessionId: session.id, authorId: user.id }
    });
    res.json({ ok: true });
  });

  app.get("/api/sessions/:id/notes", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const session = await getSessionForUser(user.id, req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    const canSeePrivate = await canAccessPrivateSessionNotes(user, session);
    const notes = await prisma.sessionNote.findMany({
      where: {
        sessionId: session.id,
        ...(canSeePrivate
          ? {}
          : {
              OR: [
                { visibility: SessionNoteVisibility.SHARED },
                { visibility: SessionNoteVisibility.PRIVATE, authorId: user.id }
              ]
            })
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        references: true
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(notes.map(mapSessionNote));
  });

  app.post("/api/sessions/:id/notes", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const session = await getSessionForUser(user.id, req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    const normalized = normalizeSessionNoteContent(req.body?.content);
    if (!normalized || normalized.text.trim() === "") {
      res.status(400).json({ error: "Session note content is required." });
      return;
    }
    const visibility = resolveSessionNoteVisibility(req.body?.visibility);
    const references = extractSessionNoteReferences(normalized.text);
    const uniqueReferences = new Map(
      references.map((ref) => [`${ref.targetType}:${ref.targetId}`, ref] as const)
    );
    const referenceList = Array.from(uniqueReferences.values());
    const validation = await validateSessionNoteReferences(user, session, referenceList);
    if (!validation.ok) {
      res.status(400).json({ error: validation.message });
      return;
    }

    const created = await prisma.$transaction(async (tx) => {
      const note = await tx.sessionNote.create({
        data: {
          sessionId: session.id,
          authorId: user.id,
          visibility,
          content: normalized
        }
      });
      if (referenceList.length > 0) {
        await tx.sessionNoteReference.createMany({
          data: referenceList.map((ref) => ({
            sessionNoteId: note.id,
            targetType: ref.targetType === "location" ? NoteTagType.LOCATION : NoteTagType.ENTITY,
            targetId: ref.targetId,
            label: ref.label
          }))
        });
      }
      await tx.sessionNoteDraft.deleteMany({
        where: { sessionId: session.id, authorId: user.id }
      });
      await tx.sessionTimelineEntry.create({
        data: {
          sessionId: session.id,
          type: SessionTimelineEntryType.NOTE_PUBLISHED,
          noteId: note.id
        }
      });
      return note;
    });

    const noteWithRefs = await prisma.sessionNote.findUnique({
      where: { id: created.id },
      include: {
        author: { select: { id: true, name: true, email: true } },
        references: true,
        session: { select: { id: true, worldId: true, campaignId: true, title: true } }
      }
    });
    res.json(noteWithRefs ? mapSessionNote(noteWithRefs) : null);
  });

  app.put("/api/session-notes/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const note = await prisma.sessionNote.findUnique({
      where: { id: req.params.id },
      include: { session: { select: { id: true, worldId: true, campaignId: true } } }
    });
    if (!note) {
      res.status(404).json({ error: "Session note not found." });
      return;
    }
    if (note.authorId !== user.id) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const session = await getSessionForUser(user.id, note.sessionId);
    if (!session) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    const normalized = normalizeSessionNoteContent(req.body?.content);
    if (!normalized || normalized.text.trim() === "") {
      res.status(400).json({ error: "Session note content is required." });
      return;
    }
    const visibility = resolveSessionNoteVisibility(req.body?.visibility);
    const references = extractSessionNoteReferences(normalized.text);
    const uniqueReferences = new Map(
      references.map((ref) => [`${ref.targetType}:${ref.targetId}`, ref] as const)
    );
    const referenceList = Array.from(uniqueReferences.values());
    const validation = await validateSessionNoteReferences(user, session, referenceList);
    if (!validation.ok) {
      res.status(400).json({ error: validation.message });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.sessionNote.update({
        where: { id: note.id },
        data: { content: normalized, visibility }
      });
      await tx.sessionNoteReference.deleteMany({ where: { sessionNoteId: note.id } });
      if (referenceList.length > 0) {
        await tx.sessionNoteReference.createMany({
          data: referenceList.map((ref) => ({
            sessionNoteId: note.id,
            targetType: ref.targetType === "location" ? NoteTagType.LOCATION : NoteTagType.ENTITY,
            targetId: ref.targetId,
            label: ref.label
          }))
        });
      }
      return next;
    });

    const refreshed = await prisma.sessionNote.findUnique({
      where: { id: updated.id },
      include: {
        author: { select: { id: true, name: true, email: true } },
        references: true,
        session: { select: { id: true, worldId: true, campaignId: true, title: true } }
      }
    });
    res.json(refreshed ? mapSessionNote(refreshed) : null);
  });

  app.get("/api/entities/:id/session-notes", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const references = await prisma.sessionNoteReference.findMany({
      where: { targetType: NoteTagType.ENTITY, targetId: req.params.id },
      include: {
        sessionNote: {
          include: {
            session: { select: { id: true, worldId: true, campaignId: true, title: true } },
            author: { select: { id: true, name: true, email: true } },
            references: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    const visible = [];
    for (const ref of references) {
      const session = ref.sessionNote.session;
      if (!session.campaignId) continue;
      const canAccess = await canAccessCampaign(user.id, session.campaignId);
      if (!canAccess) continue;
      if (
        ref.sessionNote.visibility === SessionNoteVisibility.PRIVATE &&
        ref.sessionNote.authorId !== user.id
      ) {
        const canSeePrivate = await canAccessPrivateSessionNotes(user, {
          id: session.id,
          worldId: session.worldId,
          campaignId: session.campaignId
        });
        if (!canSeePrivate) continue;
      }
      visible.push(mapSessionNote(ref.sessionNote));
    }
    res.json(visible);
  });

  app.get("/api/locations/:id/session-notes", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const references = await prisma.sessionNoteReference.findMany({
      where: { targetType: NoteTagType.LOCATION, targetId: req.params.id },
      include: {
        sessionNote: {
          include: {
            session: { select: { id: true, worldId: true, campaignId: true, title: true } },
            author: { select: { id: true, name: true, email: true } },
            references: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    const visible = [];
    for (const ref of references) {
      const session = ref.sessionNote.session;
      if (!session.campaignId) continue;
      const canAccess = await canAccessCampaign(user.id, session.campaignId);
      if (!canAccess) continue;
      if (
        ref.sessionNote.visibility === SessionNoteVisibility.PRIVATE &&
        ref.sessionNote.authorId !== user.id
      ) {
        const canSeePrivate = await canAccessPrivateSessionNotes(user, {
          id: session.id,
          worldId: session.worldId,
          campaignId: session.campaignId
        });
        if (!canSeePrivate) continue;
      }
      visible.push(mapSessionNote(ref.sessionNote));
    }
    res.json(visible);
  });
};

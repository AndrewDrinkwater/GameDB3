import express from "express";
import { NoteTagType, NoteVisibility } from "@prisma/client";
import { prisma, requireAuth, buildLocationAccessFilter, isCampaignGm, buildEntityAccessFilter, extractNoteTags } from "../lib/helpers";
import type { AuthRequest } from "../lib/helpers";

export const registerNotesRoutes = (app: express.Express) => {
    app.put("/api/notes/:id", requireAuth, async (req, res) => {
      const user = (req as AuthRequest).user;
      if (!user) {
        res.status(401).json({ error: "Unauthorized." });
        return;
      }
  
      const { id } = req.params;
      const { body, visibility, shareWithArchitect, shareCharacterIds } = req.body as {
        body?: string;
        visibility?: string;
        shareWithArchitect?: boolean;
        shareCharacterIds?: string[];
      };
  
      if (!body || body.trim() === "") {
        res.status(400).json({ error: "Note body is required." });
        return;
      }
  
      const note = await prisma.note.findUnique({
        where: { id },
        include: {
          author: { select: { id: true, name: true, email: true } },
          character: { select: { id: true, name: true } }
        }
      });
      if (!note) {
        res.status(404).json({ error: "Note not found." });
        return;
      }
  
      if (note.authorId !== user.id) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
  
      const entity = note.entityId
        ? await prisma.entity.findUnique({
            where: { id: note.entityId },
            select: { id: true, worldId: true }
          })
        : null;
      const location = note.locationId
        ? await prisma.location.findUnique({
            where: { id: note.locationId },
            select: { id: true, worldId: true }
          })
        : null;
      if (!entity && !location) {
        res.status(404).json({ error: "Note target not found." });
        return;
      }
  
      const worldId = entity?.worldId ?? location?.worldId;
      if (!worldId) {
        res.status(404).json({ error: "Note target not found." });
        return;
      }
  
      if (entity) {
        const accessFilter = await buildEntityAccessFilter(
          user,
          worldId,
          note.campaignId ?? undefined,
          note.characterId ?? undefined
        );
        const canRead = await prisma.entity.findFirst({
          where: { id: entity.id, ...accessFilter },
          select: { id: true }
        });
        if (!canRead) {
          res.status(403).json({ error: "Forbidden." });
          return;
        }
      } else if (location) {
        const accessFilter = await buildLocationAccessFilter(
          user,
          worldId,
          note.campaignId ?? undefined,
          note.characterId ?? undefined
        );
        const canRead = await prisma.location.findFirst({
          where: { id: location.id, ...accessFilter },
          select: { id: true }
        });
        if (!canRead) {
          res.status(403).json({ error: "Forbidden." });
          return;
        }
      }
  
      const resolvedVisibility =
        visibility === "PRIVATE" || visibility === "SHARED" || visibility === "GM"
          ? (visibility as NoteVisibility)
          : note.visibility;
  
      if (resolvedVisibility === NoteVisibility.SHARED && !note.campaignId) {
        res.status(400).json({ error: "Shared notes require a campaign context." });
        return;
      }
      if (resolvedVisibility === NoteVisibility.GM && !note.campaignId) {
        res.status(400).json({ error: "GM notes require a campaign context." });
        return;
      }
  
      if (resolvedVisibility === NoteVisibility.GM) {
        const isCampaignGmFlag = note.campaignId
          ? await isCampaignGm(user.id, note.campaignId)
          : false;
        if (!isCampaignGmFlag) {
          res.status(403).json({ error: "Only the campaign GM can edit GM notes." });
          return;
        }
      }
  
      const shareCharacterIdList = Array.isArray(shareCharacterIds)
        ? shareCharacterIds.filter(Boolean)
        : [];
      if (resolvedVisibility !== NoteVisibility.GM) {
        if (shareCharacterIdList.length > 0) {
          res.status(400).json({ error: "GM note sharing is not available for this note." });
          return;
        }
      }
  
      if (resolvedVisibility === NoteVisibility.GM && shareCharacterIdList.length > 0) {
        const campaignCharacters = await prisma.characterCampaign.findMany({
          where: { campaignId: note.campaignId as string, characterId: { in: shareCharacterIdList } },
          select: { characterId: true }
        });
        const allowed = new Set(campaignCharacters.map((entry) => entry.characterId));
        const missing = shareCharacterIdList.filter((id) => !allowed.has(id));
        if (missing.length > 0) {
          res.status(400).json({ error: "One or more shared characters are not in the campaign." });
          return;
        }
      }
  
      const tags = extractNoteTags(body);
      const entityTagIds = tags
        .filter((tag) => tag.tagType === NoteTagType.ENTITY)
        .map((tag) => tag.targetId);
      const locationTagIds = tags
        .filter((tag) => tag.tagType === NoteTagType.LOCATION)
        .map((tag) => tag.targetId);
  
      if (entityTagIds.length > 0) {
        const entityAccessFilter = await buildEntityAccessFilter(
          user,
          worldId,
          note.campaignId ?? undefined,
          note.characterId ?? undefined
        );
        const accessibleEntities = await prisma.entity.findMany({
          where: { id: { in: entityTagIds }, ...entityAccessFilter },
          select: { id: true }
        });
        const accessibleIds = new Set(accessibleEntities.map((entry) => entry.id));
        const missing = entityTagIds.filter((targetId) => !accessibleIds.has(targetId));
        if (missing.length > 0) {
          res.status(400).json({ error: "One or more tagged entities are not accessible." });
          return;
        }
      }
  
      if (locationTagIds.length > 0) {
        const locationAccessFilter = await buildLocationAccessFilter(
          user,
          worldId,
          note.campaignId ?? undefined,
          note.characterId ?? undefined
        );
        const accessibleLocations = await prisma.location.findMany({
          where: { id: { in: locationTagIds }, ...locationAccessFilter },
          select: { id: true }
        });
        const accessibleIds = new Set(accessibleLocations.map((entry) => entry.id));
        const missing = locationTagIds.filter((targetId) => !accessibleIds.has(targetId));
        if (missing.length > 0) {
          res.status(400).json({ error: "One or more tagged locations are not accessible." });
          return;
        }
      }
  
      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.note.update({
          where: { id },
          data: {
            body,
            visibility: resolvedVisibility,
            shareWithArchitect:
              resolvedVisibility === NoteVisibility.GM ? Boolean(shareWithArchitect) : false
          }
        });
        await tx.noteTag.deleteMany({ where: { noteId: id } });
        if (tags.length > 0) {
          await tx.noteTag.createMany({
            data: tags.map((tag) => ({
              noteId: id,
              tagType: tag.tagType,
              targetId: tag.targetId,
              label: tag.label
            }))
          });
        }
        await tx.noteShare.deleteMany({ where: { noteId: id } });
        if (resolvedVisibility === NoteVisibility.GM && shareCharacterIdList.length > 0) {
          await tx.noteShare.createMany({
            data: shareCharacterIdList.map((characterId) => ({
              noteId: id,
              characterId
            })),
            skipDuplicates: true
          });
        }
        return next;
      });
  
      const noteTags = await prisma.noteTag.findMany({ where: { noteId: id } });
      const noteShares = await prisma.noteShare.findMany({
        where: { noteId: id },
        select: { characterId: true }
      });
  
      const world = await prisma.world.findUnique({
        where: { id: worldId },
        select: {
          primaryArchitectId: true,
          architects: { select: { userId: true } },
          gameMasters: { select: { userId: true } }
        }
      });
      const architectIds = new Set<string>(
        world
          ? [world.primaryArchitectId, ...world.architects.map((entry) => entry.userId)]
          : []
      );
      const worldGmIds = new Set<string>(
        world ? world.gameMasters.map((entry) => entry.userId) : []
      );
      const campaignGmId = note.campaignId
        ? (
            await prisma.campaign.findUnique({
              where: { id: note.campaignId },
              select: { gmUserId: true }
            })
          )?.gmUserId
        : null;
  
      const authorBase = note.author.name ?? note.author.email;
      const authorLabel = note.character?.name
        ? `${note.character.name} played by ${authorBase}`
        : authorBase;
      const isArchitectAuthor = architectIds.has(note.authorId);
      const isGmAuthor = campaignGmId ? campaignGmId === note.authorId : false;
      const authorRoleLabel =
        updated.visibility === NoteVisibility.GM
          ? "GM"
          : updated.visibility === NoteVisibility.SHARED
            ? isArchitectAuthor
              ? "Architect"
              : isGmAuthor
                ? "GM"
                : null
            : null;
  
      res.json({
        id: updated.id,
        body: updated.body,
        visibility: updated.visibility,
        shareWithArchitect: updated.shareWithArchitect,
        shareCharacterIds: noteShares.map((share) => share.characterId),
        createdAt: updated.createdAt,
        author: note.author,
        authorLabel,
        authorRoleLabel,
        tags: noteTags.map((tag) => ({
          id: tag.id,
          tagType: tag.tagType,
          targetId: tag.targetId,
          label: tag.label,
          canAccess: true
        }))
      });
    });

    app.delete("/api/notes/:id", requireAuth, async (req, res) => {
      const user = (req as AuthRequest).user;
      if (!user) {
        res.status(401).json({ error: "Unauthorized." });
        return;
      }
  
      const { id } = req.params;
      const note = await prisma.note.findUnique({
        where: { id },
        select: { id: true, authorId: true }
      });
      if (!note) {
        res.status(404).json({ error: "Note not found." });
        return;
      }
  
      if (note.authorId !== user.id) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
  
      await prisma.$transaction([
        prisma.noteTag.deleteMany({ where: { noteId: id } }),
        prisma.note.delete({ where: { id } })
      ]);
      res.json({ ok: true });
    });

};

import { Prisma, User } from "@prisma/client";
import prisma from "../lib/prismaClient";
import { canAccessCampaign } from "../lib/helpers";
import { ServiceError } from "./serviceError";

type SessionListQuery = {
  worldId?: string;
  campaignId?: string;
};

type SessionCreatePayload = {
  worldId?: string;
  campaignId?: string | null;
  title?: string;
  startedAt?: string | null;
  endedAt?: string | null;
};

type SessionUpdatePayload = {
  title?: string;
  startedAt?: string | null;
  endedAt?: string | null;
};

type Context = { user: User };

const serializeSession = (session: Prisma.SessionGetPayload<{ include: { _count: { select: { notes: true } } } }>) => ({
  id: session.id,
  title: session.title,
  startedAt: session.startedAt,
  endedAt: session.endedAt,
  createdAt: session.createdAt,
  campaignId: session.campaignId,
  worldId: session.worldId,
  noteCount: session._count.notes
});

const requireCampaignAccess = async (userId: string, campaignId: string) => {
  const canAccess = await canAccessCampaign(userId, campaignId);
  if (!canAccess) {
    throw new ServiceError(403, "Forbidden.");
  }
};

export const listSessions = async ({
  user,
  worldId,
  campaignId
}: Context & SessionListQuery) => {
  if (!worldId || !campaignId) {
    throw new ServiceError(400, "worldId and campaignId are required.");
  }
  await requireCampaignAccess(user.id, campaignId);

  const sessions = await prisma.session.findMany({
    where: { worldId, campaignId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { notes: true } }
    }
  });

  return sessions.map(serializeSession);
};

const ensureSession = async (sessionId: string) => {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      _count: { select: { notes: true } }
    }
  });
  if (!session) {
    throw new ServiceError(404, "Session not found.");
  }
  if (!session.campaignId) {
    throw new ServiceError(400, "Session is missing a campaign context.");
  }
  return session;
};

export const getSession = async ({ user, sessionId }: Context & { sessionId: string }) => {
  const session = await ensureSession(sessionId);
  await requireCampaignAccess(user.id, session.campaignId!);
  return session;
};

export const createSession = async ({
  user,
  worldId,
  campaignId,
  title,
  startedAt,
  endedAt
}: Context & SessionCreatePayload) => {
  if (!worldId || !campaignId || !title || title.trim() === "") {
    throw new ServiceError(400, "worldId, campaignId, and title are required.");
  }
  await requireCampaignAccess(user.id, campaignId);

  const session = await prisma.session.create({
    data: {
      worldId,
      campaignId,
      title: title.trim(),
      startedAt: startedAt ? new Date(startedAt) : null,
      endedAt: endedAt ? new Date(endedAt) : null
    },
    include: {
      _count: { select: { notes: true } }
    }
  });

  return serializeSession(session);
};

export const updateSession = async ({
  user,
  sessionId,
  title,
  startedAt,
  endedAt
}: Context & { sessionId: string } & SessionUpdatePayload) => {
  const session = await ensureSession(sessionId);
  await requireCampaignAccess(user.id, session.campaignId!);
  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: {
      title: title ? title.trim() : undefined,
      startedAt: startedAt === undefined ? undefined : startedAt ? new Date(startedAt) : null,
      endedAt: endedAt === undefined ? undefined : endedAt ? new Date(endedAt) : null
    },
    include: {
      _count: { select: { notes: true } }
    }
  });
  return serializeSession(updated);
};

export const deleteSession = async ({ user, sessionId }: Context & { sessionId: string }) => {
  const session = await ensureSession(sessionId);
  await requireCampaignAccess(user.id, session.campaignId!);
  await prisma.session.delete({ where: { id: sessionId } });
  return true;
};

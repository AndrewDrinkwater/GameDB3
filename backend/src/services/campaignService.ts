import { Prisma, User } from "@prisma/client";
import prisma from "../lib/prismaClient";
import {
  canCreateCampaign,
  canManageCampaign,
  isAdmin,
  isWorldArchitect,
  isWorldGameMaster
} from "../lib/helpers";
import { ServiceError } from "./serviceError";

type CampaignListQuery = {
  worldId?: string;
  characterId?: string;
  campaignId?: string;
};

type CampaignCreatePayload = {
  worldId?: string;
  name?: string;
  description?: string;
  gmUserId?: string;
  characterIds?: string[];
};

type CampaignUpdatePayload = {
  name?: string;
  description?: string;
  gmUserId?: string;
  worldId?: string;
  characterIds?: string[];
};

type Context = { user: User };

const buildAccessClause = (user: User): Prisma.CampaignWhereInput =>
  isAdmin(user)
    ? {}
    : {
        OR: [
          { gmUserId: user.id },
          { createdById: user.id },
          { world: { primaryArchitectId: user.id } },
          { world: { architects: { some: { userId: user.id } } } },
          { roster: { some: { character: { playerId: user.id } } } }
        ]
      };

const ensureCampaignExists = async (campaignId: string) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, worldId: true, gmUserId: true }
  });
  if (!campaign) {
    throw new ServiceError(404, "Campaign not found.");
  }
  return campaign;
};

const ensureCanManage = async (user: User, campaignId: string) => {
  if (isAdmin(user)) return;
  const allowed = await canManageCampaign(user.id, campaignId);
  if (!allowed) {
    throw new ServiceError(403, "Forbidden.");
  }
};

const normalizeCharacterStatus = (status?: string) =>
  status === "INACTIVE" ? "INACTIVE" : "ACTIVE";

export const listCampaigns = async ({ user, worldId, campaignId, characterId }: Context & CampaignListQuery) => {
  const accessClause = buildAccessClause(user);
  const filters: Prisma.CampaignWhereInput[] = [accessClause];
  if (worldId) filters.push({ worldId });
  if (campaignId) filters.push({ id: campaignId });
  if (characterId) filters.push({ roster: { some: { characterId } } });
  const where = filters.length > 1 ? { AND: filters } : accessClause;
  return prisma.campaign.findMany({
    where,
    orderBy: { name: "asc" }
  });
};

export const createCampaign = async ({
  user,
  worldId,
  name,
  description,
  gmUserId,
  characterIds
}: Context & CampaignCreatePayload) => {
  if (!worldId || !name) {
    throw new ServiceError(400, "worldId and name are required.");
  }

  if (!isAdmin(user)) {
    const allowed = await canCreateCampaign(user.id, worldId);
    if (!allowed) {
      throw new ServiceError(403, "Forbidden.");
    }
  }

  const isArchitect = await isWorldArchitect(user.id, worldId);
  const finalGmId = gmUserId ?? user.id;

  if (!isAdmin(user) && !isArchitect) {
    const gmEntry = await prisma.worldGameMaster.findFirst({
      where: { worldId, userId: finalGmId }
    });
    if (!gmEntry) {
      throw new ServiceError(403, "GM must be assigned to this world.");
    }
  } else {
    await prisma.worldGameMaster.upsert({
      where: { worldId_userId: { worldId, userId: finalGmId } },
      update: {},
      create: { worldId, userId: finalGmId }
    });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name,
      description,
      worldId,
      ownerId: user.id,
      createdById: user.id,
      gmUserId: finalGmId
    }
  });

  if (Array.isArray(characterIds) && characterIds.length > 0) {
    const characters = await prisma.character.findMany({
      where: { id: { in: characterIds } },
      select: { id: true, worldId: true }
    });
    const validIds = characters
      .filter((character) => character.worldId === worldId)
      .map((character) => character.id);
    if (validIds.length > 0) {
      await prisma.characterCampaign.createMany({
        data: validIds.map((characterId) => ({
          campaignId: campaign.id,
          characterId,
          status: "ACTIVE"
        })),
        skipDuplicates: true
      });
    }
  }

  return campaign;
};

export const getCampaign = async ({ user, campaignId }: Context & { campaignId: string }) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      world: { include: { architects: true } },
      roster: { include: { character: { select: { playerId: true } } } }
    }
  });
  if (!campaign) {
    throw new ServiceError(404, "Campaign not found.");
  }

  const canAccess =
    isAdmin(user) ||
    campaign.gmUserId === user.id ||
    campaign.createdById === user.id ||
    campaign.world.primaryArchitectId === user.id ||
    campaign.world.architects.some((architect) => architect.userId === user.id) ||
    campaign.roster.some((entry) => entry.character.playerId === user.id);

  if (!canAccess) {
    throw new ServiceError(403, "Forbidden.");
  }

  return {
    ...campaign,
    characterIds: campaign.roster.map((entry) => entry.characterId)
  };
};

const upsertCampaignGm = async (worldId: string, gmUserId: string) => {
  await prisma.worldGameMaster.upsert({
    where: { worldId_userId: { worldId, userId: gmUserId } },
    update: {},
    create: { worldId, userId: gmUserId }
  });
};

export const updateCampaign = async ({
  user,
  campaignId,
  name,
  description,
  gmUserId,
  worldId,
  characterIds
}: Context & { campaignId: string } & CampaignUpdatePayload) => {
  const campaign = await ensureCampaignExists(campaignId);
  await ensureCanManage(user, campaignId);

  if (worldId && worldId !== campaign.worldId) {
    throw new ServiceError(400, "Campaign world cannot be changed.");
  }

  if (gmUserId && gmUserId !== campaign.gmUserId) {
    const isArchitect = await isWorldArchitect(user.id, campaign.worldId);
    const isWorldGm = await isWorldGameMaster(user.id, campaign.worldId);
    const allowGmChange =
      isAdmin(user) || isArchitect || isWorldGm || campaign.gmUserId === user.id;
    if (!allowGmChange) {
      throw new ServiceError(403, "Only admins, architects, GMs, or the current GM can change GM.");
    }

    if (!isAdmin(user) && !isArchitect) {
      const gmEntry = await prisma.worldGameMaster.findFirst({
        where: { worldId: campaign.worldId, userId: gmUserId }
      });
      if (!gmEntry) {
        throw new ServiceError(403, "GM must be assigned to this world.");
      }
    } else {
      await upsertCampaignGm(campaign.worldId, gmUserId);
    }
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { name, description, gmUserId }
  });

  if (Array.isArray(characterIds)) {
    const characters = await prisma.character.findMany({
      where: { id: { in: characterIds } },
      select: { id: true, worldId: true }
    });
    const validIds = characters
      .filter((character) => character.worldId === campaign.worldId)
      .map((c) => c.id);

    await prisma.characterCampaign.deleteMany({
      where: {
        campaignId,
        characterId: { notIn: validIds }
      }
    });

    if (validIds.length > 0) {
      await prisma.characterCampaign.createMany({
        data: validIds.map((characterId) => ({
          campaignId,
          characterId,
          status: "ACTIVE"
        })),
        skipDuplicates: true
      });
    }
  }

  return updated;
};

export const deleteCampaign = async ({ user, campaignId }: Context & { campaignId: string }) => {
  await ensureCampaignExists(campaignId);
  await ensureCanManage(user, campaignId);
  await prisma.campaign.delete({ where: { id: campaignId } });
  return true;
};

export const addCharacterToCampaign = async ({
  user,
  campaignId,
  characterId,
  status
}: Context & { campaignId: string; characterId: string; status?: string }) => {
  await ensureCampaignExists(campaignId);
  await ensureCanManage(user, campaignId);

  const [campaign, character] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId }, select: { worldId: true } }),
    prisma.character.findUnique({ where: { id: characterId }, select: { worldId: true } })
  ]);

  if (!campaign || !character || campaign.worldId !== character.worldId) {
    throw new ServiceError(400, "World mismatch.");
  }

  return prisma.characterCampaign.upsert({
    where: { characterId_campaignId: { characterId, campaignId } },
    update: { status: normalizeCharacterStatus(status) },
    create: {
      characterId,
      campaignId,
      status: normalizeCharacterStatus(status)
    }
  });
};

export const removeCharacterFromCampaign = async ({
  user,
  campaignId,
  characterId
}: Context & { campaignId: string; characterId: string }) => {
  await ensureCampaignExists(campaignId);
  await ensureCanManage(user, campaignId);
  await prisma.characterCampaign.delete({
    where: { characterId_campaignId: { characterId, campaignId } }
  });
  return true;
};

export const addCampaignCharacterCreator = async ({
  user,
  campaignId,
  memberId
}: Context & { campaignId: string; memberId: string }) => {
  await ensureCampaignExists(campaignId);
  await ensureCanManage(user, campaignId);
  return prisma.campaignCharacterCreator.upsert({
    where: { campaignId_userId: { campaignId, userId: memberId } },
    update: {},
    create: { campaignId, userId: memberId }
  });
};

export const removeCampaignCharacterCreator = async ({
  user,
  campaignId,
  memberId
}: Context & { campaignId: string; memberId: string }) => {
  await ensureCampaignExists(campaignId);
  await ensureCanManage(user, campaignId);
  await prisma.campaignCharacterCreator.delete({
    where: { campaignId_userId: { campaignId, userId: memberId } }
  });
  return true;
};

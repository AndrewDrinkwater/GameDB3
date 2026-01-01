import { Prisma, User, WorldEntityPermissionScope } from "@prisma/client";
import prisma from "../lib/prismaClient";
import { isAdmin, isWorldArchitect } from "../lib/helpers";
import { ServiceError } from "./serviceError";

type WorldListQuery = {
  worldId?: string;
};

type WorldCreatePayload = {
  name: string;
  description?: string | null;
  dmLabelKey?: string | null;
  themeKey?: string | null;
  primaryArchitectId?: string;
  characterCreatorIds?: string[];
  entityPermissionScope?: WorldEntityPermissionScope | null;
};

type WorldUpdatePayload = {
  name?: string;
  description?: string | null;
  dmLabelKey?: string | null;
  themeKey?: string | null;
  primaryArchitectId?: string;
  characterCreatorIds?: string[];
  entityPermissionScope?: WorldEntityPermissionScope | null;
};

type WorldMemberRole = "architect" | "campaign_creator" | "character_creator";

type Context = {
  user: User;
};

const buildWorldAccessClause = (user: User): Prisma.WorldWhereInput =>
  isAdmin(user)
    ? {}
    : {
        OR: [
          { primaryArchitectId: user.id },
          { architects: { some: { userId: user.id } } },
          { gameMasters: { some: { userId: user.id } } },
          { campaignCreators: { some: { userId: user.id } } },
          { characterCreators: { some: { userId: user.id } } }
        ]
      };

const buildWorldWhereClause = (user: User, worldId?: string) => {
  const accessClause = buildWorldAccessClause(user);
  if (!worldId) return accessClause;
  return { AND: [accessClause, { id: worldId }] };
};

const ensureWorldExists = async (worldId: string) => {
  const world = await prisma.world.findUnique({
    where: { id: worldId },
    select: { id: true, primaryArchitectId: true }
  });
  if (!world) {
    throw new ServiceError(404, "World not found.");
  }
  return world;
};

const ensureCanManageWorld = async (user: User, worldId: string) => {
  if (isAdmin(user)) return;
  const isArchitect = await isWorldArchitect(user.id, worldId);
  if (isArchitect) return;
  throw new ServiceError(403, "Forbidden.");
};

const ensureArchitectCanSetPrimary = (user: User, primaryArchitectId?: string) => {
  if (!primaryArchitectId) return;
  if (!isAdmin(user)) {
    throw new ServiceError(403, "Only admins can set the primary architect.");
  }
};

const ensureArchitectCanChangePrimary = (user: User, primaryArchitectId?: string) => {
  if (!primaryArchitectId) return;
  if (!isAdmin(user)) {
    throw new ServiceError(403, "Only admins can change the primary architect.");
  }
};

const buildCharacterCreatorInsert = (worldId: string, characterCreatorIds?: string[]) =>
  (characterCreatorIds ?? []).map((userId) => ({ worldId, userId }));

const upsertWorldArchitect = async (worldId: string, userId: string) => {
  await prisma.worldArchitect.upsert({
    where: { worldId_userId: { worldId, userId } },
    update: {},
    create: { worldId, userId }
  });
};

const memberTable = {
  architect: {
    upsert: async (worldId: string, userId: string) =>
      prisma.worldArchitect.upsert({
        where: { worldId_userId: { worldId, userId } },
        update: {},
        create: { worldId, userId }
      }),
    delete: (worldId: string, userId: string) =>
      prisma.worldArchitect.delete({
        where: { worldId_userId: { worldId, userId } }
      })
  },
  campaign_creator: {
    upsert: async (worldId: string, userId: string) =>
      prisma.worldCampaignCreator.upsert({
        where: { worldId_userId: { worldId, userId } },
        update: {},
        create: { worldId, userId }
      }),
    delete: (worldId: string, userId: string) =>
      prisma.worldCampaignCreator.delete({
        where: { worldId_userId: { worldId, userId } }
      })
  },
  character_creator: {
    upsert: async (worldId: string, userId: string) =>
      prisma.worldCharacterCreator.upsert({
        where: { worldId_userId: { worldId, userId } },
        update: {},
        create: { worldId, userId }
      }),
    delete: (worldId: string, userId: string) =>
      prisma.worldCharacterCreator.delete({
        where: { worldId_userId: { worldId, userId } }
      })
  }
};

const ensureNotRemovingPrimaryArchitect = async (worldId: string, userId: string) => {
  const world = await prisma.world.findUnique({
    where: { id: worldId },
    select: { primaryArchitectId: true }
  });
  if (world?.primaryArchitectId === userId) {
    throw new ServiceError(400, "Cannot remove the primary architect.");
  }
};

export const listWorlds = async ({ user, worldId }: Context & WorldListQuery) => {
  const where = buildWorldWhereClause(user, worldId);
  return prisma.world.findMany({
    where,
    orderBy: { name: "asc" }
  });
};

export const getWorldById = async ({ user, worldId }: Context & { worldId: string }) => {
  const userId = user.id;
  const isArchitect = await isWorldArchitect(userId, worldId);
  const canRead =
    isAdmin(user) ||
    isArchitect ||
    (await prisma.worldGameMaster.findFirst({
      where: { worldId, userId }
    })) ||
    (await prisma.worldCampaignCreator.findFirst({
      where: { worldId, userId }
    })) ||
    (await prisma.worldCharacterCreator.findFirst({
      where: { worldId, userId }
    }));

  if (!canRead) {
    throw new ServiceError(403, "Forbidden.");
  }

  const world = await prisma.world.findUnique({
    where: { id: worldId },
    include: { characterCreators: true }
  });
  if (!world) {
    throw new ServiceError(404, "World not found.");
  }

  return {
    ...world,
    characterCreatorIds: world.characterCreators.map((entry) => entry.userId)
  };
};

export const isWorldAdmin = async ({ user, worldId }: Context & { worldId: string }) => {
  if (isAdmin(user)) return true;
  return (await isWorldArchitect(user.id, worldId)) === true;
};

export const createWorld = async ({
  user,
  name,
  description,
  dmLabelKey,
  themeKey,
  primaryArchitectId,
  characterCreatorIds,
  entityPermissionScope
}: Context & WorldCreatePayload) => {
  if (!name) {
    throw new ServiceError(400, "name is required.");
  }
  ensureArchitectCanSetPrimary(user, primaryArchitectId);

  const architectId = primaryArchitectId ?? user.id;

  const scopeValue = entityPermissionScope ?? undefined;
  const world = await prisma.world.create({
    data: {
      name,
      description,
      dmLabelKey,
      themeKey,
      primaryArchitectId: architectId,
      ...(scopeValue !== undefined ? { entityPermissionScope: scopeValue } : {})
    }
  });

  await upsertWorldArchitect(world.id, architectId);

  if (characterCreatorIds && characterCreatorIds.length > 0) {
    await prisma.worldCharacterCreator.createMany({
      data: buildCharacterCreatorInsert(world.id, characterCreatorIds),
      skipDuplicates: true
    });
  }

  return world;
};

export const updateWorld = async ({
  user,
  worldId,
  name,
  description,
  dmLabelKey,
  themeKey,
  primaryArchitectId,
  characterCreatorIds,
  entityPermissionScope
}: Context & { worldId: string } & WorldUpdatePayload) => {
  await ensureWorldExists(worldId);
  await ensureCanManageWorld(user, worldId);
  ensureArchitectCanChangePrimary(user, primaryArchitectId);

  const scopeValue = entityPermissionScope ?? undefined;
  const world = await prisma.world.update({
    where: { id: worldId },
    data: {
      name,
      description,
      dmLabelKey,
      themeKey,
      primaryArchitectId,
      ...(scopeValue !== undefined ? { entityPermissionScope: scopeValue } : {})
    }
  });

  if (primaryArchitectId) {
    await upsertWorldArchitect(worldId, primaryArchitectId);
  }

  if (Array.isArray(characterCreatorIds)) {
    await prisma.worldCharacterCreator.deleteMany({ where: { worldId } });
    if (characterCreatorIds.length > 0) {
      await prisma.worldCharacterCreator.createMany({
        data: buildCharacterCreatorInsert(worldId, characterCreatorIds),
        skipDuplicates: true
      });
    }
  }

  return world;
};

export const deleteWorld = async ({ user, worldId }: Context & { worldId: string }) => {
  await ensureWorldExists(worldId);
  await ensureCanManageWorld(user, worldId);

  await prisma.$transaction(async (tx) => {
    const campaignIds = (
      await tx.campaign.findMany({ where: { worldId }, select: { id: true } })
    ).map((campaign) => campaign.id);
    const characterIds = (
      await tx.character.findMany({ where: { worldId }, select: { id: true } })
    ).map((character) => character.id);
    const entityIds = (
      await tx.entity.findMany({ where: { worldId }, select: { id: true } })
    ).map((entity) => entity.id);
    const entityTypeIds = (
      await tx.entityType.findMany({ where: { worldId }, select: { id: true } })
    ).map((entityType) => entityType.id);

    if (campaignIds.length > 0) {
      await tx.characterCampaign.deleteMany({ where: { campaignId: { in: campaignIds } } });
      await tx.campaignDelegate.deleteMany({ where: { campaignId: { in: campaignIds } } });
      await tx.campaignCharacterCreator.deleteMany({
        where: { campaignId: { in: campaignIds } }
      });
    }

    if (characterIds.length > 0) {
      await tx.characterCampaign.deleteMany({ where: { characterId: { in: characterIds } } });
    }

    if (entityIds.length > 0) {
      await tx.entityAccess.deleteMany({ where: { entityId: { in: entityIds } } });
      await tx.entityFieldValue.deleteMany({ where: { entityId: { in: entityIds } } });
      await tx.entity.deleteMany({ where: { id: { in: entityIds } } });
    }

    if (entityTypeIds.length > 0) {
      await tx.entityField.deleteMany({ where: { entityTypeId: { in: entityTypeIds } } });
      await tx.entityFormSection.deleteMany({ where: { entityTypeId: { in: entityTypeIds } } });
      await tx.entityType.deleteMany({ where: { id: { in: entityTypeIds } } });
    }

    if (characterIds.length > 0) {
      await tx.character.deleteMany({ where: { id: { in: characterIds } } });
    }

    if (campaignIds.length > 0) {
      await tx.campaign.deleteMany({ where: { id: { in: campaignIds } } });
    }

    await tx.choiceOption.deleteMany({ where: { choiceList: { worldId } } });
    await tx.choiceList.deleteMany({ where: { worldId } });

    await tx.worldDelegate.deleteMany({ where: { worldId } });
    await tx.worldArchitect.deleteMany({ where: { worldId } });
    await tx.worldGameMaster.deleteMany({ where: { worldId } });
    await tx.worldCampaignCreator.deleteMany({ where: { worldId } });
    await tx.worldCharacterCreator.deleteMany({ where: { worldId } });
    await tx.world.delete({ where: { id: worldId } });
  });

  return true;
};

export const addWorldMember = async ({
  user,
  worldId,
  role,
  memberId
}: Context & { worldId: string; role: WorldMemberRole; memberId: string }) => {
  await ensureWorldExists(worldId);
  await ensureCanManageWorld(user, worldId);
  return memberTable[role].upsert(worldId, memberId);
};

export const removeWorldMember = async ({
  user,
  worldId,
  role,
  memberId
}: Context & { worldId: string; role: WorldMemberRole; memberId: string }) => {
  await ensureWorldExists(worldId);
  await ensureCanManageWorld(user, worldId);
  if (role === "architect") {
    await ensureNotRemovingPrimaryArchitect(worldId, memberId);
  }
  await memberTable[role].delete(worldId, memberId);
  return true;
};

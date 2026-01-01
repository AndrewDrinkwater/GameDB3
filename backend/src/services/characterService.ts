import { Prisma, User } from "@prisma/client";
import prisma from "../lib/prismaClient";
import {
  canCreateCharacterInCampaign,
  canCreateCharacterInWorld,
  isAdmin,
  isWorldArchitect
} from "../lib/helpers";
import { ServiceError } from "./serviceError";

type CharacterListQuery = {
  worldId?: string;
  campaignId?: string;
  characterId?: string;
};

type CharacterCreatePayload = {
  worldId?: string;
  name?: string;
  description?: string;
  statusKey?: string;
  playerId?: string;
  campaignId?: string;
};

type CharacterUpdatePayload = {
  name?: string;
  description?: string;
  statusKey?: string;
  worldId?: string;
  playerId?: string;
};

type Context = { user: User };

const buildAccessClause = (user: User): Prisma.CharacterWhereInput =>
  isAdmin(user)
    ? {}
    : {
        OR: [
          { playerId: user.id },
          { world: { primaryArchitectId: user.id } },
          { world: { architects: { some: { userId: user.id } } } },
          { campaigns: { some: { campaign: { gmUserId: user.id } } } }
        ]
      };

export const listCharacters = async ({ user, worldId, campaignId, characterId }: Context & CharacterListQuery) => {
  const accessClause = buildAccessClause(user);
  const filters: Prisma.CharacterWhereInput[] = [accessClause];
  if (worldId) filters.push({ worldId });
  if (campaignId) filters.push({ campaigns: { some: { campaignId } } });
  if (characterId) filters.push({ id: characterId });
  const whereClause = filters.length > 1 ? { AND: filters } : accessClause;
  return prisma.character.findMany({
    where: whereClause,
    orderBy: { name: "asc" }
  });
};

const ensureCharacterExists = async (characterId: string) => {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, playerId: true, worldId: true }
  });
  if (!character) {
    throw new ServiceError(404, "Character not found.");
  }
  return character;
};

export const createCharacter = async ({
  user,
  worldId,
  name,
  description,
  statusKey,
  playerId,
  campaignId
}: Context & CharacterCreatePayload) => {
  if (!worldId || !name) {
    throw new ServiceError(400, "worldId and name are required.");
  }

  if (campaignId) {
    const canCreate = isAdmin(user) || (await canCreateCharacterInCampaign(user.id, campaignId));
    if (!canCreate) {
      throw new ServiceError(403, "Forbidden.");
    }
  } else {
    const canCreate = isAdmin(user) || (await canCreateCharacterInWorld(user.id, worldId));
    if (!canCreate) {
      throw new ServiceError(403, "Forbidden.");
    }
  }

  if (campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { worldId: true }
    });
    if (!campaign || campaign.worldId !== worldId) {
      throw new ServiceError(400, "Campaign world mismatch.");
    }
  }

  const effectivePlayerId = isAdmin(user) && playerId ? playerId : user.id;

  const character = await prisma.character.create({
    data: {
      name,
      description,
      statusKey,
      playerId: effectivePlayerId,
      worldId
    }
  });

  if (campaignId) {
    await prisma.characterCampaign.create({
      data: {
        campaignId,
        characterId: character.id,
        status: "ACTIVE"
      }
    });
  }

  return character;
};

export const getCharacter = async ({ user, characterId }: Context & { characterId: string }) => {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: {
      world: { include: { architects: true } },
      campaigns: { include: { campaign: { select: { gmUserId: true } } } }
    }
  });
  if (!character) {
    throw new ServiceError(404, "Character not found.");
  }

  const canAccess =
    isAdmin(user) ||
    character.playerId === user.id ||
    character.world.primaryArchitectId === user.id ||
    character.world.architects.some((architect) => architect.userId === user.id) ||
    character.campaigns.some((entry) => entry.campaign.gmUserId === user.id);

  if (!canAccess) {
    throw new ServiceError(403, "Forbidden.");
  }

  const { campaigns, ...characterData } = character;
  return {
    ...characterData,
    campaignIds: campaigns.map((entry) => entry.campaignId)
  };
};

export const updateCharacter = async ({
  user,
  characterId,
  name,
  description,
  statusKey,
  worldId,
  playerId
}: Context & { characterId: string } & CharacterUpdatePayload) => {
  const character = await ensureCharacterExists(characterId);
  const isArchitect = await isWorldArchitect(user.id, character.worldId);
  if (!isAdmin(user) && !isArchitect && character.playerId !== user.id) {
    throw new ServiceError(403, "Forbidden.");
  }

  if (worldId && worldId !== character.worldId) {
    throw new ServiceError(400, "Character world cannot be changed.");
  }

  return prisma.character.update({
    where: { id: characterId },
    data: {
      name,
      description,
      statusKey,
      playerId: isAdmin(user) && playerId ? playerId : undefined
    }
  });
};

export const deleteCharacter = async ({ user, characterId }: Context & { characterId: string }) => {
  const character = await ensureCharacterExists(characterId);
  const isArchitect = await isWorldArchitect(user.id, character.worldId);
  if (!isAdmin(user) && !isArchitect && character.playerId !== user.id) {
    throw new ServiceError(403, "Forbidden.");
  }

  await prisma.character.delete({ where: { id: characterId } });
  return true;
};

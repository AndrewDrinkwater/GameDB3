import type { Prisma, User } from "@prisma/client";
import { Role, WorldEntityPermissionScope } from "@prisma/client";
import prisma from "./prismaClient";

const isAdmin = (user: User) => user.role === Role.ADMIN;

const isWorldArchitect = async (userId: string, worldId: string) => {
  const world = await prisma.world.findUnique({
    where: { id: worldId },
    select: {
      primaryArchitectId: true,
      architects: { where: { userId }, select: { userId: true } }
    }
  });

  if (!world) return false;
  return world.primaryArchitectId === userId || world.architects.length > 0;
};

const isWorldGameMaster = async (userId: string, worldId: string) => {
  const entry = await prisma.worldGameMaster.findFirst({
    where: { worldId, userId },
    select: { userId: true }
  });
  return Boolean(entry);
};

const canCreateCampaign = async (userId: string, worldId: string) => {
  if (await isWorldArchitect(userId, worldId)) return true;
  if (await isWorldGameMaster(userId, worldId)) return true;
  return false;
};

const canCreateCharacterInWorld = async (userId: string, worldId: string) => {
  if (await isWorldArchitect(userId, worldId)) return true;

  const allowed = await prisma.worldCharacterCreator.findFirst({
    where: { worldId, userId }
  });

  return Boolean(allowed);
};

const isWorldGm = async (userId: string, worldId: string) => {
  const campaign = await prisma.campaign.findFirst({
    where: { worldId, gmUserId: userId },
    select: { id: true }
  });
  return Boolean(campaign);
};

const isWorldPlayer = async (userId: string, worldId: string) => {
  const character = await prisma.character.findFirst({
    where: { worldId, playerId: userId },
    select: { id: true }
  });
  return Boolean(character);
};

const canCreateEntityInWorld = async (userId: string, worldId: string) => {
  const world = await prisma.world.findUnique({
    where: { id: worldId },
    select: { entityPermissionScope: true }
  });

  if (!world) return false;
  if (await isWorldArchitect(userId, worldId)) return true;

  if (world.entityPermissionScope === WorldEntityPermissionScope.ARCHITECT_GM) {
    return isWorldGm(userId, worldId);
  }

  if (world.entityPermissionScope === WorldEntityPermissionScope.ARCHITECT_GM_PLAYER) {
    if (await isWorldGm(userId, worldId)) return true;
    return isWorldPlayer(userId, worldId);
  }

  return false;
};

const canCreateLocationInWorld = async (userId: string, worldId: string) => {
  return canCreateEntityInWorld(userId, worldId);
};

const canManageCampaign = async (userId: string, campaignId: string) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { gmUserId: true, worldId: true }
  });

  if (!campaign) return false;
  if (campaign.gmUserId === userId) return true;
  return isWorldArchitect(userId, campaign.worldId);
};

const isCampaignGm = async (userId: string, campaignId: string) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { gmUserId: true }
  });
  if (!campaign) return false;
  return campaign.gmUserId === userId;
};

const canAccessCampaign = async (userId: string, campaignId: string) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { gmUserId: true, createdById: true, worldId: true }
  });

  if (!campaign) return false;
  if (campaign.gmUserId === userId || campaign.createdById === userId) return true;
  if (await isWorldArchitect(userId, campaign.worldId)) return true;
  const playerEntry = await prisma.characterCampaign.findFirst({
    where: { campaignId, character: { playerId: userId } },
    select: { campaignId: true }
  });
  return Boolean(playerEntry);
};

const canAccessWorld = async (userId: string, worldId: string) => {
  const world = await prisma.world.findUnique({
    where: { id: worldId },
    select: {
      primaryArchitectId: true,
      architects: { where: { userId }, select: { userId: true } },
      gameMasters: { where: { userId }, select: { userId: true } },
      campaignCreators: { where: { userId }, select: { userId: true } },
      characterCreators: { where: { userId }, select: { userId: true } }
    }
  });

  if (!world) return false;
  if (
    world.primaryArchitectId === userId ||
    world.architects.length > 0 ||
    world.gameMasters.length > 0 ||
    world.campaignCreators.length > 0 ||
    world.characterCreators.length > 0
  ) {
    return true;
  }

  if (await isWorldGm(userId, worldId)) return true;
  return isWorldPlayer(userId, worldId);
};

const canCreateCharacterInCampaign = async (userId: string, campaignId: string) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { gmUserId: true, worldId: true }
  });

  if (!campaign) return false;
  if (campaign.gmUserId === userId) return true;
  if (await isWorldArchitect(userId, campaign.worldId)) return true;

  const allowed = await prisma.campaignCharacterCreator.findFirst({
    where: { campaignId, userId }
  });

  return Boolean(allowed);
};

export {
  isAdmin,
  isWorldArchitect,
  isWorldGameMaster,
  canCreateCampaign,
  canCreateCharacterInWorld,
  isWorldGm,
  isWorldPlayer,
  canCreateEntityInWorld,
  canCreateLocationInWorld,
  canManageCampaign,
  isCampaignGm,
  canAccessCampaign,
  canAccessWorld,
  canCreateCharacterInCampaign
};

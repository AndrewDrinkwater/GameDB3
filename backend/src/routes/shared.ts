import { prisma } from "../lib/helpers";

export const hasLocationCycle = async (locationId: string, parentId: string | null) => {
  let currentId = parentId;
  const seen = new Set<string>();
  while (currentId) {
    if (currentId === locationId) return true;
    if (seen.has(currentId)) return true;
    seen.add(currentId);
    const parent = await prisma.location.findUnique({
      where: { id: currentId },
      select: { parentLocationId: true }
    });
    currentId = parent?.parentLocationId ?? null;
  }
  return false;
};

export const getAllowedLocationParentTypeIds = async (childTypeId: string, worldId: string) => {
  const rules = await prisma.locationTypeRule.findMany({
    where: { parentType: { worldId } },
    select: { parentTypeId: true, childTypeId: true, allowed: true }
  });

  const allowedParentsByChild = new Map<string, Set<string>>();
  const deniedParentsByChild = new Map<string, Set<string>>();

  rules.forEach((rule) => {
    const map = rule.allowed ? allowedParentsByChild : deniedParentsByChild;
    const set = map.get(rule.childTypeId) ?? new Set<string>();
    set.add(rule.parentTypeId);
    map.set(rule.childTypeId, set);
  });

  const allowedParents = new Set<string>();
  const queue: string[] = [childTypeId];
  const visited = new Set<string>([childTypeId]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const parents = allowedParentsByChild.get(current);
    if (!parents) continue;
    parents.forEach((parentId) => {
      allowedParents.add(parentId);
      if (!visited.has(parentId)) {
        visited.add(parentId);
        queue.push(parentId);
      }
    });
  }

  const deniedParents = deniedParentsByChild.get(childTypeId);
  if (deniedParents) {
    deniedParents.forEach((parentId) => allowedParents.delete(parentId));
  }

  return allowedParents;
};

export const getWorldAccessUserIds = async (worldId: string) => {
  const world = await prisma.world.findUnique({
    where: { id: worldId },
    select: {
      primaryArchitectId: true,
      architects: { select: { userId: true } },
      gameMasters: { select: { userId: true } },
      campaignCreators: { select: { userId: true } },
      characterCreators: { select: { userId: true } }
    }
  });

  if (!world) return [];

  const [campaignGms, characterPlayers] = await Promise.all([
    prisma.campaign.findMany({
      where: { worldId },
      select: { gmUserId: true }
    }),
    prisma.character.findMany({
      where: { worldId },
      select: { playerId: true }
    })
  ]);

  const userIds = new Set<string>();
  if (world.primaryArchitectId) userIds.add(world.primaryArchitectId);
  world.architects.forEach((entry) => userIds.add(entry.userId));
  world.gameMasters.forEach((entry) => userIds.add(entry.userId));
  world.campaignCreators.forEach((entry) => userIds.add(entry.userId));
  world.characterCreators.forEach((entry) => userIds.add(entry.userId));
  campaignGms.forEach((entry) => userIds.add(entry.gmUserId));
  characterPlayers.forEach((entry) => userIds.add(entry.playerId));

  return Array.from(userIds);
};

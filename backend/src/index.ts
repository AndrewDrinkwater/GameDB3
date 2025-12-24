import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import {
  Prisma,
  PrismaClient,
  PropertyValueType,
  RelatedListFieldSource,
  Role,
  SystemViewType,
  User
} from "@prisma/client";

dotenv.config();

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const prisma = new PrismaClient();
const tokens = new Map<string, string>();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

type AuthRequest = express.Request & { user?: User };

const getBearerToken = (req: express.Request) => {
  const header = req.header("authorization");
  if (!header) return null;
  const [type, token] = header.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) return null;
  return token;
};

const getAuthUser = async (req: express.Request) => {
  const token = getBearerToken(req);
  if (!token) return null;
  const userId = tokens.get(token);
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
};

const requireAuth: express.RequestHandler = async (req, res, next) => {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }
  (req as AuthRequest).user = user;
  next();
};

const requireSystemAdmin: express.RequestHandler = async (req, res, next) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  if (user.role === Role.ADMIN) {
    next();
    return;
  }

  const hasControl = await prisma.systemUserRole.findFirst({
    where: {
      userId: user.id,
      role: {
        controls: {
          some: {
            control: { key: "system.manage" }
          }
        }
      }
    }
  });

  if (!hasControl) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  next();
};

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

const canCreateCampaign = async (userId: string, worldId: string) => {
  if (await isWorldArchitect(userId, worldId)) return true;

  const allowed = await prisma.worldCampaignCreator.findFirst({
    where: { worldId, userId }
  });

  return Boolean(allowed);
};

const canCreateCharacterInWorld = async (userId: string, worldId: string) => {
  if (await isWorldArchitect(userId, worldId)) return true;

  const allowed = await prisma.worldCharacterCreator.findFirst({
    where: { worldId, userId }
  });

  return Boolean(allowed);
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

const canAccessCampaign = async (userId: string, campaignId: string) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { gmUserId: true, createdById: true, worldId: true }
  });

  if (!campaign) return false;
  if (campaign.gmUserId === userId || campaign.createdById === userId) return true;
  return isWorldArchitect(userId, campaign.worldId);
};

const canAccessWorld = async (userId: string, worldId: string) => {
  const world = await prisma.world.findUnique({
    where: { id: worldId },
    select: {
      primaryArchitectId: true,
      architects: { where: { userId }, select: { userId: true } },
      campaignCreators: { where: { userId }, select: { userId: true } },
      characterCreators: { where: { userId }, select: { userId: true } }
    }
  });

  if (!world) return false;
  return (
    world.primaryArchitectId === userId ||
    world.architects.length > 0 ||
    world.campaignCreators.length > 0 ||
    world.characterCreators.length > 0
  );
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

const getLabelFieldForEntity = async (entityKey: string) => {
  const entry = await prisma.systemDictionary.findFirst({
    where: { entityKey, isLabel: true },
    select: { fieldKey: true }
  });
  return entry?.fieldKey ?? "name";
};

const getReferenceResults = async (entityKey: string, query?: string, ids?: string[]) => {
  const labelField = await getLabelFieldForEntity(entityKey);
  const queryValue = query?.trim();

  if (entityKey === "users") {
    const whereClause: Prisma.UserWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? {
            OR: [
              { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } },
              { email: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
            ]
          }
        : {};

    const users = await prisma.user.findMany({
      where: whereClause,
      select: { id: true, name: true, email: true },
      orderBy: { email: "asc" },
      take: 25
    });

    return users.map((user) => ({
      id: user.id,
      label: user.name ?? user.email ?? user.id
    }));
  }

  if (entityKey === "worlds") {
    const whereClause: Prisma.WorldWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const worlds = await prisma.world.findMany({
      where: whereClause,
      select: select as { id: true },
      orderBy: { name: "asc" },
      take: 25
    });

    return worlds.map((world) => {
      const labelValue = (world as Record<string, unknown>)[labelField];
      return {
        id: world.id,
        label: labelValue ? String(labelValue) : world.id
      };
    });
  }

  if (entityKey === "campaigns") {
    const whereClause: Prisma.CampaignWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const campaigns = await prisma.campaign.findMany({
      where: whereClause,
      select: select as { id: true },
      orderBy: { name: "asc" },
      take: 25
    });

    return campaigns.map((campaign) => {
      const labelValue = (campaign as Record<string, unknown>)[labelField];
      return {
        id: campaign.id,
        label: labelValue ? String(labelValue) : campaign.id
      };
    });
  }

  if (entityKey === "characters") {
    const whereClause: Prisma.CharacterWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const characters = await prisma.character.findMany({
      where: whereClause,
      select: select as { id: true },
      orderBy: { name: "asc" },
      take: 25
    });

    return characters.map((character) => {
      const labelValue = (character as Record<string, unknown>)[labelField];
      return {
        id: character.id,
        label: labelValue ? String(labelValue) : character.id
      };
    });
  }

  return [];
};


app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    const token = randomUUID();
    tokens.set(token, user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login failed", error);
    res.status(500).json({ error: "Login failed." });
  }
});

app.get("/api/auth/me", async (req, res) => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token." });
    return;
  }

  const userId = tokens.get(token);
  if (!userId) {
    res.status(401).json({ error: "Invalid token." });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(401).json({ error: "Invalid token." });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  });
});

app.post("/api/auth/logout", (req, res) => {
  const token = getBearerToken(req);
  if (token) {
    tokens.delete(token);
  }
  res.json({ ok: true });
});

app.get("/api/choices", requireAuth, async (req, res) => {
  const listKey = typeof req.query.listKey === "string" ? req.query.listKey : undefined;
  if (!listKey) {
    res.status(400).json({ error: "listKey is required." });
    return;
  }

  const choices = await prisma.systemChoice.findMany({
    where: { listKey, isActive: true },
    orderBy: { sortOrder: "asc" }
  });
  res.json(choices);
});

app.get("/api/views", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const views = await prisma.systemView.findMany({
    where: isAdmin(user) ? {} : { adminOnly: false },
    include: { fields: true },
    orderBy: { title: "asc" }
  });

  res.json(views);
});

app.get("/api/views/:key", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const view = await prisma.systemView.findUnique({
    where: { key: req.params.key },
    include: { fields: true }
  });

  if (!view) {
    res.status(404).json({ error: "View not found." });
    return;
  }

  if (view.adminOnly && !isAdmin(user)) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  res.json(view);
});

app.get("/api/related-lists", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const entityKey = typeof req.query.entityKey === "string" ? req.query.entityKey : undefined;
  if (!entityKey) {
    res.status(400).json({ error: "entityKey is required." });
    return;
  }

  const relatedLists = await prisma.systemRelatedList.findMany({
    where: {
      parentEntityKey: entityKey,
      ...(isAdmin(user) ? {} : { adminOnly: false })
    },
    include: {
      fields: { orderBy: { listOrder: "asc" } }
    },
    orderBy: { listOrder: "asc" }
  });

  res.json(relatedLists);
});

app.get("/api/related-lists/:key", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { key } = req.params;
  const parentId = typeof req.query.parentId === "string" ? req.query.parentId : undefined;
  if (!parentId) {
    res.status(400).json({ error: "parentId is required." });
    return;
  }

  const relatedList = await prisma.systemRelatedList.findUnique({
    where: { key },
    include: { fields: { orderBy: { listOrder: "asc" } } }
  });

  if (!relatedList) {
    res.status(404).json({ error: "Related list not found." });
    return;
  }

  if (relatedList.adminOnly && !isAdmin(user)) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  if (relatedList.parentEntityKey === "campaigns") {
    const canAccess = isAdmin(user) || (await canAccessCampaign(user.id, parentId));
    if (!canAccess) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  }

  if (relatedList.parentEntityKey === "worlds") {
    const canAccess = isAdmin(user) || (await canAccessWorld(user.id, parentId));
    if (!canAccess) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  }

  const relatedFields = relatedList.fields.filter((field) => field.source === "RELATED");
  const relatedSelect: Record<string, boolean> = { id: true };
  relatedFields.forEach((field) => {
    relatedSelect[field.fieldKey] = true;
  });

  let items: Array<{
    relatedId: string;
    relatedData: Record<string, unknown>;
    joinData: Record<string, unknown>;
  }> = [];

  if (relatedList.joinEntityKey === "characterCampaign") {
    const rows = await prisma.characterCampaign.findMany({
      where: { campaignId: parentId },
      include: { character: { select: relatedSelect as Record<string, true> } }
    });

    items = rows.map((row) => ({
      relatedId: row.characterId,
      relatedData: row.character as Record<string, unknown>,
      joinData: { status: row.status }
    }));
  }

  if (relatedList.joinEntityKey === "worldCharacterCreator") {
    const rows = await prisma.worldCharacterCreator.findMany({
      where: { worldId: parentId },
      include: { user: { select: relatedSelect as Record<string, true> } }
    });

    items = rows.map((row) => ({
      relatedId: row.userId,
      relatedData: row.user as Record<string, unknown>,
      joinData: {}
    }));
  }

  if (relatedList.joinEntityKey === "worldCampaignCreator") {
    const rows = await prisma.worldCampaignCreator.findMany({
      where: { worldId: parentId },
      include: { user: { select: relatedSelect as Record<string, true> } }
    });

    items = rows.map((row) => ({
      relatedId: row.userId,
      relatedData: row.user as Record<string, unknown>,
      joinData: {}
    }));
  }

  if (relatedList.joinEntityKey === "worldArchitect") {
    const rows = await prisma.worldArchitect.findMany({
      where: { worldId: parentId },
      include: { user: { select: relatedSelect as Record<string, true> } }
    });

    items = rows.map((row) => ({
      relatedId: row.userId,
      relatedData: row.user as Record<string, unknown>,
      joinData: {}
    }));
  }

  if (relatedList.joinEntityKey === "campaignCharacterCreator") {
    const rows = await prisma.campaignCharacterCreator.findMany({
      where: { campaignId: parentId },
      include: { user: { select: relatedSelect as Record<string, true> } }
    });

    items = rows.map((row) => ({
      relatedId: row.userId,
      relatedData: row.user as Record<string, unknown>,
      joinData: {}
    }));
  }

  res.json({ items });
});

app.post("/api/related-lists/:key", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { key } = req.params;
  const { parentId, relatedId } = req.body as { parentId?: string; relatedId?: string };

  if (!parentId || !relatedId) {
    res.status(400).json({ error: "parentId and relatedId are required." });
    return;
  }

  const relatedList = await prisma.systemRelatedList.findUnique({ where: { key } });
  if (!relatedList) {
    res.status(404).json({ error: "Related list not found." });
    return;
  }

  if (relatedList.adminOnly && !isAdmin(user)) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  if (relatedList.parentEntityKey === "campaigns") {
    const canManage = isAdmin(user) || (await canManageCampaign(user.id, parentId));
    if (!canManage) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  }

  if (relatedList.parentEntityKey === "worlds") {
    const canManage = isAdmin(user) || (await isWorldArchitect(user.id, parentId));
    if (!canManage) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  }

  if (relatedList.joinEntityKey === "characterCampaign") {
    const campaign = await prisma.campaign.findUnique({
      where: { id: parentId },
      select: { worldId: true }
    });
    const character = await prisma.character.findUnique({
      where: { id: relatedId },
      select: { worldId: true }
    });

    if (!campaign || !character || campaign.worldId !== character.worldId) {
      res.status(400).json({ error: "World mismatch." });
      return;
    }

    const entry = await prisma.characterCampaign.upsert({
      where: { characterId_campaignId: { characterId: relatedId, campaignId: parentId } },
      update: {},
      create: { characterId: relatedId, campaignId: parentId, status: "ACTIVE" }
    });
    res.status(201).json(entry);
    return;
  }

  if (relatedList.joinEntityKey === "worldCharacterCreator") {
    const entry = await prisma.worldCharacterCreator.upsert({
      where: { worldId_userId: { worldId: parentId, userId: relatedId } },
      update: {},
      create: { worldId: parentId, userId: relatedId }
    });
    res.status(201).json(entry);
    return;
  }

  if (relatedList.joinEntityKey === "worldCampaignCreator") {
    const entry = await prisma.worldCampaignCreator.upsert({
      where: { worldId_userId: { worldId: parentId, userId: relatedId } },
      update: {},
      create: { worldId: parentId, userId: relatedId }
    });
    res.status(201).json(entry);
    return;
  }

  if (relatedList.joinEntityKey === "worldArchitect") {
    const entry = await prisma.worldArchitect.upsert({
      where: { worldId_userId: { worldId: parentId, userId: relatedId } },
      update: {},
      create: { worldId: parentId, userId: relatedId }
    });
    res.status(201).json(entry);
    return;
  }

  if (relatedList.joinEntityKey === "campaignCharacterCreator") {
    const entry = await prisma.campaignCharacterCreator.upsert({
      where: { campaignId_userId: { campaignId: parentId, userId: relatedId } },
      update: {},
      create: { campaignId: parentId, userId: relatedId }
    });
    res.status(201).json(entry);
    return;
  }

  res.status(400).json({ error: "Unsupported related list." });
});

app.delete("/api/related-lists/:key", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { key } = req.params;
  const { parentId, relatedId } = req.body as { parentId?: string; relatedId?: string };

  if (!parentId || !relatedId) {
    res.status(400).json({ error: "parentId and relatedId are required." });
    return;
  }

  const relatedList = await prisma.systemRelatedList.findUnique({ where: { key } });
  if (!relatedList) {
    res.status(404).json({ error: "Related list not found." });
    return;
  }

  if (relatedList.adminOnly && !isAdmin(user)) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  if (relatedList.parentEntityKey === "campaigns") {
    const canManage = isAdmin(user) || (await canManageCampaign(user.id, parentId));
    if (!canManage) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  }

  if (relatedList.parentEntityKey === "worlds") {
    const canManage = isAdmin(user) || (await isWorldArchitect(user.id, parentId));
    if (!canManage) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  }

  if (relatedList.joinEntityKey === "characterCampaign") {
    await prisma.characterCampaign.delete({
      where: { characterId_campaignId: { characterId: relatedId, campaignId: parentId } }
    });
    res.json({ ok: true });
    return;
  }

  if (relatedList.joinEntityKey === "worldCharacterCreator") {
    await prisma.worldCharacterCreator.delete({
      where: { worldId_userId: { worldId: parentId, userId: relatedId } }
    });
    res.json({ ok: true });
    return;
  }

  if (relatedList.joinEntityKey === "worldCampaignCreator") {
    await prisma.worldCampaignCreator.delete({
      where: { worldId_userId: { worldId: parentId, userId: relatedId } }
    });
    res.json({ ok: true });
    return;
  }

  if (relatedList.joinEntityKey === "worldArchitect") {
    await prisma.worldArchitect.delete({
      where: { worldId_userId: { worldId: parentId, userId: relatedId } }
    });
    res.json({ ok: true });
    return;
  }

  if (relatedList.joinEntityKey === "campaignCharacterCreator") {
    await prisma.campaignCharacterCreator.delete({
      where: { campaignId_userId: { campaignId: parentId, userId: relatedId } }
    });
    res.json({ ok: true });
    return;
  }

  res.status(400).json({ error: "Unsupported related list." });
});

app.get("/api/references", requireAuth, async (req, res) => {
  const entityKey = typeof req.query.entityKey === "string" ? req.query.entityKey : undefined;
  const query = typeof req.query.query === "string" ? req.query.query : undefined;
  const idsParam = typeof req.query.ids === "string" ? req.query.ids : undefined;
  const scope = typeof req.query.scope === "string" ? req.query.scope : undefined;

  if (!entityKey) {
    res.status(400).json({ error: "entityKey is required." });
    return;
  }

  const ids = idsParam ? idsParam.split(",").map((id) => id.trim()).filter(Boolean) : undefined;
  let results = await getReferenceResults(entityKey, query, ids);

  if (entityKey === "worlds") {
    const user = (req as AuthRequest).user;
    if (user && !isAdmin(user) && !ids) {
      let whereClause = {
        OR: [
          { primaryArchitectId: user.id },
          { architects: { some: { userId: user.id } } },
          { campaignCreators: { some: { userId: user.id } } },
          { characterCreators: { some: { userId: user.id } } }
        ]
      };

      if (scope === "character_create") {
        whereClause = {
          OR: [
            { primaryArchitectId: user.id },
            { architects: { some: { userId: user.id } } },
            { characterCreators: { some: { userId: user.id } } }
          ]
        };
      }

      if (scope === "campaign_create") {
        whereClause = {
          OR: [
            { primaryArchitectId: user.id },
            { architects: { some: { userId: user.id } } },
            { campaignCreators: { some: { userId: user.id } } }
          ]
        };
      }

      const allowedWorlds = await prisma.world.findMany({
        where: whereClause,
        select: { id: true }
      });
      const allowedIds = new Set(allowedWorlds.map((world) => world.id));
      results = results.filter((item) => allowedIds.has(item.id));
    }
  }
  res.json(results);
});

app.post("/api/views", requireAuth, requireSystemAdmin, async (req, res) => {
  const { key, title, entityKey, viewType, endpoint, description, adminOnly } = req.body as {
    key?: string;
    title?: string;
    entityKey?: string;
    viewType?: string;
    endpoint?: string;
    description?: string;
    adminOnly?: boolean;
  };

  if (!key || !title || !entityKey || !viewType || !endpoint) {
    res.status(400).json({ error: "key, title, entityKey, viewType, and endpoint are required." });
    return;
  }

  if (!Object.values(SystemViewType).includes(viewType as SystemViewType)) {
    res.status(400).json({ error: "Invalid viewType." });
    return;
  }

  const view = await prisma.systemView.create({
    data: {
      key,
      title,
      entityKey,
      viewType: viewType as SystemViewType,
      endpoint,
      description,
      adminOnly
    }
  });
  res.status(201).json(view);
});

app.put("/api/views/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  const { id } = req.params;
  const { key, title, entityKey, viewType, endpoint, description, adminOnly } = req.body as {
    key?: string;
    title?: string;
    entityKey?: string;
    viewType?: string;
    endpoint?: string;
    description?: string;
    adminOnly?: boolean;
  };

  const viewTypeValue =
    viewType && Object.values(SystemViewType).includes(viewType as SystemViewType)
      ? (viewType as SystemViewType)
      : undefined;

  const view = await prisma.systemView.update({
    where: { id },
    data: { key, title, entityKey, viewType: viewTypeValue, endpoint, description, adminOnly }
  });
  res.json(view);
});

app.delete("/api/views/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  await prisma.systemView.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

app.get("/api/system/properties", requireAuth, requireSystemAdmin, async (_req, res) => {
  const properties = await prisma.systemProperty.findMany({ orderBy: { key: "asc" } });
  res.json(properties);
});

app.post("/api/system/properties", requireAuth, requireSystemAdmin, async (req, res) => {
  const { key, valueType, value, description } = req.body as {
    key?: string;
    valueType?: string;
    value?: string;
    description?: string;
  };

  if (!key || !valueType || value === undefined) {
    res.status(400).json({ error: "key, valueType, and value are required." });
    return;
  }

  if (!Object.values(PropertyValueType).includes(valueType as PropertyValueType)) {
    res.status(400).json({ error: "Invalid valueType." });
    return;
  }

  const property = await prisma.systemProperty.create({
    data: { key, valueType: valueType as PropertyValueType, value, description }
  });
  res.status(201).json(property);
});

app.put("/api/system/properties/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  const { id } = req.params;
  const { key, valueType, value, description } = req.body as {
    key?: string;
    valueType?: string;
    value?: string;
    description?: string;
  };

  const valueTypeValue =
    valueType && Object.values(PropertyValueType).includes(valueType as PropertyValueType)
      ? (valueType as PropertyValueType)
      : undefined;

  const property = await prisma.systemProperty.update({
    where: { id },
    data: { key, valueType: valueTypeValue, value, description }
  });
  res.json(property);
});

app.delete("/api/system/properties/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  await prisma.systemProperty.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

app.get(
  "/api/system/preference-defaults",
  requireAuth,
  requireSystemAdmin,
  async (_req, res) => {
    const defaults = await prisma.systemUserPreferenceDefault.findMany({
      orderBy: { key: "asc" }
    });
    res.json(defaults);
  }
);

app.post(
  "/api/system/preference-defaults",
  requireAuth,
  requireSystemAdmin,
  async (req, res) => {
    const { key, valueType, value, description } = req.body as {
      key?: string;
      valueType?: string;
      value?: string;
      description?: string;
    };

    if (!key || !valueType || value === undefined) {
      res.status(400).json({ error: "key, valueType, and value are required." });
      return;
    }

    if (!Object.values(PropertyValueType).includes(valueType as PropertyValueType)) {
      res.status(400).json({ error: "Invalid valueType." });
      return;
    }

    const prefDefault = await prisma.systemUserPreferenceDefault.create({
      data: { key, valueType: valueType as PropertyValueType, value, description }
    });
    res.status(201).json(prefDefault);
  }
);

app.put(
  "/api/system/preference-defaults/:id",
  requireAuth,
  requireSystemAdmin,
  async (req, res) => {
    const { id } = req.params;
    const { key, valueType, value, description } = req.body as {
      key?: string;
      valueType?: string;
      value?: string;
      description?: string;
    };

    const valueTypeValue =
      valueType && Object.values(PropertyValueType).includes(valueType as PropertyValueType)
        ? (valueType as PropertyValueType)
        : undefined;

    const prefDefault = await prisma.systemUserPreferenceDefault.update({
      where: { id },
      data: { key, valueType: valueTypeValue, value, description }
    });
    res.json(prefDefault);
  }
);

app.delete(
  "/api/system/preference-defaults/:id",
  requireAuth,
  requireSystemAdmin,
  async (req, res) => {
    await prisma.systemUserPreferenceDefault.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }
);

app.get("/api/system/choices", requireAuth, requireSystemAdmin, async (_req, res) => {
  const choices = await prisma.systemChoice.findMany({
    orderBy: [{ listKey: "asc" }, { sortOrder: "asc" }]
  });
  res.json(choices);
});

app.get("/api/system/choices/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  const choice = await prisma.systemChoice.findUnique({
    where: { id: req.params.id }
  });
  if (!choice) {
    res.status(404).json({ error: "Choice not found." });
    return;
  }
  res.json(choice);
});

app.post("/api/system/choices", requireAuth, requireSystemAdmin, async (req, res) => {
  const { listKey, value, label, sortOrder, isActive } = req.body as {
    listKey?: string;
    value?: string;
    label?: string;
    sortOrder?: number;
    isActive?: boolean;
  };

  if (!listKey || !value || !label) {
    res.status(400).json({ error: "listKey, value, and label are required." });
    return;
  }

  const choice = await prisma.systemChoice.create({
    data: { listKey, value, label, sortOrder, isActive }
  });
  res.status(201).json(choice);
});

app.put("/api/system/choices/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  const { id } = req.params;
  const { listKey, value, label, sortOrder, isActive } = req.body as {
    listKey?: string;
    value?: string;
    label?: string;
    sortOrder?: number;
    isActive?: boolean;
  };

  const choice = await prisma.systemChoice.update({
    where: { id },
    data: { listKey, value, label, sortOrder, isActive }
  });
  res.json(choice);
});

app.delete("/api/system/choices/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  await prisma.systemChoice.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

app.get("/api/system/roles", requireAuth, requireSystemAdmin, async (_req, res) => {
  const roles = await prisma.systemRole.findMany({ orderBy: { name: "asc" } });
  res.json(roles);
});

app.post("/api/system/roles", requireAuth, requireSystemAdmin, async (req, res) => {
  const { key, name, description } = req.body as {
    key?: string;
    name?: string;
    description?: string;
  };

  if (!key || !name) {
    res.status(400).json({ error: "key and name are required." });
    return;
  }

  const role = await prisma.systemRole.create({ data: { key, name, description } });
  res.status(201).json(role);
});

app.put("/api/system/roles/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  const { id } = req.params;
  const { key, name, description } = req.body as {
    key?: string;
    name?: string;
    description?: string;
  };

  const role = await prisma.systemRole.update({
    where: { id },
    data: { key, name, description }
  });
  res.json(role);
});

app.delete("/api/system/roles/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  await prisma.systemRole.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

app.get("/api/system/controls", requireAuth, requireSystemAdmin, async (_req, res) => {
  const controls = await prisma.systemControl.findMany({ orderBy: { key: "asc" } });
  res.json(controls);
});

app.get("/api/system/controls/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  const control = await prisma.systemControl.findUnique({
    where: { id: req.params.id }
  });
  if (!control) {
    res.status(404).json({ error: "Control not found." });
    return;
  }
  res.json(control);
});

app.post("/api/system/controls", requireAuth, requireSystemAdmin, async (req, res) => {
  const { key, description } = req.body as { key?: string; description?: string };

  if (!key) {
    res.status(400).json({ error: "key is required." });
    return;
  }

  const control = await prisma.systemControl.create({ data: { key, description } });
  res.status(201).json(control);
});

app.put("/api/system/controls/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  const { id } = req.params;
  const { key, description } = req.body as { key?: string; description?: string };

  const control = await prisma.systemControl.update({
    where: { id },
    data: { key, description }
  });
  res.json(control);
});

app.delete("/api/system/controls/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  await prisma.systemControl.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

app.get("/api/system/related-lists", requireAuth, requireSystemAdmin, async (_req, res) => {
  const relatedLists = await prisma.systemRelatedList.findMany({
    orderBy: { listOrder: "asc" }
  });
  res.json(relatedLists);
});

app.get(
  "/api/system/related-lists/:id",
  requireAuth,
  requireSystemAdmin,
  async (req, res) => {
    const relatedList = await prisma.systemRelatedList.findUnique({
      where: { id: req.params.id }
    });
    if (!relatedList) {
      res.status(404).json({ error: "Related list not found." });
      return;
    }
    res.json(relatedList);
  }
);

app.post("/api/system/related-lists", requireAuth, requireSystemAdmin, async (req, res) => {
  const {
    key,
    title,
    parentEntityKey,
    relatedEntityKey,
    joinEntityKey,
    parentFieldKey,
    relatedFieldKey,
    listOrder,
    adminOnly
  } = req.body as {
    key?: string;
    title?: string;
    parentEntityKey?: string;
    relatedEntityKey?: string;
    joinEntityKey?: string;
    parentFieldKey?: string;
    relatedFieldKey?: string;
    listOrder?: number;
    adminOnly?: boolean;
  };

  if (
    !key ||
    !title ||
    !parentEntityKey ||
    !relatedEntityKey ||
    !joinEntityKey ||
    !parentFieldKey ||
    !relatedFieldKey
  ) {
    res.status(400).json({ error: "Missing required fields." });
    return;
  }

  const relatedList = await prisma.systemRelatedList.create({
    data: {
      key,
      title,
      parentEntityKey,
      relatedEntityKey,
      joinEntityKey,
      parentFieldKey,
      relatedFieldKey,
      listOrder,
      adminOnly
    }
  });

  res.status(201).json(relatedList);
});

app.put("/api/system/related-lists/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    key,
    title,
    parentEntityKey,
    relatedEntityKey,
    joinEntityKey,
    parentFieldKey,
    relatedFieldKey,
    listOrder,
    adminOnly
  } = req.body as {
    key?: string;
    title?: string;
    parentEntityKey?: string;
    relatedEntityKey?: string;
    joinEntityKey?: string;
    parentFieldKey?: string;
    relatedFieldKey?: string;
    listOrder?: number;
    adminOnly?: boolean;
  };

  const relatedList = await prisma.systemRelatedList.update({
    where: { id },
    data: {
      key,
      title,
      parentEntityKey,
      relatedEntityKey,
      joinEntityKey,
      parentFieldKey,
      relatedFieldKey,
      listOrder,
      adminOnly
    }
  });

  res.json(relatedList);
});

app.delete("/api/system/related-lists/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  await prisma.systemRelatedList.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

app.get(
  "/api/system/related-list-fields",
  requireAuth,
  requireSystemAdmin,
  async (_req, res) => {
    const fields = await prisma.systemRelatedListField.findMany({
      orderBy: { listOrder: "asc" }
    });
    res.json(fields);
  }
);

app.get(
  "/api/system/related-list-fields/:id",
  requireAuth,
  requireSystemAdmin,
  async (req, res) => {
    const field = await prisma.systemRelatedListField.findUnique({
      where: { id: req.params.id }
    });
    if (!field) {
      res.status(404).json({ error: "Related list field not found." });
      return;
    }
    res.json(field);
  }
);

app.post(
  "/api/system/related-list-fields",
  requireAuth,
  requireSystemAdmin,
  async (req, res) => {
    const { relatedListId, fieldKey, label, source, listOrder, width } = req.body as {
      relatedListId?: string;
      fieldKey?: string;
      label?: string;
      source?: string;
      listOrder?: number;
      width?: string;
    };

    if (!relatedListId || !fieldKey || !label || !source || listOrder === undefined) {
      res.status(400).json({ error: "Missing required fields." });
      return;
    }

    if (!Object.values(RelatedListFieldSource).includes(source as RelatedListFieldSource)) {
      res.status(400).json({ error: "Invalid source." });
      return;
    }

    const field = await prisma.systemRelatedListField.create({
      data: {
        relatedListId,
        fieldKey,
        label,
        source: source as RelatedListFieldSource,
        listOrder,
        width
      }
    });

    res.status(201).json(field);
  }
);

app.put(
  "/api/system/related-list-fields/:id",
  requireAuth,
  requireSystemAdmin,
  async (req, res) => {
    const { id } = req.params;
    const { relatedListId, fieldKey, label, source, listOrder, width } = req.body as {
      relatedListId?: string;
      fieldKey?: string;
      label?: string;
      source?: string;
      listOrder?: number;
      width?: string;
    };

    const sourceValue =
      source && Object.values(RelatedListFieldSource).includes(source as RelatedListFieldSource)
        ? (source as RelatedListFieldSource)
        : undefined;

    const field = await prisma.systemRelatedListField.update({
      where: { id },
      data: { relatedListId, fieldKey, label, source: sourceValue, listOrder, width }
    });

    res.json(field);
  }
);

app.delete(
  "/api/system/related-list-fields/:id",
  requireAuth,
  requireSystemAdmin,
  async (req, res) => {
    await prisma.systemRelatedListField.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }
);

app.get("/api/system/user-preferences", requireAuth, requireSystemAdmin, async (_req, res) => {
  const preferences = await prisma.systemUserPreference.findMany({
    orderBy: [{ userId: "asc" }, { key: "asc" }]
  });
  res.json(preferences);
});

app.get("/api/system/user-preferences/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  const preference = await prisma.systemUserPreference.findUnique({
    where: { id: req.params.id }
  });
  if (!preference) {
    res.status(404).json({ error: "Preference not found." });
    return;
  }
  res.json(preference);
});

app.post("/api/system/user-preferences", requireAuth, requireSystemAdmin, async (req, res) => {
  const { userId, key, valueType, value } = req.body as {
    userId?: string;
    key?: string;
    valueType?: string;
    value?: string;
  };

  if (!userId || !key || !valueType || value === undefined) {
    res.status(400).json({ error: "userId, key, valueType, and value are required." });
    return;
  }

  if (!Object.values(PropertyValueType).includes(valueType as PropertyValueType)) {
    res.status(400).json({ error: "Invalid valueType." });
    return;
  }

  const preference = await prisma.systemUserPreference.create({
    data: { userId, key, valueType: valueType as PropertyValueType, value }
  });

  res.status(201).json(preference);
});

app.put("/api/system/user-preferences/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  const { id } = req.params;
  const { userId, key, valueType, value } = req.body as {
    userId?: string;
    key?: string;
    valueType?: string;
    value?: string;
  };

  const valueTypeValue =
    valueType && Object.values(PropertyValueType).includes(valueType as PropertyValueType)
      ? (valueType as PropertyValueType)
      : undefined;

  const preference = await prisma.systemUserPreference.update({
    where: { id },
    data: { userId, key, valueType: valueTypeValue, value }
  });
  res.json(preference);
});

app.delete("/api/system/user-preferences/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  await prisma.systemUserPreference.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

app.get("/api/system/users", requireAuth, requireSystemAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { email: "asc" },
    select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true }
  });
  res.json(users);
});

app.get("/api/system/users/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true }
  });
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  res.json(user);
});

app.post("/api/system/users", requireAuth, requireSystemAdmin, async (req, res) => {
  const { email, name, role, password } = req.body as {
    email?: string;
    name?: string;
    role?: Role;
    password?: string;
  };

  if (!email || !role || !password) {
    res.status(400).json({ error: "email, role, and password are required." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { email, name, role, passwordHash },
    select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true }
  });

  res.status(201).json(user);
});

app.put("/api/system/users/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  const { id } = req.params;
  const { email, name, role, password } = req.body as {
    email?: string;
    name?: string;
    role?: Role;
    password?: string;
  };

  const data: { email?: string; name?: string; role?: Role; passwordHash?: string } = {
    email,
    name,
    role
  };

  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true }
  });

  res.json(user);
});

app.delete("/api/system/users/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

app.get("/api/user/preferences", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const preferences = await prisma.systemUserPreference.findMany({
    where: { userId: user.id },
    orderBy: { key: "asc" }
  });
  res.json(preferences);
});

app.get("/api/user/preferences/defaults", requireAuth, async (_req, res) => {
  const defaults = await prisma.systemUserPreferenceDefault.findMany({
    orderBy: { key: "asc" }
  });
  res.json(defaults);
});

app.put("/api/user/preferences/:key", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { key } = req.params;
  const { valueType, value } = req.body as { valueType?: string; value?: string };

  if (!valueType || value === undefined) {
    res.status(400).json({ error: "valueType and value are required." });
    return;
  }

  if (!Object.values(PropertyValueType).includes(valueType as PropertyValueType)) {
    res.status(400).json({ error: "Invalid valueType." });
    return;
  }

  const preference = await prisma.systemUserPreference.upsert({
    where: { userId_key: { userId: user.id, key } },
    update: { valueType: valueType as PropertyValueType, value },
    create: { userId: user.id, key, valueType: valueType as PropertyValueType, value }
  });
  res.json(preference);
});

app.delete("/api/user/preferences/:key", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  await prisma.systemUserPreference.delete({
    where: { userId_key: { userId: user.id, key: req.params.key } }
  });
  res.json({ ok: true });
});


app.get("/api/worlds", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const whereClause = isAdmin(user)
    ? {}
    : {
        OR: [
          { primaryArchitectId: user.id },
          { architects: { some: { userId: user.id } } },
          { campaignCreators: { some: { userId: user.id } } },
          { characterCreators: { some: { userId: user.id } } }
        ]
      };

  const worlds = await prisma.world.findMany({
    where: whereClause,
    orderBy: { name: "asc" }
  });

  res.json(worlds);
});

app.post("/api/worlds", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { name, description, dmLabelKey, themeKey, primaryArchitectId, characterCreatorIds } =
    req.body as {
    name?: string;
    description?: string;
    dmLabelKey?: string;
    themeKey?: string;
    primaryArchitectId?: string;
    characterCreatorIds?: string[];
  };

  if (!name) {
    res.status(400).json({ error: "name is required." });
    return;
  }

  const architectId = primaryArchitectId ?? user.id;
  if (primaryArchitectId && !isAdmin(user)) {
    res.status(403).json({ error: "Only admins can set the primary architect." });
    return;
  }

  const world = await prisma.world.create({
    data: {
      name,
      description,
      dmLabelKey,
      themeKey,
      primaryArchitectId: architectId
    }
  });

  await prisma.worldArchitect.upsert({
    where: { worldId_userId: { worldId: world.id, userId: architectId } },
    update: {},
    create: { worldId: world.id, userId: architectId }
  });

  if (Array.isArray(characterCreatorIds) && characterCreatorIds.length > 0) {
    await prisma.worldCharacterCreator.createMany({
      data: characterCreatorIds.map((userId) => ({ worldId: world.id, userId })),
      skipDuplicates: true
    });
  }

  res.status(201).json(world);
});

app.get("/api/worlds/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const isArchitect = await isWorldArchitect(user.id, id);
  const canRead =
    isAdmin(user) ||
    isArchitect ||
    (await prisma.worldCampaignCreator.findFirst({
      where: { worldId: id, userId: user.id }
    })) ||
    (await prisma.worldCharacterCreator.findFirst({
      where: { worldId: id, userId: user.id }
    }));

  if (!canRead) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const world = await prisma.world.findUnique({
    where: { id },
    include: { characterCreators: true }
  });
  if (!world) {
    res.status(404).json({ error: "World not found." });
    return;
  }

  res.json({
    ...world,
    characterCreatorIds: world.characterCreators.map((entry) => entry.userId)
  });
});

app.put("/api/worlds/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const isArchitect = await isWorldArchitect(user.id, id);

  if (!isAdmin(user) && !isArchitect) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const { name, description, dmLabelKey, themeKey, primaryArchitectId, characterCreatorIds } =
    req.body as {
    name?: string;
    description?: string;
    dmLabelKey?: string;
    themeKey?: string;
    primaryArchitectId?: string;
    characterCreatorIds?: string[];
  };

  if (primaryArchitectId && !isAdmin(user)) {
    res.status(403).json({ error: "Only admins can change the primary architect." });
    return;
  }

  const world = await prisma.world.update({
    where: { id },
    data: { name, description, dmLabelKey, themeKey, primaryArchitectId }
  });

  if (primaryArchitectId) {
    await prisma.worldArchitect.upsert({
      where: { worldId_userId: { worldId: world.id, userId: primaryArchitectId } },
      update: {},
      create: { worldId: world.id, userId: primaryArchitectId }
    });
  }

  if (Array.isArray(characterCreatorIds)) {
    await prisma.worldCharacterCreator.deleteMany({ where: { worldId: id } });
    if (characterCreatorIds.length > 0) {
      await prisma.worldCharacterCreator.createMany({
        data: characterCreatorIds.map((userId) => ({ worldId: id, userId })),
        skipDuplicates: true
      });
    }
  }

  res.json(world);
});

app.delete("/api/worlds/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const isArchitect = await isWorldArchitect(user.id, id);
  if (!isAdmin(user) && !isArchitect) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  await prisma.world.delete({ where: { id } });
  res.json({ ok: true });
});

app.post("/api/worlds/:id/architects", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    res.status(400).json({ error: "userId is required." });
    return;
  }

  const isArchitect = await isWorldArchitect(user.id, id);
  if (!isAdmin(user) && !isArchitect) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const architect = await prisma.worldArchitect.upsert({
    where: { worldId_userId: { worldId: id, userId } },
    update: {},
    create: { worldId: id, userId }
  });

  res.status(201).json(architect);
});

app.delete("/api/worlds/:id/architects/:userId", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id, userId } = req.params;
  const isArchitect = await isWorldArchitect(user.id, id);
  if (!isAdmin(user) && !isArchitect) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const world = await prisma.world.findUnique({
    where: { id },
    select: { primaryArchitectId: true }
  });

  if (world?.primaryArchitectId === userId) {
    res.status(400).json({ error: "Cannot remove the primary architect." });
    return;
  }

  await prisma.worldArchitect.delete({
    where: { worldId_userId: { worldId: id, userId } }
  });

  res.json({ ok: true });
});

app.post("/api/worlds/:id/campaign-creators", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    res.status(400).json({ error: "userId is required." });
    return;
  }

  const isArchitect = await isWorldArchitect(user.id, id);
  if (!isAdmin(user) && !isArchitect) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const creator = await prisma.worldCampaignCreator.upsert({
    where: { worldId_userId: { worldId: id, userId } },
    update: {},
    create: { worldId: id, userId }
  });

  res.status(201).json(creator);
});

app.delete("/api/worlds/:id/campaign-creators/:userId", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id, userId } = req.params;
  const isArchitect = await isWorldArchitect(user.id, id);
  if (!isAdmin(user) && !isArchitect) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  await prisma.worldCampaignCreator.delete({
    where: { worldId_userId: { worldId: id, userId } }
  });

  res.json({ ok: true });
});

app.post("/api/worlds/:id/character-creators", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    res.status(400).json({ error: "userId is required." });
    return;
  }

  const isArchitect = await isWorldArchitect(user.id, id);
  if (!isAdmin(user) && !isArchitect) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const creator = await prisma.worldCharacterCreator.upsert({
    where: { worldId_userId: { worldId: id, userId } },
    update: {},
    create: { worldId: id, userId }
  });

  res.status(201).json(creator);
});

app.delete("/api/worlds/:id/character-creators/:userId", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id, userId } = req.params;
  const isArchitect = await isWorldArchitect(user.id, id);
  if (!isAdmin(user) && !isArchitect) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  await prisma.worldCharacterCreator.delete({
    where: { worldId_userId: { worldId: id, userId } }
  });

  res.json({ ok: true });
});

app.get("/api/campaigns", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;

  const whereClause = isAdmin(user)
    ? worldId
      ? { worldId }
      : {}
    : {
        AND: [
          worldId ? { worldId } : {},
          {
            OR: [
              { gmUserId: user.id },
              { createdById: user.id },
              { world: { primaryArchitectId: user.id } },
              { world: { architects: { some: { userId: user.id } } } }
            ]
          }
        ]
      };

  const campaigns = await prisma.campaign.findMany({
    where: whereClause,
    orderBy: { name: "asc" }
  });

  res.json(campaigns);
});

app.post("/api/campaigns", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { worldId, name, description, gmUserId, characterIds } = req.body as {
    worldId?: string;
    name?: string;
    description?: string;
    gmUserId?: string;
    characterIds?: string[];
  };

  if (!worldId || !name) {
    res.status(400).json({ error: "worldId and name are required." });
    return;
  }

  if (!isAdmin(user)) {
    const allowed = await canCreateCampaign(user.id, worldId);
    if (!allowed) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  }

  const allowCustomGm = isAdmin(user) || (await isWorldArchitect(user.id, worldId));
  if (gmUserId && !allowCustomGm) {
    res.status(403).json({ error: "Only admins or world architects can set the GM." });
    return;
  }

  const campaign = await prisma.campaign.create({
    data: {
      name,
      description,
      worldId,
      ownerId: user.id,
      createdById: user.id,
      gmUserId: gmUserId ?? user.id
    }
  });

  if (Array.isArray(characterIds) && characterIds.length > 0) {
    const characters = await prisma.character.findMany({
      where: { id: { in: characterIds } },
      select: { id: true, worldId: true }
    });

    const validIds = characters.filter((character) => character.worldId === worldId).map((c) => c.id);
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

  res.status(201).json(campaign);
});

app.get("/api/campaigns/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { world: { include: { architects: true } }, roster: true }
  });

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found." });
    return;
  }

  const canAccess =
    isAdmin(user) ||
    campaign.gmUserId === user.id ||
    campaign.createdById === user.id ||
    campaign.world.primaryArchitectId === user.id ||
    campaign.world.architects.some((architect) => architect.userId === user.id);

  if (!canAccess) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  res.json({
    ...campaign,
    characterIds: campaign.roster.map((entry) => entry.characterId)
  });
});

app.put("/api/campaigns/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { worldId: true, gmUserId: true }
  });

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found." });
    return;
  }

  const canManage = isAdmin(user) || (await canManageCampaign(user.id, id));
  if (!canManage) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const { name, description, gmUserId, worldId, characterIds } = req.body as {
    name?: string;
    description?: string;
    gmUserId?: string;
    worldId?: string;
    characterIds?: string[];
  };

  if (worldId && worldId !== campaign.worldId) {
    res.status(400).json({ error: "Campaign world cannot be changed." });
    return;
  }

  if (gmUserId && gmUserId !== campaign.gmUserId) {
    const allowGmChange = isAdmin(user) || (await isWorldArchitect(user.id, campaign.worldId));
    if (!allowGmChange && campaign.gmUserId !== user.id) {
      res.status(403).json({ error: "Only admins, architects, or the current GM can change GM." });
      return;
    }
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: { name, description, gmUserId }
  });

  if (Array.isArray(characterIds)) {
    const characters = await prisma.character.findMany({
      where: { id: { in: characterIds } },
      select: { id: true, worldId: true }
    });
    const validIds = characters.filter((c) => c.worldId === campaign.worldId).map((c) => c.id);

    await prisma.characterCampaign.deleteMany({
      where: {
        campaignId: id,
        characterId: { notIn: validIds }
      }
    });

    if (validIds.length > 0) {
      await prisma.characterCampaign.createMany({
        data: validIds.map((characterId) => ({
          campaignId: id,
          characterId,
          status: "ACTIVE"
        })),
        skipDuplicates: true
      });
    }
  }

  res.json(updated);
});

app.delete("/api/campaigns/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const canManage = isAdmin(user) || (await canManageCampaign(user.id, id));
  if (!canManage) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  await prisma.campaign.delete({ where: { id } });
  res.json({ ok: true });
});

app.post("/api/campaigns/:id/character-creators", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const { userId } = req.body as { userId?: string };

  if (!userId) {
    res.status(400).json({ error: "userId is required." });
    return;
  }

  const canManage = isAdmin(user) || (await canManageCampaign(user.id, id));
  if (!canManage) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const creator = await prisma.campaignCharacterCreator.upsert({
    where: { campaignId_userId: { campaignId: id, userId } },
    update: {},
    create: { campaignId: id, userId }
  });

  res.status(201).json(creator);
});

app.delete("/api/campaigns/:id/character-creators/:userId", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id, userId } = req.params;
  const canManage = isAdmin(user) || (await canManageCampaign(user.id, id));
  if (!canManage) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  await prisma.campaignCharacterCreator.delete({
    where: { campaignId_userId: { campaignId: id, userId } }
  });

  res.json({ ok: true });
});

app.get("/api/characters", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;

  const whereClause = isAdmin(user)
    ? worldId
      ? { worldId }
      : {}
    : {
        AND: [
          worldId ? { worldId } : {},
          {
            OR: [
              { playerId: user.id },
              { world: { primaryArchitectId: user.id } },
              { world: { architects: { some: { userId: user.id } } } }
            ]
          }
        ]
      };

  const characters = await prisma.character.findMany({
    where: whereClause,
    orderBy: { name: "asc" }
  });

  res.json(characters);
});

app.post("/api/characters", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { worldId, name, description, statusKey, playerId, campaignId } = req.body as {
    worldId?: string;
    name?: string;
    description?: string;
    statusKey?: string;
    playerId?: string;
    campaignId?: string;
  };

  if (!worldId || !name) {
    res.status(400).json({ error: "worldId and name are required." });
    return;
  }

  if (campaignId) {
    const canCreate = isAdmin(user) || (await canCreateCharacterInCampaign(user.id, campaignId));
    if (!canCreate) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  } else {
    const canCreate = isAdmin(user) || (await canCreateCharacterInWorld(user.id, worldId));
    if (!canCreate) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  }

  if (campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { worldId: true }
    });

    if (!campaign || campaign.worldId !== worldId) {
      res.status(400).json({ error: "Campaign world mismatch." });
      return;
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

  res.status(201).json(character);
});

app.get("/api/characters/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const character = await prisma.character.findUnique({
    where: { id },
    include: { world: { include: { architects: true } } }
  });

  if (!character) {
    res.status(404).json({ error: "Character not found." });
    return;
  }

  const canAccess =
    isAdmin(user) ||
    character.playerId === user.id ||
    character.world.primaryArchitectId === user.id ||
    character.world.architects.some((architect) => architect.userId === user.id);

  if (!canAccess) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  res.json(character);
});

app.put("/api/characters/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const character = await prisma.character.findUnique({
    where: { id },
    select: { playerId: true, worldId: true }
  });

  if (!character) {
    res.status(404).json({ error: "Character not found." });
    return;
  }

  const isArchitect = await isWorldArchitect(user.id, character.worldId);
  if (!isAdmin(user) && !isArchitect && character.playerId !== user.id) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const { name, description, statusKey, worldId, playerId } = req.body as {
    name?: string;
    description?: string;
    statusKey?: string;
    worldId?: string;
    playerId?: string;
  };

  if (worldId && worldId !== character.worldId) {
    res.status(400).json({ error: "Character world cannot be changed." });
    return;
  }

  const updated = await prisma.character.update({
    where: { id },
    data: {
      name,
      description,
      statusKey,
      playerId: isAdmin(user) && playerId ? playerId : undefined
    }
  });

  res.json(updated);
});

app.delete("/api/characters/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const character = await prisma.character.findUnique({
    where: { id },
    select: { playerId: true, worldId: true }
  });

  if (!character) {
    res.status(404).json({ error: "Character not found." });
    return;
  }

  const isArchitect = await isWorldArchitect(user.id, character.worldId);
  if (!isAdmin(user) && !isArchitect && character.playerId !== user.id) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  await prisma.character.delete({ where: { id } });
  res.json({ ok: true });
});

app.post("/api/campaigns/:id/roster", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const { characterId, status } = req.body as { characterId?: string; status?: string };

  if (!characterId) {
    res.status(400).json({ error: "characterId is required." });
    return;
  }

  const canManage = isAdmin(user) || (await canManageCampaign(user.id, id));
  if (!canManage) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { worldId: true }
  });
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { worldId: true }
  });

  if (!campaign || !character || campaign.worldId !== character.worldId) {
    res.status(400).json({ error: "World mismatch." });
    return;
  }

  const rosterEntry = await prisma.characterCampaign.upsert({
    where: { characterId_campaignId: { characterId, campaignId: id } },
    update: { status: status === "INACTIVE" ? "INACTIVE" : "ACTIVE" },
    create: {
      characterId,
      campaignId: id,
      status: status === "INACTIVE" ? "INACTIVE" : "ACTIVE"
    }
  });

  res.status(201).json(rosterEntry);
});

app.put("/api/campaigns/:id/roster/:characterId", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id, characterId } = req.params;
  const { status } = req.body as { status?: string };

  const canManage = isAdmin(user) || (await canManageCampaign(user.id, id));
  if (!canManage) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const rosterEntry = await prisma.characterCampaign.update({
    where: { characterId_campaignId: { characterId, campaignId: id } },
    data: { status: status === "INACTIVE" ? "INACTIVE" : "ACTIVE" }
  });

  res.json(rosterEntry);
});

app.delete("/api/campaigns/:id/roster/:characterId", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id, characterId } = req.params;
  const canManage = isAdmin(user) || (await canManageCampaign(user.id, id));
  if (!canManage) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  await prisma.characterCampaign.delete({
    where: { characterId_campaignId: { characterId, campaignId: id } }
  });

  res.json({ ok: true });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

export { app };

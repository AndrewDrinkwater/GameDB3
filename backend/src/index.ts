import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import {
  Prisma,
  PrismaClient,
  EntityAccessScope,
  EntityAccessType,
  EntityFieldType,
  EntityFormSectionLayout,
  NoteTagType,
  NoteVisibility,
  PropertyValueType,
  RelatedListFieldSource,
  Role,
  SystemFieldType,
  WorldEntityPermissionScope,
  SystemViewType,
  User
} from "@prisma/client";

dotenv.config();

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;
const prisma = new PrismaClient();
const tokenSecret = process.env.AUTH_SECRET ?? "ttrpg-dev-secret";
const accessTokenPropertyKey = "auth.access_token_ttl_minutes";
const refreshTokenPropertyKey = "auth.refresh_token_ttl_days";
const defaultAccessTokenMinutes = 30;
const defaultRefreshTokenDays = 30;

const toBase64Url = (value: string) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const getCookieValue = (req: express.Request, name: string) => {
  const header = req.header("cookie");
  if (!header) return null;
  const cookies = header.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.split("=");
    if (key === name) {
      return rest.join("=");
    }
  }
  return null;
};

const parsePropertyNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getSystemPropertyNumber = async (key: string, fallback: number) => {
  const property = await prisma.systemProperty.findUnique({ where: { key } });
  if (!property) return fallback;
  const parsed = parsePropertyNumber(property.value);
  return parsed ?? fallback;
};

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const createRefreshToken = () => randomBytes(48).toString("base64url");

const setRefreshCookie = (res: express.Response, token: string, maxAgeSeconds: number) => {
  res.cookie("ttrpg_refresh", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds * 1000,
    path: "/"
  });
};

const fromBase64Url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = padded.length % 4 === 0 ? 0 : 4 - (padded.length % 4);
  const normalized = `${padded}${"=".repeat(padLength)}`;
  return Buffer.from(normalized, "base64").toString("utf8");
};

const signToken = (payload: { userId: string; iat: number; exp: number }) => {
  const encoded = toBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", tokenSecret).update(encoded).digest("base64");
  const signatureUrl = signature.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encoded}.${signatureUrl}`;
};

const verifyToken = (token: string) => {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", tokenSecret).update(encoded).digest("base64");
  const expectedUrl = expected.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expectedUrl);
  if (sigBuffer.length !== expBuffer.length) return null;
  if (!timingSafeEqual(sigBuffer, expBuffer)) return null;
  try {
    const payload = JSON.parse(fromBase64Url(encoded)) as {
      userId: string;
      iat: number;
      exp: number;
    };
    if (!payload?.userId || !payload?.exp) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

type AuthRequest = express.Request & { user?: User };

type ListViewFilterRule = {
  fieldKey: string;
  operator: string;
  value?: unknown;
};

type ListViewFilterGroup = {
  logic?: "AND" | "OR";
  rules?: ListViewFilterRule[];
};

const normalizeListViewFilters = (input: unknown): { logic: "AND" | "OR"; rules: ListViewFilterRule[] } => {
  if (Array.isArray(input)) {
    return { logic: "AND", rules: input as ListViewFilterRule[] };
  }
  if (input && typeof input === "object") {
    const group = input as ListViewFilterGroup;
    return {
      logic: group.logic === "OR" ? "OR" : "AND",
      rules: Array.isArray(group.rules) ? group.rules : []
    };
  }
  return { logic: "AND", rules: [] };
};

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
  const payload = verifyToken(token);
  if (!payload?.userId) return null;
  return prisma.user.findUnique({ where: { id: payload.userId } });
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

type EntityFieldRecord = Prisma.EntityFieldGetPayload<{ include: { choices: true } }>;

type EntityFieldValueWrite = {
  entityId: string;
  fieldId: string;
  valueString?: string | null;
  valueText?: string | null;
  valueBoolean?: boolean | null;
  valueNumber?: number | null;
  valueJson?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
};

type EntityAccessEntry = {
  entityId: string;
  accessType: EntityAccessType;
  scopeType: EntityAccessScope;
  scopeId?: string | null;
};

const buildAccessSignature = (
  entries: Array<{
    accessType: EntityAccessType;
    scopeType: EntityAccessScope;
    scopeId?: string | null;
  }>
) =>
  entries
    .map((entry) => `${entry.accessType}:${entry.scopeType}:${entry.scopeId ?? ""}`)
    .sort()
    .join("|");

type ViewFieldSeed = {
  fieldKey: string;
  label: string;
  fieldType: SystemFieldType;
  listOrder: number;
  formOrder: number;
  required?: boolean;
  optionsListKey?: string;
  referenceEntityKey?: string;
  referenceScope?: string;
  allowMultiple?: boolean;
  readOnly?: boolean;
  listVisible?: boolean;
  formVisible?: boolean;
};

type ViewSeed = {
  key: string;
  title: string;
  entityKey: string;
  viewType: SystemViewType;
  endpoint: string;
  adminOnly: boolean;
  fields: ViewFieldSeed[];
};

type RelatedListFieldSeed = {
  fieldKey: string;
  label: string;
  source: RelatedListFieldSource;
  listOrder: number;
  width?: string;
};

type RelatedListSeed = {
  key: string;
  title: string;
  parentEntityKey: string;
  relatedEntityKey: string;
  joinEntityKey: string;
  parentFieldKey: string;
  relatedFieldKey: string;
  listOrder: number;
  adminOnly: boolean;
  fields: RelatedListFieldSeed[];
};

const relatedListSeeds: Record<string, RelatedListSeed> = {
  "world.character_creators": {
    key: "world.character_creators",
    title: "Character Creators",
    parentEntityKey: "worlds",
    relatedEntityKey: "users",
    joinEntityKey: "worldCharacterCreator",
    parentFieldKey: "worldId",
    relatedFieldKey: "userId",
    listOrder: 3,
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", source: RelatedListFieldSource.RELATED, listOrder: 1 },
      { fieldKey: "email", label: "Email", source: RelatedListFieldSource.RELATED, listOrder: 2 }
    ]
  },
  "entity_types.fields": {
    key: "entity_types.fields",
    title: "Fields",
    parentEntityKey: "entity_types",
    relatedEntityKey: "entity_fields",
    joinEntityKey: "entityField",
    parentFieldKey: "entityTypeId",
    relatedFieldKey: "id",
    listOrder: 1,
    adminOnly: false,
    fields: [
      { fieldKey: "fieldKey", label: "Key", source: RelatedListFieldSource.RELATED, listOrder: 1 },
      { fieldKey: "label", label: "Label", source: RelatedListFieldSource.RELATED, listOrder: 2 },
      { fieldKey: "fieldType", label: "Type", source: RelatedListFieldSource.RELATED, listOrder: 3 },
      { fieldKey: "required", label: "Required", source: RelatedListFieldSource.RELATED, listOrder: 4 }
    ]
  },
  "campaign.characters": {
    key: "campaign.characters",
    title: "Characters",
    parentEntityKey: "campaigns",
    relatedEntityKey: "characters",
    joinEntityKey: "characterCampaign",
    parentFieldKey: "campaignId",
    relatedFieldKey: "characterId",
    listOrder: 1,
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", source: RelatedListFieldSource.RELATED, listOrder: 1 },
      { fieldKey: "playerName", label: "Played By", source: RelatedListFieldSource.RELATED, listOrder: 2 }
    ]
  },
  "world.game_masters": {
    key: "world.game_masters",
    title: "Game Masters",
    parentEntityKey: "worlds",
    relatedEntityKey: "users",
    joinEntityKey: "worldGameMaster",
    parentFieldKey: "worldId",
    relatedFieldKey: "userId",
    listOrder: 4,
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", source: RelatedListFieldSource.RELATED, listOrder: 1 },
      { fieldKey: "email", label: "Email", source: RelatedListFieldSource.RELATED, listOrder: 2 }
    ]
  }
};

const entityViewSeeds: Record<string, ViewSeed> = {
  "entity_types.list": {
    key: "entity_types.list",
    title: "Entity Types",
    entityKey: "entity_types",
    viewType: SystemViewType.LIST,
    endpoint: "/api/entity-types",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      {
        fieldKey: "worldId",
        label: "World",
        fieldType: SystemFieldType.REFERENCE,
        listOrder: 2,
        formOrder: 2,
        referenceEntityKey: "worlds"
      },
      { fieldKey: "isTemplate", label: "Template", fieldType: SystemFieldType.BOOLEAN, listOrder: 3, formOrder: 3 }
    ]
  },
  "entity_types.form": {
    key: "entity_types.form",
    title: "Entity Type",
    entityKey: "entity_types",
    viewType: SystemViewType.FORM,
    endpoint: "/api/entity-types",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      {
        fieldKey: "worldId",
        label: "World",
        fieldType: SystemFieldType.REFERENCE,
        listOrder: 2,
        formOrder: 2,
        referenceEntityKey: "worlds"
      },
      { fieldKey: "isTemplate", label: "Template", fieldType: SystemFieldType.BOOLEAN, listOrder: 3, formOrder: 3 },
      {
        fieldKey: "sourceTypeId",
        label: "Copy From",
        fieldType: SystemFieldType.REFERENCE,
        listOrder: 4,
        formOrder: 4,
        referenceEntityKey: "entity_types",
        referenceScope: "entity_type_source"
      },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 5, formOrder: 5 }
    ]
  },
  "entity_fields.list": {
    key: "entity_fields.list",
    title: "Entity Fields",
    entityKey: "entity_fields",
    viewType: SystemViewType.LIST,
    endpoint: "/api/entity-fields",
    adminOnly: false,
    fields: [
      {
        fieldKey: "entityTypeId",
        label: "Entity Type",
        fieldType: SystemFieldType.REFERENCE,
        listOrder: 1,
        formOrder: 1,
        referenceEntityKey: "entity_types",
        referenceScope: "entity_type"
      },
      { fieldKey: "fieldKey", label: "Field Key", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "fieldType", label: "Type", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 4, optionsListKey: "entity_field_type" },
      { fieldKey: "required", label: "Required", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 }
    ]
  },
  "entity_fields.form": {
    key: "entity_fields.form",
    title: "Entity Field",
    entityKey: "entity_fields",
    viewType: SystemViewType.FORM,
    endpoint: "/api/entity-fields",
    adminOnly: false,
    fields: [
      {
        fieldKey: "entityTypeId",
        label: "Entity Type",
        fieldType: SystemFieldType.REFERENCE,
        listOrder: 1,
        formOrder: 1,
        required: true,
        referenceEntityKey: "entity_types",
        referenceScope: "entity_type"
      },
      { fieldKey: "fieldKey", label: "Field Key", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      {
        fieldKey: "fieldType",
        label: "Field Type",
        fieldType: SystemFieldType.SELECT,
        listOrder: 4,
        formOrder: 4,
        required: true,
        optionsListKey: "entity_field_type"
      },
      { fieldKey: "required", label: "Required", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 },
        {
          fieldKey: "referenceEntityTypeId",
          label: "Reference Entity Type",
          fieldType: SystemFieldType.REFERENCE,
          listOrder: 6,
          formOrder: 6,
          referenceEntityKey: "entity_types",
          referenceScope: "entity_type"
        },
      {
        fieldKey: "referenceLocationTypeKey",
        label: "Reference Location Type",
        fieldType: SystemFieldType.TEXT,
        listOrder: 7,
        formOrder: 7
      },
      { fieldKey: "conditions", label: "Visibility Conditions", fieldType: SystemFieldType.TEXTAREA, listOrder: 8, formOrder: 8 }
    ]
  },
  "entity_field_choices.list": {
    key: "entity_field_choices.list",
    title: "Entity Field Choices",
    entityKey: "entity_field_choices",
    viewType: SystemViewType.LIST,
    endpoint: "/api/entity-field-choices",
    adminOnly: false,
    fields: [
      { fieldKey: "entityFieldId", label: "Field", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, referenceEntityKey: "entity_fields" },
      { fieldKey: "value", label: "Value", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "pillColor", label: "Pill Colour", fieldType: SystemFieldType.TEXT, listOrder: 4, formOrder: 4 },
      { fieldKey: "textColor", label: "Text Colour", fieldType: SystemFieldType.TEXT, listOrder: 5, formOrder: 5 },
      { fieldKey: "sortOrder", label: "Sort", fieldType: SystemFieldType.NUMBER, listOrder: 6, formOrder: 6 }
    ]
  },
  "entity_field_choices.form": {
    key: "entity_field_choices.form",
    title: "Entity Field Choice",
    entityKey: "entity_field_choices",
    viewType: SystemViewType.FORM,
    endpoint: "/api/entity-field-choices",
    adminOnly: false,
    fields: [
      { fieldKey: "entityFieldId", label: "Field", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, required: true, referenceEntityKey: "entity_fields" },
      { fieldKey: "value", label: "Value", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      { fieldKey: "pillColor", label: "Pill Colour", fieldType: SystemFieldType.TEXT, listOrder: 4, formOrder: 4 },
      { fieldKey: "textColor", label: "Text Colour", fieldType: SystemFieldType.TEXT, listOrder: 5, formOrder: 5 },
      { fieldKey: "sortOrder", label: "Sort", fieldType: SystemFieldType.NUMBER, listOrder: 6, formOrder: 6 }
    ]
  },
  "entities.list": {
    key: "entities.list",
    title: "Entities",
    entityKey: "entities",
    viewType: SystemViewType.LIST,
    endpoint: "/api/entities",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "entityTypeId", label: "Type", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "entity_types" },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, referenceEntityKey: "worlds" }
    ]
  },
  "entities.form": {
    key: "entities.form",
    title: "Entity",
    entityKey: "entities",
    viewType: SystemViewType.FORM,
    endpoint: "/api/entities",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "worlds" },
      { fieldKey: "entityTypeId", label: "Type", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, required: true, referenceEntityKey: "entity_types", referenceScope: "entity_type" },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 4, formOrder: 4 }
    ]
  }
};

const ensureSeededView = async (key: string) => {
  const seed = entityViewSeeds[key];
  if (!seed) return null;

  const savedView = await prisma.systemView.upsert({
    where: { key: seed.key },
    update: {
      title: seed.title,
      entityKey: seed.entityKey,
      viewType: seed.viewType,
      endpoint: seed.endpoint,
      adminOnly: seed.adminOnly
    },
    create: {
      key: seed.key,
      title: seed.title,
      entityKey: seed.entityKey,
      viewType: seed.viewType,
      endpoint: seed.endpoint,
      adminOnly: seed.adminOnly
    }
  });

  for (const field of seed.fields) {
    await prisma.systemViewField.upsert({
      where: { viewId_fieldKey: { viewId: savedView.id, fieldKey: field.fieldKey } },
      update: {
        label: field.label,
        fieldType: field.fieldType,
        listOrder: field.listOrder,
        formOrder: field.formOrder,
        required: field.required ?? false,
        optionsListKey: field.optionsListKey,
        referenceEntityKey: field.referenceEntityKey ?? null,
        referenceScope: field.referenceScope ?? null,
        allowMultiple: field.allowMultiple ?? false,
        readOnly: field.readOnly ?? false,
        listVisible: field.listVisible ?? true,
        formVisible: field.formVisible ?? true
      },
      create: {
        viewId: savedView.id,
        fieldKey: field.fieldKey,
        label: field.label,
        fieldType: field.fieldType,
        listOrder: field.listOrder,
        formOrder: field.formOrder,
        required: field.required ?? false,
        optionsListKey: field.optionsListKey,
        referenceEntityKey: field.referenceEntityKey ?? null,
        referenceScope: field.referenceScope ?? null,
        allowMultiple: field.allowMultiple ?? false,
        readOnly: field.readOnly ?? false,
        listVisible: field.listVisible ?? true,
        formVisible: field.formVisible ?? true
      }
    });
  }

  return prisma.systemView.findUnique({
    where: { key: seed.key },
    include: { fields: true }
  });
};

const backfillSeededViews = async (keys: string[]) => {
  for (const key of keys) {
    try {
      await ensureSeededView(key);
    } catch (error) {
      console.warn(`Failed to backfill view ${key}.`, error);
    }
  }
};

const ensureSeededRelatedList = async (key: string) => {
  const seed = relatedListSeeds[key];
  if (!seed) return null;

  const saved = await prisma.systemRelatedList.upsert({
    where: { key: seed.key },
    update: {
      title: seed.title,
      parentEntityKey: seed.parentEntityKey,
      relatedEntityKey: seed.relatedEntityKey,
      joinEntityKey: seed.joinEntityKey,
      parentFieldKey: seed.parentFieldKey,
      relatedFieldKey: seed.relatedFieldKey,
      listOrder: seed.listOrder,
      adminOnly: seed.adminOnly
    },
    create: {
      key: seed.key,
      title: seed.title,
      parentEntityKey: seed.parentEntityKey,
      relatedEntityKey: seed.relatedEntityKey,
      joinEntityKey: seed.joinEntityKey,
      parentFieldKey: seed.parentFieldKey,
      relatedFieldKey: seed.relatedFieldKey,
      listOrder: seed.listOrder,
      adminOnly: seed.adminOnly
    }
  });

  for (const field of seed.fields) {
    await prisma.systemRelatedListField.upsert({
      where: {
        relatedListId_fieldKey_source: {
          relatedListId: saved.id,
          fieldKey: field.fieldKey,
          source: field.source
        }
      },
      update: {
        label: field.label,
        listOrder: field.listOrder,
        width: field.width ?? null
      },
      create: {
        relatedListId: saved.id,
        fieldKey: field.fieldKey,
        label: field.label,
        source: field.source,
        listOrder: field.listOrder,
        width: field.width ?? null
      }
    });
  }

  return prisma.systemRelatedList.findUnique({
    where: { key: seed.key },
    include: { fields: true }
  });
};

const canAccessEntityType = async (userId: string, entityTypeId: string) => {
  const entityType = await prisma.entityType.findUnique({
    where: { id: entityTypeId },
    select: { worldId: true, isTemplate: true }
  });
  if (!entityType) return false;
  if (entityType.isTemplate) return true;
  if (!entityType.worldId) return false;
  return canAccessWorld(userId, entityType.worldId);
};

const canManageEntityType = async (userId: string, entityTypeId: string) => {
  const entityType = await prisma.entityType.findUnique({
    where: { id: entityTypeId },
    select: { worldId: true, isTemplate: true }
  });
  if (!entityType) return false;
  if (entityType.isTemplate) return false;
  if (!entityType.worldId) return false;
  return isWorldArchitect(userId, entityType.worldId);
};

const buildEntityAccessFilter = async (
  user: User,
  worldId: string,
  campaignId?: string,
  characterId?: string
): Promise<Prisma.EntityWhereInput> => {
  const isArchitect = await isWorldArchitect(user.id, worldId);
  if (isArchitect && !characterId) {
    return { worldId };
  }

  const accessFilters: Prisma.EntityWhereInput[] = [
    { access: { some: { accessType: EntityAccessType.READ, scopeType: EntityAccessScope.GLOBAL } } }
  ];

  if (campaignId) {
    accessFilters.push({
      access: {
        some: {
          accessType: EntityAccessType.READ,
          scopeType: EntityAccessScope.CAMPAIGN,
          scopeId: campaignId
        }
      }
    });
  }

  if (characterId) {
    accessFilters.push({
      access: {
        some: {
          accessType: EntityAccessType.READ,
          scopeType: EntityAccessScope.CHARACTER,
          scopeId: characterId
        }
      }
    });
  }

  return { worldId, OR: accessFilters };
};

const noteTagPattern = /@\[(.+?)\]\((entity|location):([^)]+)\)/g;

const extractNoteTags = (body: string) => {
  noteTagPattern.lastIndex = 0;
  const tags: Array<{ tagType: NoteTagType; targetId: string; label: string }> = [];
  if (!body) return tags;
  let match: RegExpExecArray | null = null;
  while ((match = noteTagPattern.exec(body))) {
    const [, label, rawType, targetId] = match;
    if (!label || !targetId) continue;
    const tagType = rawType === "location" ? NoteTagType.LOCATION : NoteTagType.ENTITY;
    tags.push({ tagType, targetId, label });
  }
  return tags;
};

const getAccessibleEntity = async (
  user: User,
  entityId: string,
  campaignId?: string,
  characterId?: string
) => {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { id: true, worldId: true, name: true }
  });
  if (!entity) return null;
  const accessFilter = await buildEntityAccessFilter(
    user,
    entity.worldId,
    campaignId,
    characterId
  );
  const access = await prisma.entity.findFirst({
    where: { id: entityId, ...accessFilter },
    select: { id: true }
  });
  return access ? entity : null;
};

const logSystemAudit = async (
  tx: Prisma.TransactionClient,
  payload: {
    entityKey: string;
    entityId: string;
    action: string;
    actorId: string;
    details?: Prisma.InputJsonValue;
  }
) => {
  await tx.systemAudit.create({ data: payload });
};

const normalizeEntityValue = (
  fieldType: EntityFieldType,
  rawValue: unknown
): string | boolean | null => {
  if (
    fieldType === EntityFieldType.TEXT ||
    fieldType === EntityFieldType.TEXTAREA ||
    fieldType === EntityFieldType.CHOICE ||
    fieldType === EntityFieldType.ENTITY_REFERENCE ||
    fieldType === EntityFieldType.LOCATION_REFERENCE
  ) {
    return rawValue ? String(rawValue) : null;
  }
  if (fieldType === EntityFieldType.BOOLEAN) {
    return Boolean(rawValue);
  }
  return rawValue ? String(rawValue) : null;
};

const getStoredEntityValue = (value: {
  valueString: string | null;
  valueText: string | null;
  valueBoolean: boolean | null;
  valueNumber: number | null;
  valueJson: Prisma.JsonValue;
}): string | boolean | null => {
  if (value.valueString !== null && value.valueString !== undefined) {
    return value.valueString;
  }
  if (value.valueText !== null && value.valueText !== undefined) {
    return value.valueText;
  }
  if (value.valueBoolean !== null && value.valueBoolean !== undefined) {
    return value.valueBoolean;
  }
  if (value.valueNumber !== null && value.valueNumber !== undefined) {
    return String(value.valueNumber);
  }
  if (value.valueJson !== null && value.valueJson !== undefined) {
    return JSON.stringify(value.valueJson);
  }
  return null;
};

const canWriteEntity = async (
  user: User,
  entityId: string,
  campaignId?: string,
  characterId?: string
) => {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { worldId: true }
  });
  if (!entity) return false;
  if (await isWorldArchitect(user.id, entity.worldId)) return true;

  const accessFilters: Prisma.EntityAccessWhereInput[] = [
    {
      entityId,
      accessType: EntityAccessType.WRITE,
      scopeType: EntityAccessScope.GLOBAL
    }
  ];

  if (campaignId) {
    accessFilters.push({
      entityId,
      accessType: EntityAccessType.WRITE,
      scopeType: EntityAccessScope.CAMPAIGN,
      scopeId: campaignId
    });
  }

  if (characterId) {
    accessFilters.push({
      entityId,
      accessType: EntityAccessType.WRITE,
      scopeType: EntityAccessScope.CHARACTER,
      scopeId: characterId
    });
  }

  const access = await prisma.entityAccess.findFirst({
    where: { OR: accessFilters }
  });

  return Boolean(access);
};

const getLabelFieldForEntity = async (entityKey: string) => {
  const defaults: Record<string, string> = {
    entity_fields: "label",
    entity_field_choices: "label",
    entity_types: "name",
    entities: "name"
  };
  const allowed: Record<string, string[]> = {
    entity_fields: ["label", "fieldKey"],
    entity_field_choices: ["label", "value"],
    entity_types: ["name"],
    entities: ["name"]
  };

  const entry = await prisma.systemDictionary.findFirst({
    where: { entityKey, isLabel: true },
    select: { fieldKey: true }
  });
  if (entry?.fieldKey && allowed[entityKey]) {
    if (allowed[entityKey].includes(entry.fieldKey)) {
      return entry.fieldKey;
    }
  }
  return defaults[entityKey] ?? entry?.fieldKey ?? "name";
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

  if (entityKey === "entity_types") {
    const whereClause: Prisma.EntityTypeWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const types = await prisma.entityType.findMany({
      where: whereClause,
      select: select as { id: true },
      orderBy: { name: "asc" },
      take: 25
    });

    return types.map((entityType) => {
      const labelValue = (entityType as Record<string, unknown>)[labelField];
      return {
        id: entityType.id,
        label: labelValue ? String(labelValue) : entityType.id
      };
    });
  }

  if (entityKey === "entities") {
    const whereClause: Prisma.EntityWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const entities = await prisma.entity.findMany({
      where: whereClause,
      select: select as { id: true },
      orderBy: { name: "asc" },
      take: 25
    });

    return entities.map((entity) => {
      const labelValue = (entity as Record<string, unknown>)[labelField];
      return {
        id: entity.id,
        label: labelValue ? String(labelValue) : entity.id
      };
    });
  }

  if (entityKey === "entity_fields") {
    const whereClause: Prisma.EntityFieldWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { label: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const fields = await prisma.entityField.findMany({
      where: whereClause,
      select: select as { id: true },
      orderBy: { label: "asc" },
      take: 25
    });

    return fields.map((field) => {
      const labelValue = (field as Record<string, unknown>)[labelField];
      return {
        id: field.id,
        label: labelValue ? String(labelValue) : field.id
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

    const accessMinutes = await getSystemPropertyNumber(
      accessTokenPropertyKey,
      defaultAccessTokenMinutes
    );
    const refreshDays = await getSystemPropertyNumber(
      refreshTokenPropertyKey,
      defaultRefreshTokenDays
    );
    const nowSeconds = Math.floor(Date.now() / 1000);
    const accessToken = signToken({
      userId: user.id,
      iat: nowSeconds,
      exp: nowSeconds + Math.max(1, Math.floor(accessMinutes * 60))
    });

    const refreshToken = createRefreshToken();
    const refreshTtlSeconds = Math.max(1, Math.floor(refreshDays * 24 * 60 * 60));
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000)
      }
    });
    setRefreshCookie(res, refreshToken, refreshTtlSeconds);

    res.json({
      token: accessToken,
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

  const payload = verifyToken(token);
  if (!payload?.userId) {
    res.status(401).json({ error: "Invalid token." });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
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
  const refreshToken = getCookieValue(req, "ttrpg_refresh");
  if (refreshToken) {
    prisma.refreshToken
      .updateMany({
        where: { tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() }
      })
      .catch(() => undefined);
  }
  res.clearCookie("ttrpg_refresh", { path: "/" });
  res.json({ ok: true });
});

app.post("/api/auth/refresh", async (req, res) => {
  const refreshToken = getCookieValue(req, "ttrpg_refresh");
  if (!refreshToken) {
    res.status(401).json({ error: "Missing refresh token." });
    return;
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) }
  });
  if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
    res.status(401).json({ error: "Invalid refresh token." });
    return;
  }

  const accessMinutes = await getSystemPropertyNumber(
    accessTokenPropertyKey,
    defaultAccessTokenMinutes
  );
  const refreshDays = await getSystemPropertyNumber(
    refreshTokenPropertyKey,
    defaultRefreshTokenDays
  );
  const nowSeconds = Math.floor(Date.now() / 1000);
  const accessToken = signToken({
    userId: stored.userId,
    iat: nowSeconds,
    exp: nowSeconds + Math.max(1, Math.floor(accessMinutes * 60))
  });

  const nextRefreshToken = createRefreshToken();
  const refreshTtlSeconds = Math.max(1, Math.floor(refreshDays * 24 * 60 * 60));
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() }
  });
  await prisma.refreshToken.create({
    data: {
      userId: stored.userId,
      tokenHash: hashToken(nextRefreshToken),
      expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000)
    }
  });
  setRefreshCookie(res, nextRefreshToken, refreshTtlSeconds);

  res.json({ token: accessToken });
});

app.get("/api/choices", requireAuth, async (req, res) => {
  const listKey = typeof req.query.listKey === "string" ? req.query.listKey : undefined;
  if (!listKey) {
    res.status(400).json({ error: "listKey is required." });
    return;
  }

  let choices = await prisma.systemChoice.findMany({
    where: { listKey, isActive: true },
    orderBy: { sortOrder: "asc" }
  });

  if (choices.length === 0) {
    const defaults: Record<
      string,
      Array<{ value: string; label: string; sortOrder: number }>
    > = {
      entity_field_type: [
        { value: "TEXT", label: "Single line text", sortOrder: 1 },
        { value: "TEXTAREA", label: "Multi line text", sortOrder: 2 },
        { value: "BOOLEAN", label: "Boolean", sortOrder: 3 },
        { value: "CHOICE", label: "Choice", sortOrder: 4 },
        { value: "ENTITY_REFERENCE", label: "Reference (Entity)", sortOrder: 5 },
        { value: "LOCATION_REFERENCE", label: "Reference (Location)", sortOrder: 6 }
      ],
      world_entity_permission: [
        { value: "ARCHITECT", label: "Architects only", sortOrder: 1 },
        { value: "ARCHITECT_GM", label: "Architects and GMs", sortOrder: 2 },
        { value: "ARCHITECT_GM_PLAYER", label: "Architects, GMs, and Players", sortOrder: 3 }
      ]
    };

    const seed = defaults[listKey];
    if (seed) {
      await prisma.systemChoice.createMany({
        data: seed.map((entry) => ({
          listKey,
          value: entry.value,
          label: entry.label,
          sortOrder: entry.sortOrder,
          isActive: true
        })),
        skipDuplicates: true
      });
      choices = await prisma.systemChoice.findMany({
        where: { listKey, isActive: true },
        orderBy: { sortOrder: "asc" }
      });
    }
  }

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
    const seeded = await ensureSeededView(req.params.key);
    if (!seeded) {
      res.status(404).json({ error: "View not found." });
      return;
    }
    if (seeded.adminOnly && !isAdmin(user)) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    res.json(seeded);
    return;
  }

  if (view.adminOnly && !isAdmin(user)) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  if (view.entityKey === "campaigns") {
    const fields = view.fields.map((field) => {
      if (field.fieldKey === "gmUserId" && !field.referenceScope) {
        return { ...field, referenceScope: "world_gm" };
      }
      return field;
    });
    res.json({ ...view, fields });
    return;
  }

  res.json(view);
});

app.get("/api/list-view-preferences", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const viewKey = typeof req.query.viewKey === "string" ? req.query.viewKey : undefined;
  const entityTypeId =
    typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : null;

  if (!viewKey) {
    res.status(400).json({ error: "viewKey is required." });
    return;
  }

  const preference = await prisma.userListViewPreference.findFirst({
    where: { userId: user.id, viewKey, entityTypeId }
  });

  const defaults = entityTypeId
    ? await prisma.entityTypeListViewDefault.findUnique({
        where: { entityTypeId }
      })
    : null;

  res.json({
    user: preference,
    defaults
  });
});

app.put("/api/list-view-preferences", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const viewKey = typeof req.query.viewKey === "string" ? req.query.viewKey : undefined;
  const entityTypeId =
    typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : null;

  if (!viewKey) {
    res.status(400).json({ error: "viewKey is required." });
    return;
  }

  const { columns, filters } = req.body as {
    columns?: string[];
    filters?: ListViewFilterRule[] | ListViewFilterGroup;
  };

  const columnsJson = columns ? (columns as Prisma.InputJsonValue) : undefined;
  const filtersJson = filters ? (filters as Prisma.InputJsonValue) : undefined;

  let preference;
  if (entityTypeId) {
    preference = await prisma.userListViewPreference.upsert({
      where: { userId_viewKey_entityTypeId: { userId: user.id, viewKey, entityTypeId } },
      update: {
        columnsJson,
        filtersJson
      },
      create: {
        userId: user.id,
        viewKey,
        entityTypeId,
        columnsJson,
        filtersJson
      }
    });
  } else {
    const existing = await prisma.userListViewPreference.findFirst({
      where: { userId: user.id, viewKey, entityTypeId: null }
    });

    preference = existing
      ? await prisma.userListViewPreference.update({
          where: { id: existing.id },
          data: { columnsJson, filtersJson }
        })
      : await prisma.userListViewPreference.create({
          data: { userId: user.id, viewKey, entityTypeId: null, columnsJson, filtersJson }
        });
  }

  res.json(preference);
});

app.delete("/api/list-view-preferences", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const viewKey = typeof req.query.viewKey === "string" ? req.query.viewKey : undefined;
  const entityTypeId =
    typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : null;

  if (!viewKey) {
    res.status(400).json({ error: "viewKey is required." });
    return;
  }

  await prisma.userListViewPreference.deleteMany({
    where: { userId: user.id, viewKey, entityTypeId }
  });

  res.json({ ok: true });
});

app.get("/api/entity-type-list-defaults", requireAuth, requireSystemAdmin, async (req, res) => {
  const entityTypeId =
    typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : undefined;
  if (!entityTypeId) {
    res.status(400).json({ error: "entityTypeId is required." });
    return;
  }

  const defaults = await prisma.entityTypeListViewDefault.findUnique({
    where: { entityTypeId }
  });

  res.json(defaults);
});

app.put("/api/entity-type-list-defaults", requireAuth, requireSystemAdmin, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const entityTypeId =
    typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : undefined;
  if (!entityTypeId) {
    res.status(400).json({ error: "entityTypeId is required." });
    return;
  }

  const { columns, filters } = req.body as {
    columns?: string[];
    filters?: ListViewFilterRule[] | ListViewFilterGroup;
  };

  const columnsJson = columns ? (columns as Prisma.InputJsonValue) : undefined;
  const filtersJson = filters ? (filters as Prisma.InputJsonValue) : undefined;

  const defaults = await prisma.entityTypeListViewDefault.upsert({
    where: { entityTypeId },
    update: {
      columnsJson,
      filtersJson,
      updatedById: user.id
    },
    create: {
      entityTypeId,
      columnsJson,
      filtersJson,
      updatedById: user.id
    }
  });

  res.json(defaults);
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

  if (entityKey === "worlds") {
    await ensureSeededRelatedList("world.game_masters");
    await ensureSeededRelatedList("world.character_creators");
  }
  if (entityKey === "campaigns") {
    await ensureSeededRelatedList("campaign.characters");
  }
  if (entityKey === "entity_types") {
    await ensureSeededRelatedList("entity_types.fields");
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

  let relatedList = await prisma.systemRelatedList.findUnique({
    where: { key },
    include: { fields: { orderBy: { listOrder: "asc" } } }
  });
  if (!relatedList && relatedListSeeds[key]) {
    relatedList = await ensureSeededRelatedList(key);
  }

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

  if (relatedList.parentEntityKey === "entity_types") {
    const canAccess = isAdmin(user) || (await canAccessEntityType(user.id, parentId));
    if (!canAccess) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  }

  const relatedFields = relatedList.fields.filter((field) => field.source === "RELATED");
  const relatedSelect: Record<string, boolean> = { id: true };
  relatedFields.forEach((field) => {
    if (field.fieldKey === "playerName") return;
    relatedSelect[field.fieldKey] = true;
  });

  let items: Array<{
    relatedId: string;
    relatedData: Record<string, unknown>;
    joinData: Record<string, unknown>;
  }> = [];

  if (relatedList.joinEntityKey === "characterCampaign") {
    const includePlayer = relatedFields.some((field) => field.fieldKey === "playerName");
    const rows = await prisma.characterCampaign.findMany({
      where: { campaignId: parentId },
      include: {
        character: {
          select: {
            ...(relatedSelect as Record<string, true>),
            ...(includePlayer ? { player: { select: { name: true, email: true } } } : {})
          }
        }
      }
    });

    items = rows.map((row) => ({
      relatedId: row.characterId,
      relatedData: {
        ...(row.character as Record<string, unknown>),
        ...(includePlayer
          ? {
              playerName:
                row.character.player?.name ??
                row.character.player?.email ??
                "-"
            }
          : {})
      },
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

  if (relatedList.joinEntityKey === "worldGameMaster") {
    const rows = await prisma.worldGameMaster.findMany({
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

  if (relatedList.joinEntityKey === "entityField") {
    const rows = await prisma.entityField.findMany({
      where: { entityTypeId: parentId },
      select: {
        ...(relatedSelect as Record<string, true>),
        id: true
      },
      orderBy: { listOrder: "asc" }
    });

    items = rows.map((row) => ({
      relatedId: row.id,
      relatedData: row as Record<string, unknown>,
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

  let relatedList = await prisma.systemRelatedList.findUnique({ where: { key } });
  if (!relatedList && relatedListSeeds[key]) {
    relatedList = await ensureSeededRelatedList(key);
  }
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

  if (relatedList.parentEntityKey === "entity_types") {
    const canManage = isAdmin(user) || (await canManageEntityType(user.id, parentId));
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

  if (relatedList.joinEntityKey === "worldGameMaster") {
    const canManage = isAdmin(user) || (await isWorldArchitect(user.id, parentId));
    if (!canManage) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const entry = await prisma.worldGameMaster.upsert({
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

  if (relatedList.joinEntityKey === "entityField") {
    res.status(400).json({ error: "Use /api/entity-fields to create fields." });
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

  let relatedList = await prisma.systemRelatedList.findUnique({ where: { key } });
  if (!relatedList && relatedListSeeds[key]) {
    relatedList = await ensureSeededRelatedList(key);
  }
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

  if (relatedList.parentEntityKey === "entity_types") {
    const canManage = isAdmin(user) || (await canManageEntityType(user.id, parentId));
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

  if (relatedList.joinEntityKey === "worldGameMaster") {
    const canManage = isAdmin(user) || (await isWorldArchitect(user.id, parentId));
    if (!canManage) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    await prisma.worldGameMaster.delete({
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

  if (relatedList.joinEntityKey === "entityField") {
    const existing = await prisma.entityField.findFirst({
      where: { id: relatedId, entityTypeId: parentId },
      select: { id: true }
    });
    if (!existing) {
      res.status(404).json({ error: "Field not found." });
      return;
    }
    await prisma.entityField.delete({ where: { id: relatedId } });
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
  const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
  const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
  const entityTypeId = typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : undefined;

  if (!entityKey) {
    res.status(400).json({ error: "entityKey is required." });
    return;
  }

  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }
  const ids = idsParam ? idsParam.split(",").map((id) => id.trim()).filter(Boolean) : undefined;
  const queryValue = query?.trim();

  if (entityKey === "campaigns") {
    const labelField = await getLabelFieldForEntity(entityKey);
    const baseClause: Prisma.CampaignWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const filters: Prisma.CampaignWhereInput[] = [baseClause];
    if (worldId) filters.push({ worldId });
    if (characterId) {
      filters.push({ roster: { some: { characterId } } });
    }

      if (user && !isAdmin(user)) {
        filters.push({
          OR: [
            { gmUserId: user.id },
            { createdById: user.id },
            { world: { primaryArchitectId: user.id } },
            { world: { architects: { some: { userId: user.id } } } },
            { roster: { some: { character: { playerId: user.id } } } }
          ]
        });
      }

    const whereClause: Prisma.CampaignWhereInput =
      filters.length > 1 ? { AND: filters } : baseClause;

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const campaigns = await prisma.campaign.findMany({
      where: whereClause,
      select: select as Record<string, true>,
      orderBy: { name: "asc" },
      take: 25
    });

    const results = campaigns.map((campaign) => {
      const labelValue = (campaign as Record<string, unknown>)[labelField];
      return {
        id: campaign.id,
        label: labelValue ? String(labelValue) : campaign.id
      };
    });

    res.json(results);
    return;
  }

    if (entityKey === "characters") {
      const labelField = await getLabelFieldForEntity(entityKey);
      const baseClause: Prisma.CharacterWhereInput = ids
        ? { id: { in: ids } }
        : queryValue
          ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
          : {};

      const campaign =
        campaignId
          ? await prisma.campaign.findUnique({
              where: { id: campaignId },
              select: { worldId: true, gmUserId: true }
            })
          : null;
      const isCampaignGm = Boolean(campaign && campaign.gmUserId === user.id);
      const isCampaignWorldArchitect =
        Boolean(campaign && (await isWorldArchitect(user.id, campaign.worldId)));
      const expandCampaignScope = Boolean(
        campaign && (isAdmin(user) || isCampaignGm || isCampaignWorldArchitect)
      );

      const filters: Prisma.CharacterWhereInput[] = [baseClause];
      if (expandCampaignScope && campaign) {
        filters.push({ worldId: campaign.worldId });
      } else {
        if (worldId) filters.push({ worldId });
        if (campaignId) {
          filters.push({ campaigns: { some: { campaignId } } });
        }
      }

      if (user && !isAdmin(user)) {
        const orFilters: Prisma.CharacterWhereInput[] = [
          { playerId: user.id },
          { world: { primaryArchitectId: user.id } },
          { world: { architects: { some: { userId: user.id } } } },
          { campaigns: { some: { campaign: { gmUserId: user.id } } } }
        ];
        if (isCampaignGm && campaign) {
          orFilters.push({ worldId: campaign.worldId });
        }
        filters.push({ OR: orFilters });
      }

    const whereClause: Prisma.CharacterWhereInput =
      filters.length > 1 ? { AND: filters } : baseClause;

    const characters = await prisma.character.findMany({
      where: whereClause,
      include: {
        player: { select: { name: true, email: true, id: true } },
        world: { select: { primaryArchitectId: true, architects: { select: { userId: true } } } },
        campaigns: { select: { campaign: { select: { gmUserId: true } } } }
      },
      orderBy: { name: "asc" },
      take: 25
    });

      const results = characters.map((character) => {
        const labelValue = (character as Record<string, unknown>)[labelField];
        const canSeeOwner =
          isAdmin(user) ||
          isCampaignGm ||
          character.world.primaryArchitectId === user.id ||
          character.world.architects.some((entry) => entry.userId === user.id) ||
          character.campaigns.some((entry) => entry.campaign.gmUserId === user.id);
      const ownerLabel = canSeeOwner
        ? character.player.name ?? character.player.email ?? character.player.id
        : undefined;
      return {
        id: character.id,
        label: labelValue ? String(labelValue) : character.id,
        ownerLabel
      };
    });

    res.json(results);
    return;
  }

  if (entityKey === "entity_fields") {
    const labelField = await getLabelFieldForEntity(entityKey);
    const baseClause: Prisma.EntityFieldWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { label: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const filters: Prisma.EntityFieldWhereInput[] = [baseClause];
    if (worldId) {
      if (!isAdmin(user) && !(await isWorldArchitect(user.id, worldId))) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
      filters.push({ entityType: { worldId } });
    } else if (!isAdmin(user) && !ids) {
      res.json([]);
      return;
    }

    const whereClause: Prisma.EntityFieldWhereInput =
      filters.length > 1 ? { AND: filters } : baseClause;

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const fields = await prisma.entityField.findMany({
      where: whereClause,
      select: select as Record<string, true>,
      orderBy: { label: "asc" },
      take: 25
    });

    const results = fields.map((field) => {
      const labelValue = (field as Record<string, unknown>)[labelField];
      return {
        id: field.id,
        label: labelValue ? String(labelValue) : field.id
      };
    });

    res.json(results);
    return;
  }

  if (entityKey === "entity_types") {
    const labelField = await getLabelFieldForEntity(entityKey);
    const baseClause: Prisma.EntityTypeWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const filters: Prisma.EntityTypeWhereInput[] = [baseClause];
    if (scope === "entity_type") {
      if (worldId) {
        filters.push({ worldId });
      } else if (!isAdmin(user)) {
        res.json([]);
        return;
      }
    }

    if (scope === "entity_type_source") {
      if (!isAdmin(user)) {
        filters.push({ isTemplate: true });
      }
    }

    if (!scope && !ids && !isAdmin(user)) {
      filters.push({
        OR: [
          { isTemplate: true },
          {
            world: {
              OR: [
                { primaryArchitectId: user.id },
                { architects: { some: { userId: user.id } } }
              ]
            }
          }
        ]
      });
    }

    const whereClause: Prisma.EntityTypeWhereInput =
      filters.length > 1 ? { AND: filters } : baseClause;

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const types = await prisma.entityType.findMany({
      where: whereClause,
      select: select as Record<string, true>,
      orderBy: { name: "asc" },
      take: 25
    });

    const results = types.map((entityType) => {
      const labelValue = (entityType as Record<string, unknown>)[labelField];
      return {
        id: entityType.id,
        label: labelValue ? String(labelValue) : entityType.id
      };
    });

    res.json(results);
    return;
  }

  if (entityKey === "entities") {
    const labelField = await getLabelFieldForEntity(entityKey);
    const baseClause: Prisma.EntityWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const filters: Prisma.EntityWhereInput[] = [baseClause];
    if (worldId) filters.push({ worldId });
    if (entityTypeId) filters.push({ entityTypeId });

      if (!isAdmin(user)) {
        if (!worldId) {
          res.json([]);
          return;
        }

        const canAccess = await canAccessWorld(user.id, worldId);
        if (!canAccess) {
          res.json([]);
          return;
        }

        const isArchitect = await isWorldArchitect(user.id, worldId);
        if (!isArchitect || characterId) {
          const accessFilters: Prisma.EntityWhereInput[] = [
            { access: { some: { accessType: EntityAccessType.READ, scopeType: EntityAccessScope.GLOBAL } } }
          ];
          if (campaignId) {
            accessFilters.push({
              access: { some: { accessType: EntityAccessType.READ, scopeType: EntityAccessScope.CAMPAIGN, scopeId: campaignId } }
            });
          }
          if (characterId) {
            accessFilters.push({
              access: { some: { accessType: EntityAccessType.READ, scopeType: EntityAccessScope.CHARACTER, scopeId: characterId } }
            });
          }

          filters.push({ OR: accessFilters });
        }
      }

    const whereClause: Prisma.EntityWhereInput = filters.length > 1 ? { AND: filters } : baseClause;
    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const entities = await prisma.entity.findMany({
      where: whereClause,
      select: select as Record<string, true>,
      orderBy: { name: "asc" },
      take: 25
    });

    const results = entities.map((entity) => {
      const labelValue = (entity as Record<string, unknown>)[labelField];
      return {
        id: entity.id,
        label: labelValue ? String(labelValue) : entity.id
      };
    });

    res.json(results);
    return;
  }

  let results = await getReferenceResults(entityKey, query, ids);

  if (entityKey === "users" && scope === "world_gm" && !ids) {
    if (!worldId) {
      res.json([]);
      return;
    }
    const canSeeAll = isAdmin(user) || (await isWorldArchitect(user.id, worldId));
    if (!canSeeAll) {
      const gmUsers = await prisma.worldGameMaster.findMany({
        where: { worldId },
        select: { userId: true }
      });
      const allowedIds = new Set(gmUsers.map((entry) => entry.userId));
      results = results.filter((item) => allowedIds.has(item.id));
    }
  }

  if (entityKey === "worlds") {
    if (user && !isAdmin(user) && !ids) {
      let whereClause = {
        OR: [
          { primaryArchitectId: user.id },
          { architects: { some: { userId: user.id } } },
          { gameMasters: { some: { userId: user.id } } },
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
            { gameMasters: { some: { userId: user.id } } },
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
    if (worldId) {
      results = results.filter((item) => item.id === worldId);
    }
  }
  res.json(results);
});

app.get("/api/context/summary", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
  const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;

  let worldRole: string | null = null;
  let campaignRole: string | null = null;
  let characterOwnerLabel: string | null = null;

  if (worldId) {
    const world = await prisma.world.findUnique({
      where: { id: worldId },
      select: {
        primaryArchitectId: true,
        architects: { select: { userId: true } }
      }
    });
    if (world) {
      const isArchitect =
        world.primaryArchitectId === user.id ||
        world.architects.some((entry) => entry.userId === user.id);
      worldRole = isArchitect ? "Architect" : "Member";
    }
  }

  if (campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { gmUserId: true }
    });
    if (campaign) {
      campaignRole = campaign.gmUserId === user.id ? "GM" : "Player";
    }
  }

  if (characterId) {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: {
        player: { select: { name: true, email: true, id: true } },
        world: { select: { primaryArchitectId: true, architects: { select: { userId: true } } } },
        campaigns: { select: { campaign: { select: { gmUserId: true } } } }
      }
    });
    if (character) {
      const canSeeOwner =
        isAdmin(user) ||
        character.world.primaryArchitectId === user.id ||
        character.world.architects.some((entry) => entry.userId === user.id) ||
        character.campaigns.some((entry) => entry.campaign.gmUserId === user.id);
      characterOwnerLabel = canSeeOwner
        ? character.player.name ?? character.player.email ?? character.player.id
        : null;
    }
  }

  res.json({ worldRole, campaignRole, characterOwnerLabel });
});

app.get("/api/permissions", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const entityKey = typeof req.query.entityKey === "string" ? req.query.entityKey : undefined;
  const recordId = typeof req.query.recordId === "string" ? req.query.recordId : undefined;
  const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
  const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
  const entityTypeId =
    typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : undefined;
  const entityFieldId =
    typeof req.query.entityFieldId === "string" ? req.query.entityFieldId : undefined;
  const isTemplate = req.query.isTemplate === "true";

  if (!entityKey) {
    res.status(400).json({ error: "entityKey is required." });
    return;
  }

  const admin = isAdmin(user);
  let canCreate = false;
  let canEdit = false;
  let canDelete = false;

  switch (entityKey) {
    case "worlds": {
      canCreate = true;
      if (recordId) {
        const isArchitect = await isWorldArchitect(user.id, recordId);
        canEdit = admin || isArchitect;
        canDelete = canEdit;
      }
      break;
    }
    case "campaigns": {
      if (worldId) {
        canCreate = admin || (await canCreateCampaign(user.id, worldId));
      }
      if (recordId) {
        const canManage = admin || (await canManageCampaign(user.id, recordId));
        canEdit = canManage;
        canDelete = canManage;
      }
      break;
    }
    case "characters": {
      if (campaignId) {
        canCreate = admin || (await canCreateCharacterInCampaign(user.id, campaignId));
      } else if (worldId) {
        canCreate = admin || (await canCreateCharacterInWorld(user.id, worldId));
      }
      if (recordId) {
        const character = await prisma.character.findUnique({
          where: { id: recordId },
          select: { playerId: true, worldId: true }
        });
        if (!character) {
          res.status(404).json({ error: "Character not found." });
          return;
        }
        const isArchitect = await isWorldArchitect(user.id, character.worldId);
        const canManage = admin || isArchitect || character.playerId === user.id;
        canEdit = canManage;
        canDelete = canManage;
      }
      break;
    }
    case "entity_types": {
      if (recordId) {
        const entityType = await prisma.entityType.findUnique({
          where: { id: recordId },
          select: { worldId: true, isTemplate: true }
        });
        if (!entityType) {
          res.status(404).json({ error: "Entity type not found." });
          return;
        }
        if (entityType.isTemplate) {
          canEdit = admin;
          canDelete = admin;
        } else if (entityType.worldId) {
          const isArchitect = await isWorldArchitect(user.id, entityType.worldId);
          canEdit = admin || isArchitect;
          canDelete = canEdit;
        }
      }
      if (isTemplate) {
        canCreate = admin;
      } else if (worldId) {
        canCreate = admin || (await isWorldArchitect(user.id, worldId));
      }
      break;
    }
    case "entity_fields": {
      let resolvedEntityTypeId = entityTypeId;
      if (recordId) {
        const field = await prisma.entityField.findUnique({
          where: { id: recordId },
          select: { entityTypeId: true }
        });
        if (!field) {
          res.status(404).json({ error: "Entity field not found." });
          return;
        }
        resolvedEntityTypeId = field.entityTypeId;
      }
      if (resolvedEntityTypeId) {
        const canManage = admin || (await canManageEntityType(user.id, resolvedEntityTypeId));
        canCreate = canManage;
        if (recordId) {
          canEdit = canManage;
          canDelete = canManage;
        }
      }
      break;
    }
    case "entity_field_choices": {
      let resolvedEntityFieldId = entityFieldId;
      if (recordId) {
        const choice = await prisma.entityFieldChoice.findUnique({
          where: { id: recordId },
          select: { entityFieldId: true }
        });
        if (!choice) {
          res.status(404).json({ error: "Choice not found." });
          return;
        }
        resolvedEntityFieldId = choice.entityFieldId;
      }
      if (resolvedEntityFieldId) {
        const field = await prisma.entityField.findUnique({
          where: { id: resolvedEntityFieldId },
          select: { entityTypeId: true }
        });
        if (!field) {
          res.status(404).json({ error: "Entity field not found." });
          return;
        }
        const canManage = admin || (await canManageEntityType(user.id, field.entityTypeId));
        canCreate = canManage;
        if (recordId) {
          canEdit = canManage;
          canDelete = canManage;
        }
      }
      break;
    }
    case "entities": {
      if (worldId) {
        canCreate = admin || (await canCreateEntityInWorld(user.id, worldId));
      }
      if (recordId) {
        const entity = await prisma.entity.findUnique({
          where: { id: recordId },
          select: { worldId: true }
        });
        if (!entity) {
          res.status(404).json({ error: "Entity not found." });
          return;
        }
        canEdit = admin || (await canWriteEntity(user, recordId, campaignId, characterId));
        const isArchitect = await isWorldArchitect(user.id, entity.worldId);
        const isGm =
          (await isWorldGameMaster(user.id, entity.worldId)) ||
          (await isWorldGm(user.id, entity.worldId));
        canDelete = admin || isArchitect || isGm;
      }
      break;
    }
    default: {
      canCreate = admin;
      canEdit = admin;
      canDelete = admin;
      break;
    }
  }

  res.json({ canCreate, canEdit, canDelete });
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

app.get("/api/system/properties/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  const property = await prisma.systemProperty.findUnique({ where: { id: req.params.id } });
  if (!property) {
    res.status(404).json({ error: "Property not found." });
    return;
  }
  res.json(property);
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
  const { listKey, value, label, sortOrder, isActive, pillColor, textColor } = req.body as {
    listKey?: string;
    value?: string;
    label?: string;
    sortOrder?: number;
    isActive?: boolean;
    pillColor?: string | null;
    textColor?: string | null;
  };

  if (!listKey || !value || !label) {
    res.status(400).json({ error: "listKey, value, and label are required." });
    return;
  }

  const choice = await prisma.systemChoice.create({
    data: { listKey, value, label, sortOrder, isActive, pillColor, textColor }
  });
  res.status(201).json(choice);
});

app.put("/api/system/choices/:id", requireAuth, requireSystemAdmin, async (req, res) => {
  const { id } = req.params;
  const { listKey, value, label, sortOrder, isActive, pillColor, textColor } = req.body as {
    listKey?: string;
    value?: string;
    label?: string;
    sortOrder?: number;
    isActive?: boolean;
    pillColor?: string | null;
    textColor?: string | null;
  };

  const choice = await prisma.systemChoice.update({
    where: { id },
    data: { listKey, value, label, sortOrder, isActive, pillColor, textColor }
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

  const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
  const accessClause: Prisma.WorldWhereInput = isAdmin(user)
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

  const whereClause: Prisma.WorldWhereInput = worldId
    ? { AND: [accessClause, { id: worldId }] }
    : accessClause;

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

  const {
    name,
    description,
    dmLabelKey,
    themeKey,
    primaryArchitectId,
    characterCreatorIds,
    entityPermissionScope
  } =
    req.body as {
    name?: string;
    description?: string;
    dmLabelKey?: string;
    themeKey?: string;
    primaryArchitectId?: string;
    characterCreatorIds?: string[];
    entityPermissionScope?: WorldEntityPermissionScope;
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
      primaryArchitectId: architectId,
      entityPermissionScope
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
    (await prisma.worldGameMaster.findFirst({
      where: { worldId: id, userId: user.id }
    })) ||
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

app.get("/api/worlds/:id/world-admin", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const allowed = isAdmin(user) || (await isWorldArchitect(user.id, id));
  res.json({ allowed });
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

  const {
    name,
    description,
    dmLabelKey,
    themeKey,
    primaryArchitectId,
    characterCreatorIds,
    entityPermissionScope
  } =
    req.body as {
    name?: string;
    description?: string;
    dmLabelKey?: string;
    themeKey?: string;
    primaryArchitectId?: string;
    characterCreatorIds?: string[];
    entityPermissionScope?: WorldEntityPermissionScope;
  };

  if (primaryArchitectId && !isAdmin(user)) {
    res.status(403).json({ error: "Only admins can change the primary architect." });
    return;
  }

  const world = await prisma.world.update({
    where: { id },
    data: { name, description, dmLabelKey, themeKey, primaryArchitectId, entityPermissionScope }
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

  await prisma.$transaction(async (tx) => {
    const campaignIds = (
      await tx.campaign.findMany({ where: { worldId: id }, select: { id: true } })
    ).map((campaign) => campaign.id);
    const characterIds = (
      await tx.character.findMany({ where: { worldId: id }, select: { id: true } })
    ).map((character) => character.id);
    const entityIds = (
      await tx.entity.findMany({ where: { worldId: id }, select: { id: true } })
    ).map((entity) => entity.id);
    const entityTypeIds = (
      await tx.entityType.findMany({ where: { worldId: id }, select: { id: true } })
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
      await tx.entityFieldChoice.deleteMany({
        where: { entityField: { entityTypeId: { in: entityTypeIds } } }
      });
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

    await tx.worldDelegate.deleteMany({ where: { worldId: id } });
    await tx.worldArchitect.deleteMany({ where: { worldId: id } });
    await tx.worldGameMaster.deleteMany({ where: { worldId: id } });
    await tx.worldCampaignCreator.deleteMany({ where: { worldId: id } });
    await tx.worldCharacterCreator.deleteMany({ where: { worldId: id } });
    await tx.world.delete({ where: { id } });
  });
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
  const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
  const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;

  const accessClause: Prisma.CampaignWhereInput = isAdmin(user)
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

  const filters: Prisma.CampaignWhereInput[] = [accessClause];
  if (worldId) filters.push({ worldId });
  if (campaignId) filters.push({ id: campaignId });
  if (characterId) filters.push({ roster: { some: { characterId } } });

  const whereClause: Prisma.CampaignWhereInput =
    filters.length > 1 ? { AND: filters } : accessClause;

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

  const isArchitect = await isWorldArchitect(user.id, worldId);
  const finalGmId = gmUserId ?? user.id;

  if (!isAdmin(user) && !isArchitect) {
    const gmEntry = await prisma.worldGameMaster.findFirst({
      where: { worldId, userId: finalGmId }
    });
    if (!gmEntry) {
      res.status(403).json({ error: "GM must be assigned to this world." });
      return;
    }
  }

  if (gmUserId && (isAdmin(user) || isArchitect)) {
    await prisma.worldGameMaster.upsert({
      where: { worldId_userId: { worldId, userId: finalGmId } },
      update: {},
      create: { worldId, userId: finalGmId }
    });
  } else if (!gmUserId && (isAdmin(user) || isArchitect)) {
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
    include: {
      world: { include: { architects: true } },
      roster: { include: { character: { select: { playerId: true } } } }
    }
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
    campaign.world.architects.some((architect) => architect.userId === user.id) ||
    campaign.roster.some((entry) => entry.character.playerId === user.id);

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
    const isArchitect = await isWorldArchitect(user.id, campaign.worldId);
    const isWorldGm = await isWorldGameMaster(user.id, campaign.worldId);
    const allowGmChange =
      isAdmin(user) || isArchitect || isWorldGm || campaign.gmUserId === user.id;
    if (!allowGmChange) {
      res.status(403).json({ error: "Only admins, architects, GMs, or the current GM can change GM." });
      return;
    }

    if (!isAdmin(user) && !isArchitect) {
      const gmEntry = await prisma.worldGameMaster.findFirst({
        where: { worldId: campaign.worldId, userId: gmUserId }
      });
      if (!gmEntry) {
        res.status(403).json({ error: "GM must be assigned to this world." });
        return;
      }
    } else {
      await prisma.worldGameMaster.upsert({
        where: { worldId_userId: { worldId: campaign.worldId, userId: gmUserId } },
        update: {},
        create: { worldId: campaign.worldId, userId: gmUserId }
      });
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
  const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;

  const accessClause: Prisma.CharacterWhereInput = isAdmin(user)
    ? {}
    : {
        OR: [
          { playerId: user.id },
          { world: { primaryArchitectId: user.id } },
          { world: { architects: { some: { userId: user.id } } } },
          { campaigns: { some: { campaign: { gmUserId: user.id } } } }
        ]
      };

  const filters: Prisma.CharacterWhereInput[] = [accessClause];
  if (worldId) filters.push({ worldId });
  if (campaignId) filters.push({ campaigns: { some: { campaignId } } });
  if (characterId) filters.push({ id: characterId });

  const whereClause: Prisma.CharacterWhereInput =
    filters.length > 1 ? { AND: filters } : accessClause;

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
    include: {
      world: { include: { architects: true } },
      campaigns: { include: { campaign: { select: { gmUserId: true } } } }
    }
  });

  if (!character) {
    res.status(404).json({ error: "Character not found." });
    return;
  }

  const canAccess =
    isAdmin(user) ||
    character.playerId === user.id ||
    character.world.primaryArchitectId === user.id ||
    character.world.architects.some((architect) => architect.userId === user.id) ||
    character.campaigns.some((entry) => entry.campaign.gmUserId === user.id);

  if (!canAccess) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const { campaigns, ...characterData } = character;
  res.json({
    ...characterData,
    campaignIds: campaigns.map((campaign) => campaign.campaignId)
  });
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

app.get("/api/entity-types", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
  const includeTemplates = req.query.includeTemplates === "true";
  const templatesOnly = req.query.templates === "true";

  if (!isAdmin(user) && worldId && !(await isWorldArchitect(user.id, worldId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  if (!isAdmin(user) && !worldId && !templatesOnly) {
    res.json([]);
    return;
  }

  const whereClause: Prisma.EntityTypeWhereInput = templatesOnly
    ? { isTemplate: true }
    : worldId
      ? includeTemplates
        ? { OR: [{ worldId }, { isTemplate: true }] }
        : { worldId }
      : isAdmin(user)
        ? {}
        : { isTemplate: true };

  const entityTypes = await prisma.entityType.findMany({
    where: whereClause,
    orderBy: { name: "asc" }
  });

  res.json(entityTypes);
});

app.post("/api/entity-types", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { worldId, name, description, isTemplate, sourceTypeId } = req.body as {
    worldId?: string;
    name?: string;
    description?: string;
    isTemplate?: boolean;
    sourceTypeId?: string;
  };

  if (!name) {
    res.status(400).json({ error: "name is required." });
    return;
  }

  if (isTemplate && !isAdmin(user)) {
    res.status(403).json({ error: "Only admins can create templates." });
    return;
  }

  if (!isTemplate && (!worldId || !(await isWorldArchitect(user.id, worldId))) && !isAdmin(user)) {
    res.status(403).json({ error: "Only world architects can create entity types." });
    return;
  }

  let sourceType: { id: string; isTemplate: boolean } | null = null;
  if (sourceTypeId) {
    sourceType = await prisma.entityType.findUnique({
      where: { id: sourceTypeId },
      select: { id: true, isTemplate: true }
    });
    if (!sourceType) {
      res.status(404).json({ error: "Source entity type not found." });
      return;
    }
    if (!isAdmin(user) && !sourceType.isTemplate) {
      res.status(403).json({ error: "Only templates can be copied by non-admins." });
      return;
    }
  }

  const entityType = await prisma.entityType.create({
    data: {
      worldId: isTemplate ? null : worldId ?? null,
      name,
      description,
      isTemplate: Boolean(isTemplate),
      createdById: user.id
    }
  });

  const sourceSections = sourceType
    ? await prisma.entityFormSection.findMany({
        where: { entityTypeId: sourceType.id },
        orderBy: { sortOrder: "asc" }
      })
    : [];
  const sectionMap = new Map<string, string>();
  let defaultSectionId: string | null = null;

  if (sourceSections.length > 0) {
    for (const section of sourceSections) {
      const created = await prisma.entityFormSection.create({
        data: {
          entityTypeId: entityType.id,
          title: section.title,
          layout: section.layout,
          sortOrder: section.sortOrder
        }
      });
      sectionMap.set(section.id, created.id);
    }
  } else {
    const created = await prisma.entityFormSection.create({
      data: {
        entityTypeId: entityType.id,
        title: "General",
        layout: EntityFormSectionLayout.ONE_COLUMN,
        sortOrder: 1
      }
    });
    defaultSectionId = created.id;
  }

  if (sourceType) {
    const sourceFields = await prisma.entityField.findMany({
      where: { entityTypeId: sourceType.id },
      include: { choices: true }
    });

    for (const field of sourceFields) {
      const mappedSectionId =
        (field.formSectionId ? sectionMap.get(field.formSectionId) : undefined) ??
        defaultSectionId ??
        null;
      const createdField = await prisma.entityField.create({
        data: {
          entityTypeId: entityType.id,
          fieldKey: field.fieldKey,
          label: field.label,
          fieldType: field.fieldType,
          description: field.description,
          required: field.required,
          listOrder: field.listOrder,
          formOrder: field.formOrder,
          formSectionId: mappedSectionId,
          formColumn: field.formColumn ?? 1,
          referenceEntityTypeId: field.referenceEntityTypeId,
          referenceLocationTypeKey: field.referenceLocationTypeKey,
          conditions: field.conditions ?? undefined
        }
      });

      if (field.choices.length > 0) {
        await prisma.entityFieldChoice.createMany({
          data: field.choices.map((choice) => ({
            entityFieldId: createdField.id,
            value: choice.value,
            label: choice.label,
            sortOrder: choice.sortOrder ?? undefined,
            pillColor: choice.pillColor ?? undefined,
            textColor: choice.textColor ?? undefined
          }))
        });
      }
    }
  }

  res.status(201).json(entityType);
});

app.get("/api/entity-types/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const entityType = await prisma.entityType.findUnique({
    where: { id }
  });
  if (!entityType) {
    res.status(404).json({ error: "Entity type not found." });
    return;
  }

  if (!entityType.isTemplate && !isAdmin(user) && !(await canAccessEntityType(user.id, id))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  res.json(entityType);
});

app.put("/api/entity-types/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const entityType = await prisma.entityType.findUnique({
    where: { id },
    select: { isTemplate: true, worldId: true }
  });
  if (!entityType) {
    res.status(404).json({ error: "Entity type not found." });
    return;
  }

  if (entityType.isTemplate && !isAdmin(user)) {
    res.status(403).json({ error: "Only admins can edit templates." });
    return;
  }

  if (!entityType.isTemplate && !isAdmin(user) && !(await isWorldArchitect(user.id, entityType.worldId ?? ""))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const { name, description } = req.body as { name?: string; description?: string };

  const updated = await prisma.entityType.update({
    where: { id },
    data: { name, description }
  });

  res.json(updated);
});

app.delete("/api/entity-types/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const entityType = await prisma.entityType.findUnique({
    where: { id },
    select: { isTemplate: true, worldId: true }
  });
  if (!entityType) {
    res.status(404).json({ error: "Entity type not found." });
    return;
  }

  if (entityType.isTemplate && !isAdmin(user)) {
    res.status(403).json({ error: "Only admins can delete templates." });
    return;
  }

  if (!entityType.isTemplate && !isAdmin(user) && !(await isWorldArchitect(user.id, entityType.worldId ?? ""))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  await prisma.entityType.delete({ where: { id } });
  res.json({ ok: true });
});

app.get("/api/entity-type-stats", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
  const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;

  if (!worldId) {
    res.json([]);
    return;
  }

  if (!isAdmin(user) && !(await canAccessWorld(user.id, worldId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const types = await prisma.entityType.findMany({
    where: { worldId },
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  });

  if (types.length === 0) {
    res.json([]);
    return;
  }

  const accessFilter = isAdmin(user)
    ? { worldId }
    : await buildEntityAccessFilter(user, worldId, campaignId, characterId);

  const grouped = await prisma.entity.groupBy({
    by: ["entityTypeId"],
    where: accessFilter,
    _count: { _all: true }
  });

  const countMap = new Map(grouped.map((entry) => [entry.entityTypeId, entry._count._all]));

  res.json(
    types.map((type) => ({
      id: type.id,
      name: type.name,
      count: countMap.get(type.id) ?? 0
    }))
  );
});

app.get("/api/entity-form-sections", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const entityTypeId =
    typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : undefined;
  if (!entityTypeId) {
    res.status(400).json({ error: "entityTypeId is required." });
    return;
  }

  if (!isAdmin(user) && !(await canAccessEntityType(user.id, entityTypeId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  let sections = await prisma.entityFormSection.findMany({
    where: { entityTypeId },
    orderBy: { sortOrder: "asc" }
  });

  if (sections.length === 0 && (isAdmin(user) || (await canManageEntityType(user.id, entityTypeId)))) {
    const created = await prisma.entityFormSection.create({
      data: {
        entityTypeId,
        title: "General",
        layout: EntityFormSectionLayout.ONE_COLUMN,
        sortOrder: 1
      }
    });
    sections = [created];
  }

  res.json(sections);
});

app.post("/api/entity-form-sections", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { entityTypeId, title, layout, sortOrder } = req.body as {
    entityTypeId?: string;
    title?: string;
    layout?: EntityFormSectionLayout;
    sortOrder?: number;
  };

  if (!entityTypeId || !title) {
    res.status(400).json({ error: "entityTypeId and title are required." });
    return;
  }

  if (!isAdmin(user) && !(await canManageEntityType(user.id, entityTypeId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const resolvedLayout = Object.values(EntityFormSectionLayout).includes(
    layout as EntityFormSectionLayout
  )
    ? (layout as EntityFormSectionLayout)
    : EntityFormSectionLayout.ONE_COLUMN;

  const section = await prisma.entityFormSection.create({
    data: {
      entityTypeId,
      title,
      layout: resolvedLayout,
      sortOrder: sortOrder ?? 0
    }
  });

  res.status(201).json(section);
});

app.put("/api/entity-form-sections/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const existing = await prisma.entityFormSection.findUnique({
    where: { id },
    select: { entityTypeId: true }
  });
  if (!existing) {
    res.status(404).json({ error: "Section not found." });
    return;
  }

  if (!isAdmin(user) && !(await canManageEntityType(user.id, existing.entityTypeId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const { title, layout, sortOrder } = req.body as {
    title?: string;
    layout?: EntityFormSectionLayout;
    sortOrder?: number;
  };

  const resolvedLayout =
    layout && Object.values(EntityFormSectionLayout).includes(layout)
      ? layout
      : undefined;

  const section = await prisma.entityFormSection.update({
    where: { id },
    data: {
      title,
      layout: resolvedLayout,
      sortOrder
    }
  });

  res.json(section);
});

app.delete("/api/entity-form-sections/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const existing = await prisma.entityFormSection.findUnique({
    where: { id },
    select: { entityTypeId: true }
  });
  if (!existing) {
    res.status(404).json({ error: "Section not found." });
    return;
  }

  if (!isAdmin(user) && !(await canManageEntityType(user.id, existing.entityTypeId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  await prisma.$transaction([
    prisma.entityField.updateMany({
      where: { formSectionId: id },
      data: { formSectionId: null, formColumn: 1 }
    }),
    prisma.entityFormSection.delete({ where: { id } })
  ]);

  res.json({ ok: true });
});

app.get("/api/entity-fields", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const entityTypeId = typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : undefined;
  const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
  if (!entityTypeId) {
    if (worldId && !isAdmin(user) && !(await isWorldArchitect(user.id, worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const fields = await prisma.entityField.findMany({
      where: {
        ...(worldId ? { entityType: { worldId } } : {}),
        ...(isAdmin(user) || worldId
          ? {}
          : {
              entityType: {
                world: {
                  OR: [
                    { primaryArchitectId: user.id },
                    { architects: { some: { userId: user.id } } }
                  ]
                }
              }
            })
      },
      include: { choices: true },
      orderBy: { formOrder: "asc" }
    });
    res.json(fields);
    return;
  }

  const entityType = await prisma.entityType.findUnique({
    where: { id: entityTypeId },
    select: { worldId: true, isTemplate: true }
  });
  if (!entityType) {
    res.status(404).json({ error: "Entity type not found." });
    return;
  }

  if (!entityType.isTemplate && !isAdmin(user) && !(await canAccessEntityType(user.id, entityTypeId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const fields = await prisma.entityField.findMany({
    where: { entityTypeId },
    include: { choices: true },
    orderBy: { formOrder: "asc" }
  });

  res.json(fields);
});

app.post("/api/entity-fields", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const {
    entityTypeId,
    fieldKey,
    label,
    fieldType,
    description,
    required,
    listOrder,
    formOrder,
    formSectionId,
    formColumn,
    referenceEntityTypeId,
    referenceLocationTypeKey,
    conditions
  } = req.body as {
    entityTypeId?: string;
    fieldKey?: string;
    label?: string;
    fieldType?: EntityFieldType;
    description?: string;
    required?: boolean;
    listOrder?: number;
    formOrder?: number;
    formSectionId?: string;
    formColumn?: number;
    referenceEntityTypeId?: string;
    referenceLocationTypeKey?: string;
    conditions?: Prisma.InputJsonValue;
  };

  if (!entityTypeId || !fieldKey || !label || !fieldType) {
    res.status(400).json({ error: "entityTypeId, fieldKey, label, and fieldType are required." });
    return;
  }

  const entityType = await prisma.entityType.findUnique({
    where: { id: entityTypeId },
    select: { worldId: true, isTemplate: true }
  });
  if (!entityType) {
    res.status(404).json({ error: "Entity type not found." });
    return;
  }

  if (entityType.isTemplate && !isAdmin(user)) {
    res.status(403).json({ error: "Only admins can edit templates." });
    return;
  }

  if (!entityType.isTemplate && !isAdmin(user) && !(await isWorldArchitect(user.id, entityType.worldId ?? ""))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const field = await prisma.entityField.create({
    data: {
      entityTypeId,
      fieldKey,
      label,
      fieldType,
      description,
      required: Boolean(required),
      listOrder: listOrder ?? 0,
      formOrder: formOrder ?? 0,
      formSectionId: formSectionId ?? null,
      formColumn: formColumn ?? 1,
      referenceEntityTypeId,
      referenceLocationTypeKey,
      conditions: conditions ?? undefined
    }
  });

  res.status(201).json(field);
});

app.get("/api/entity-fields/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const field = await prisma.entityField.findUnique({
    where: { id },
    include: { choices: true }
  });
  if (!field) {
    res.status(404).json({ error: "Field not found." });
    return;
  }

  if (!isAdmin(user) && !(await canAccessEntityType(user.id, field.entityTypeId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  res.json(field);
});

app.put("/api/entity-fields/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const existing = await prisma.entityField.findUnique({
    where: { id },
    select: { entityTypeId: true }
  });
  if (!existing) {
    res.status(404).json({ error: "Field not found." });
    return;
  }

  if (!isAdmin(user) && !(await canManageEntityType(user.id, existing.entityTypeId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const {
    fieldKey,
    label,
    fieldType,
    description,
    required,
    listOrder,
    formOrder,
    formSectionId,
    formColumn,
    referenceEntityTypeId,
    referenceLocationTypeKey,
    conditions
  } = req.body as {
    fieldKey?: string;
    label?: string;
    fieldType?: EntityFieldType;
    description?: string;
    required?: boolean;
    listOrder?: number;
    formOrder?: number;
    formSectionId?: string | null;
    formColumn?: number;
    referenceEntityTypeId?: string;
    referenceLocationTypeKey?: string;
    conditions?: Prisma.InputJsonValue;
  };

  const field = await prisma.entityField.update({
    where: { id },
    data: {
      fieldKey,
      label,
      fieldType,
      description,
      required,
      listOrder,
      formOrder,
      formSectionId,
      formColumn,
      referenceEntityTypeId,
      referenceLocationTypeKey,
      conditions: conditions ?? undefined
    }
  });

  res.json(field);
});

app.delete("/api/entity-fields/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const existing = await prisma.entityField.findUnique({
    where: { id },
    select: { entityTypeId: true }
  });
  if (!existing) {
    res.status(404).json({ error: "Field not found." });
    return;
  }

  if (!isAdmin(user) && !(await canManageEntityType(user.id, existing.entityTypeId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  await prisma.entityField.delete({ where: { id } });
  res.json({ ok: true });
});

app.get("/api/entity-field-choices", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const entityFieldId = typeof req.query.entityFieldId === "string" ? req.query.entityFieldId : undefined;
  const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
  if (!entityFieldId) {
    if (worldId && !isAdmin(user) && !(await isWorldArchitect(user.id, worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const choices = await prisma.entityFieldChoice.findMany({
      where: {
        ...(worldId ? { entityField: { entityType: { worldId } } } : {}),
        ...(isAdmin(user) || worldId
          ? {}
          : {
              entityField: {
                entityType: {
                  world: {
                    OR: [
                      { primaryArchitectId: user.id },
                      { architects: { some: { userId: user.id } } }
                    ]
                  }
                }
              }
            })
      },
      orderBy: { sortOrder: "asc" }
    });
    res.json(choices);
    return;
  }

  const field = await prisma.entityField.findUnique({
    where: { id: entityFieldId },
    select: { entityTypeId: true }
  });
  if (!field) {
    res.status(404).json({ error: "Field not found." });
    return;
  }

  if (!isAdmin(user) && !(await canAccessEntityType(user.id, field.entityTypeId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const choices = await prisma.entityFieldChoice.findMany({
    where: { entityFieldId },
    orderBy: { sortOrder: "asc" }
  });
  res.json(choices);
});

app.get("/api/entity-field-choices/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const choice = await prisma.entityFieldChoice.findUnique({
    where: { id },
    include: { entityField: { select: { entityTypeId: true } } }
  });
  if (!choice) {
    res.status(404).json({ error: "Choice not found." });
    return;
  }

  if (!isAdmin(user) && !(await canAccessEntityType(user.id, choice.entityField.entityTypeId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const { entityField, ...choiceData } = choice;
  res.json(choiceData);
});

app.post("/api/entity-field-choices", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { entityFieldId, value, label, sortOrder, pillColor, textColor } = req.body as {
    entityFieldId?: string;
    value?: string;
    label?: string;
    sortOrder?: number;
    pillColor?: string | null;
    textColor?: string | null;
  };

  if (!entityFieldId || !value || !label) {
    res.status(400).json({ error: "entityFieldId, value, and label are required." });
    return;
  }

  const field = await prisma.entityField.findUnique({
    where: { id: entityFieldId },
    select: { entityTypeId: true }
  });
  if (!field) {
    res.status(404).json({ error: "Field not found." });
    return;
  }

  if (!isAdmin(user) && !(await canManageEntityType(user.id, field.entityTypeId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  try {
    const choice = await prisma.entityFieldChoice.create({
      data: {
        entityFieldId,
        value,
        label,
        sortOrder,
        pillColor,
        textColor
      }
    });

    res.status(201).json(choice);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ error: "Choice value already exists for this field." });
      return;
    }
    throw error;
  }
});

app.put("/api/entity-field-choices/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const existing = await prisma.entityFieldChoice.findUnique({
    where: { id },
    select: { entityField: { select: { entityTypeId: true } } }
  });
  if (!existing) {
    res.status(404).json({ error: "Choice not found." });
    return;
  }

  if (!isAdmin(user) && !(await canManageEntityType(user.id, existing.entityField.entityTypeId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const { value, label, sortOrder, pillColor, textColor } = req.body as {
    value?: string;
    label?: string;
    sortOrder?: number;
    pillColor?: string | null;
    textColor?: string | null;
  };

  const choice = await prisma.entityFieldChoice.update({
    where: { id },
    data: { value, label, sortOrder, pillColor, textColor }
  });

  res.json(choice);
});

app.delete("/api/entity-field-choices/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const existing = await prisma.entityFieldChoice.findUnique({
    where: { id },
    select: { entityField: { select: { entityTypeId: true } } }
  });
  if (!existing) {
    res.status(404).json({ error: "Choice not found." });
    return;
  }

  if (!isAdmin(user) && !(await canManageEntityType(user.id, existing.entityField.entityTypeId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  await prisma.entityFieldChoice.delete({ where: { id } });
  res.json({ ok: true });
});

app.get("/api/entities", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
  const entityTypeId = typeof req.query.entityTypeId === "string" ? req.query.entityTypeId : undefined;
  const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;
  const fieldKeysParam = typeof req.query.fieldKeys === "string" ? req.query.fieldKeys : undefined;
  const filtersParam = typeof req.query.filters === "string" ? req.query.filters : undefined;

  if (!worldId && !isAdmin(user)) {
    res.json([]);
    return;
  }

  let whereClause: Prisma.EntityWhereInput = {};
    if (worldId) {
      if (isAdmin(user)) {
        whereClause = { worldId };
      } else {
        if (!(await canAccessWorld(user.id, worldId))) {
          res.json([]);
          return;
        }
        whereClause = await buildEntityAccessFilter(user, worldId, campaignId, characterId);
      }
    }

  if (entityTypeId) {
    whereClause = { AND: [whereClause, { entityTypeId }] };
  }

  let filterGroup = normalizeListViewFilters(null);
  if (filtersParam) {
    try {
      const parsed = JSON.parse(filtersParam);
      filterGroup = normalizeListViewFilters(parsed);
    } catch {
      res.status(400).json({ error: "Invalid filters payload." });
      return;
    }
  }

  const fieldKeyList = fieldKeysParam
    ? fieldKeysParam.split(",").map((item) => item.trim()).filter(Boolean)
    : [];

  if (filterGroup.rules.length > 0 || fieldKeyList.length > 0) {
    if (!entityTypeId) {
      res.status(400).json({ error: "entityTypeId is required for list filters." });
      return;
    }
  }

  const entityFieldMap = new Map<string, EntityFieldType>();
  if (filterGroup.rules.length > 0 || fieldKeyList.length > 0) {
    const fields = await prisma.entityField.findMany({
      where: { entityTypeId },
      select: { fieldKey: true, fieldType: true }
    });
    fields.forEach((field) => entityFieldMap.set(field.fieldKey, field.fieldType));
  }

  const filterClauses: Prisma.EntityWhereInput[] = [];
  filterGroup.rules.forEach((rule) => {
    if (!rule.fieldKey || !rule.operator) return;
    if (rule.fieldKey === "name" || rule.fieldKey === "description") {
      const value = rule.value ? String(rule.value) : "";
      if (rule.operator === "is_set") {
        filterClauses.push({
          [rule.fieldKey]: { not: null }
        });
        return;
      }
      if (rule.operator === "is_not_set") {
        filterClauses.push({
          OR: [{ [rule.fieldKey]: null }, { [rule.fieldKey]: "" }]
        });
        return;
      }
      if (!value) return;
      if (rule.operator === "equals") {
        filterClauses.push({ [rule.fieldKey]: value });
        return;
      }
      if (rule.operator === "not_equals") {
        filterClauses.push({ [rule.fieldKey]: { not: value } });
        return;
      }
      if (rule.operator === "contains") {
        filterClauses.push({ [rule.fieldKey]: { contains: value, mode: "insensitive" } });
        return;
      }
      return;
    }

    const fieldType = entityFieldMap.get(rule.fieldKey);
    if (!fieldType) return;

    const valueList = Array.isArray(rule.value)
      ? rule.value.map((item) => String(item))
      : rule.value !== undefined
        ? [String(rule.value)]
        : [];

    if (rule.operator === "is_set") {
      filterClauses.push({
        values: {
          some: {
            field: { fieldKey: rule.fieldKey }
          }
        }
      });
      return;
    }
    if (rule.operator === "is_not_set") {
      filterClauses.push({
        values: {
          none: {
            field: { fieldKey: rule.fieldKey }
          }
        }
      });
      return;
    }

    if (valueList.length === 0) return;

    const value = valueList[0];
    const valueFilter: Prisma.EntityFieldValueWhereInput = {
      field: { fieldKey: rule.fieldKey }
    };

    if (fieldType === EntityFieldType.BOOLEAN) {
      const boolValue = value === "true" || value === "1";
      if (rule.operator === "equals") {
        valueFilter.valueBoolean = boolValue;
      } else if (rule.operator === "not_equals") {
        valueFilter.valueBoolean = { not: boolValue };
      } else {
        valueFilter.valueBoolean = boolValue;
      }
    } else if (fieldType === EntityFieldType.TEXTAREA) {
      if (rule.operator === "contains") {
        valueFilter.valueText = { contains: value, mode: "insensitive" };
      } else if (rule.operator === "not_equals") {
        valueFilter.valueText = { not: value };
      } else {
        valueFilter.valueText = value;
      }
    } else {
      if (rule.operator === "contains") {
        valueFilter.valueString = { contains: value, mode: "insensitive" };
      } else if (rule.operator === "not_equals") {
        valueFilter.valueString = { not: value };
      } else if (rule.operator === "contains_any") {
        valueFilter.valueString = { in: valueList };
      } else {
        valueFilter.valueString = value;
      }
    }

    filterClauses.push({ values: { some: valueFilter } });
  });

  if (filterClauses.length > 0) {
    const combined =
      filterGroup.logic === "OR" ? { OR: filterClauses } : { AND: filterClauses };
    whereClause = { AND: [whereClause, combined] };
  }

  const includeValues =
    entityTypeId && fieldKeyList.length > 0
      ? {
          values: {
            where: { field: { fieldKey: { in: fieldKeyList } } },
            include: { field: true }
          }
        }
      : undefined;

  const entities = await prisma.entity.findMany({
    where: whereClause,
    orderBy: { name: "asc" },
    include: includeValues
  });

  if (!includeValues) {
    res.json(entities);
    return;
  }

  const results = entities.map((entity) => {
    const values = (entity as typeof entity & {
      values?: Array<{
        field: { fieldKey: string };
        valueString: string | null;
        valueText: string | null;
        valueBoolean: boolean | null;
        valueNumber: number | null;
        valueJson: Prisma.JsonValue | null;
      }>;
    }).values ?? [];

    const fieldValues: Record<string, unknown> = {};
    values.forEach((entry) => {
      const key = entry.field.fieldKey;
      if (entry.valueString !== null && entry.valueString !== undefined) {
        fieldValues[key] = entry.valueString;
      } else if (entry.valueText !== null && entry.valueText !== undefined) {
        fieldValues[key] = entry.valueText;
      } else if (entry.valueBoolean !== null && entry.valueBoolean !== undefined) {
        fieldValues[key] = entry.valueBoolean;
      } else if (entry.valueNumber !== null && entry.valueNumber !== undefined) {
        fieldValues[key] = entry.valueNumber;
      } else if (entry.valueJson !== null && entry.valueJson !== undefined) {
        fieldValues[key] = entry.valueJson;
      }
    });

    const { values: _values, ...rest } = entity as typeof entity & { values?: unknown };
    return { ...rest, fieldValues };
  });

  res.json(results);
});

app.post("/api/entities", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const {
    worldId,
    entityTypeId,
    name,
    description,
    fieldValues,
    contextCampaignId,
    contextCharacterId,
    access
  } = req.body as {
    worldId?: string;
    entityTypeId?: string;
    name?: string;
    description?: string;
    fieldValues?: Record<string, unknown>;
    contextCampaignId?: string;
    contextCharacterId?: string;
    access?: {
      read?: { global?: boolean; campaigns?: string[]; characters?: string[] };
      write?: { global?: boolean; campaigns?: string[]; characters?: string[] };
    };
  };

  if (!worldId || !entityTypeId || !name) {
    res.status(400).json({ error: "worldId, entityTypeId, and name are required." });
    return;
  }

  const entityType = await prisma.entityType.findUnique({
    where: { id: entityTypeId },
    select: { worldId: true, isTemplate: true }
  });
  if (!entityType || entityType.isTemplate || entityType.worldId !== worldId) {
    res.status(400).json({ error: "Entity type must belong to the selected world." });
    return;
  }

  if (!isAdmin(user) && !(await canCreateEntityInWorld(user.id, worldId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const fields: EntityFieldRecord[] = await prisma.entityField.findMany({
    where: { entityTypeId },
    include: { choices: true }
  });
  const fieldMap = new Map(fields.map((field) => [field.fieldKey, field]));

  const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const entity = await tx.entity.create({
      data: {
        worldId,
        entityTypeId,
        name,
        description,
        createdById: user.id
      }
    });

    if (fieldValues) {
      for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
        const field = fieldMap.get(fieldKey);
        if (!field) continue;
        const valuePayload: EntityFieldValueWrite = {
          entityId: entity.id,
          fieldId: field.id
        };

        if (field.fieldType === EntityFieldType.TEXT || field.fieldType === EntityFieldType.CHOICE) {
          valuePayload.valueString = rawValue ? String(rawValue) : null;
        } else if (field.fieldType === EntityFieldType.TEXTAREA) {
          valuePayload.valueText = rawValue ? String(rawValue) : null;
        } else if (field.fieldType === EntityFieldType.BOOLEAN) {
          valuePayload.valueBoolean = Boolean(rawValue);
        } else if (
          field.fieldType === EntityFieldType.ENTITY_REFERENCE ||
          field.fieldType === EntityFieldType.LOCATION_REFERENCE
        ) {
          valuePayload.valueString = rawValue ? String(rawValue) : null;
        }

        await tx.entityFieldValue.create({ data: valuePayload });
      }
    }

    const accessEntries: EntityAccessEntry[] = [];

    if (access?.read) {
      if (access.read.global) {
        accessEntries.push({
          entityId: entity.id,
          accessType: EntityAccessType.READ,
          scopeType: EntityAccessScope.GLOBAL
        });
      }
      access.read.campaigns?.forEach((id) =>
        accessEntries.push({
          entityId: entity.id,
          accessType: EntityAccessType.READ,
          scopeType: EntityAccessScope.CAMPAIGN,
          scopeId: id
        })
      );
      access.read.characters?.forEach((id) =>
        accessEntries.push({
          entityId: entity.id,
          accessType: EntityAccessType.READ,
          scopeType: EntityAccessScope.CHARACTER,
          scopeId: id
        })
      );
    }

    if (access?.write) {
      if (access.write.global) {
        accessEntries.push({
          entityId: entity.id,
          accessType: EntityAccessType.WRITE,
          scopeType: EntityAccessScope.GLOBAL
        });
      }
      access.write.campaigns?.forEach((id) =>
        accessEntries.push({
          entityId: entity.id,
          accessType: EntityAccessType.WRITE,
          scopeType: EntityAccessScope.CAMPAIGN,
          scopeId: id
        })
      );
      access.write.characters?.forEach((id) =>
        accessEntries.push({
          entityId: entity.id,
          accessType: EntityAccessType.WRITE,
          scopeType: EntityAccessScope.CHARACTER,
          scopeId: id
        })
      );
    }

    if (accessEntries.length === 0) {
      if (contextCampaignId) {
        accessEntries.push(
          {
            entityId: entity.id,
            accessType: EntityAccessType.READ,
            scopeType: EntityAccessScope.CAMPAIGN,
            scopeId: contextCampaignId
          },
          {
            entityId: entity.id,
            accessType: EntityAccessType.WRITE,
            scopeType: EntityAccessScope.CAMPAIGN,
            scopeId: contextCampaignId
          }
        );
      } else {
        accessEntries.push(
          {
            entityId: entity.id,
            accessType: EntityAccessType.READ,
            scopeType: EntityAccessScope.GLOBAL
          },
          {
            entityId: entity.id,
            accessType: EntityAccessType.WRITE,
            scopeType: EntityAccessScope.GLOBAL
          }
        );
      }
    }

      await tx.entityAccess.createMany({
        data: accessEntries
      });

      await logSystemAudit(tx, {
        entityKey: "entities",
        entityId: entity.id,
        action: "create",
        actorId: user.id,
        details: {
          name,
          description,
          worldId,
          entityTypeId,
          access: access ?? null
        }
      });

      return entity;
    });

  res.status(201).json(created);
});

app.get("/api/entities/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;

  const entity = await prisma.entity.findUnique({
    where: { id },
    include: {
      values: { include: { field: true } },
      access: true
    }
  });

  if (!entity) {
    res.status(404).json({ error: "Entity not found." });
    return;
  }

    let accessAllowed = false;
    let auditAllowed = false;
    if (!isAdmin(user)) {
      if (!(await canAccessWorld(user.id, entity.worldId))) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }

      const accessFilters: Prisma.EntityAccessWhereInput[] = [
        { scopeType: EntityAccessScope.GLOBAL }
      ];
      if (campaignId) {
        accessFilters.push({ scopeType: EntityAccessScope.CAMPAIGN, scopeId: campaignId });
      }
      if (characterId) {
        accessFilters.push({ scopeType: EntityAccessScope.CHARACTER, scopeId: characterId });
      }

      const isArchitect = await isWorldArchitect(user.id, entity.worldId);
      const isGm =
        (await isWorldGameMaster(user.id, entity.worldId)) ||
        (await isWorldGm(user.id, entity.worldId));
      accessAllowed = isArchitect || isGm;
      auditAllowed = accessAllowed;

      const canRead =
        isArchitect ||
        (await prisma.entityAccess.findFirst({
          where: {
            entityId: entity.id,
            accessType: EntityAccessType.READ,
            OR: accessFilters
          }
        }));

      if (!canRead) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }

      res.json({
        id: entity.id,
        worldId: entity.worldId,
        entityTypeId: entity.entityTypeId,
        name: entity.name,
        description: entity.description,
        createdById: entity.createdById,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        accessAllowed,
        auditAllowed,
        fieldValues: entity.values.reduce<Record<string, unknown>>((acc, value) => {
          const fieldKey = value.field.fieldKey;
          if (value.valueString !== null && value.valueString !== undefined) {
            acc[fieldKey] = value.valueString;
          } else if (value.valueText !== null && value.valueText !== undefined) {
            acc[fieldKey] = value.valueText;
          } else if (value.valueBoolean !== null && value.valueBoolean !== undefined) {
            acc[fieldKey] = value.valueBoolean;
          } else if (value.valueNumber !== null && value.valueNumber !== undefined) {
            acc[fieldKey] = value.valueNumber;
          } else if (value.valueJson !== null && value.valueJson !== undefined) {
            acc[fieldKey] = value.valueJson;
          }
          return acc;
        }, {})
      });
      return;
    }

  const fieldValues: Record<string, unknown> = {};
  entity.values.forEach((value) => {
    const fieldKey = value.field.fieldKey;
    if (value.valueString !== null && value.valueString !== undefined) {
      fieldValues[fieldKey] = value.valueString;
    } else if (value.valueText !== null && value.valueText !== undefined) {
      fieldValues[fieldKey] = value.valueText;
    } else if (value.valueBoolean !== null && value.valueBoolean !== undefined) {
      fieldValues[fieldKey] = value.valueBoolean;
    } else if (value.valueNumber !== null && value.valueNumber !== undefined) {
      fieldValues[fieldKey] = value.valueNumber;
    } else if (value.valueJson !== null && value.valueJson !== undefined) {
      fieldValues[fieldKey] = value.valueJson;
    }
  });

  res.json({
    id: entity.id,
    worldId: entity.worldId,
    entityTypeId: entity.entityTypeId,
    name: entity.name,
    description: entity.description,
    createdById: entity.createdById,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    fieldValues
  });
});

app.put("/api/entities/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;

    const entity = await prisma.entity.findUnique({
      where: { id },
      select: {
        worldId: true,
        entityTypeId: true,
        name: true,
        description: true,
        values: {
          select: {
            fieldId: true,
            valueString: true,
            valueText: true,
            valueBoolean: true,
            valueNumber: true,
            valueJson: true
          }
        }
      }
    });
  if (!entity) {
    res.status(404).json({ error: "Entity not found." });
    return;
  }

  if (!isAdmin(user) && !(await canWriteEntity(user, id, campaignId, characterId))) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

    const { name, description, fieldValues } = req.body as {
      name?: string;
      description?: string;
      fieldValues?: Record<string, unknown>;
    };

    const fields: EntityFieldRecord[] = await prisma.entityField.findMany({
      where: { entityTypeId: entity.entityTypeId },
      include: { choices: true }
    });
    const fieldMap = new Map(fields.map((field) => [field.fieldKey, field]));
    const storedValueMap = new Map(
      entity.values.map((value) => [value.fieldId, getStoredEntityValue(value)])
    );
    const changes: Array<{
      fieldKey: string;
      label: string;
      from: string | boolean | null;
      to: string | boolean | null;
    }> = [];

    if (name !== undefined && name !== entity.name) {
      changes.push({
        fieldKey: "name",
        label: "Name",
        from: entity.name,
        to: name
      });
    }

    if (description !== undefined && description !== entity.description) {
      changes.push({
        fieldKey: "description",
        label: "Description",
        from: entity.description ?? null,
        to: description ?? null
      });
    }

    if (fieldValues) {
      for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
        const field = fieldMap.get(fieldKey);
        if (!field) continue;
        const previous = storedValueMap.get(field.id) ?? null;
        const next = normalizeEntityValue(field.fieldType, rawValue);
        if (previous !== next) {
          changes.push({
            fieldKey,
            label: field.label,
            from: previous,
            to: next
          });
        }
      }
    }

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const entityRecord = await tx.entity.update({
        where: { id },
        data: { name, description }
      });

    if (fieldValues) {
      for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
        const field = fieldMap.get(fieldKey);
        if (!field) continue;

        const valueData: EntityFieldValueWrite = {
          entityId: id,
          fieldId: field.id
        };

        if (field.fieldType === EntityFieldType.TEXT || field.fieldType === EntityFieldType.CHOICE) {
          valueData.valueString = rawValue ? String(rawValue) : null;
        } else if (field.fieldType === EntityFieldType.TEXTAREA) {
          valueData.valueText = rawValue ? String(rawValue) : null;
        } else if (field.fieldType === EntityFieldType.BOOLEAN) {
          valueData.valueBoolean = Boolean(rawValue);
        } else if (
          field.fieldType === EntityFieldType.ENTITY_REFERENCE ||
          field.fieldType === EntityFieldType.LOCATION_REFERENCE
        ) {
          valueData.valueString = rawValue ? String(rawValue) : null;
        }

        if (
          valueData.valueString === null &&
          valueData.valueText === null &&
          valueData.valueBoolean === null &&
          valueData.valueNumber === null &&
          valueData.valueJson === undefined
        ) {
          await tx.entityFieldValue.deleteMany({
            where: { entityId: id, fieldId: field.id }
          });
        } else {
          await tx.entityFieldValue.upsert({
            where: { entityId_fieldId: { entityId: id, fieldId: field.id } },
            update: valueData,
            create: valueData
          });
          }
        }
      }

      if (changes.length > 0) {
        await logSystemAudit(tx, {
          entityKey: "entities",
          entityId: id,
          action: "update",
          actorId: user.id,
          details: { changes }
        });
      }

      return entityRecord;
    });

  res.json(updated);
});

app.delete("/api/entities/:id", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  try {
    const entity = await prisma.entity.findUnique({
      where: { id },
      select: { worldId: true, name: true }
    });
    if (!entity) {
      res.status(404).json({ error: "Entity not found." });
      return;
    }

    const isArchitect = await isWorldArchitect(user.id, entity.worldId);
    const isGm =
      (await isWorldGameMaster(user.id, entity.worldId)) ||
      (await isWorldGm(user.id, entity.worldId));
    if (!isAdmin(user) && !isArchitect && !isGm) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    await prisma.$transaction([
      prisma.noteTag.deleteMany({ where: { note: { entityId: id } } }),
      prisma.note.deleteMany({ where: { entityId: id } }),
      prisma.systemAudit.create({
        data: {
          entityKey: "entities",
          entityId: id,
          action: "delete",
          actorId: user.id,
          details: { name: entity.name }
        }
      }),
      prisma.entityAccess.deleteMany({ where: { entityId: id } }),
      prisma.entityFieldValue.deleteMany({ where: { entityId: id } }),
      prisma.entity.delete({ where: { id } })
    ]);
    res.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete entity.", error);
    res.status(500).json({ error: "Delete failed." });
  }
});

  app.get("/api/entities/:id/access", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const entity = await prisma.entity.findUnique({
    where: { id },
    select: { worldId: true }
  });
  if (!entity) {
    res.status(404).json({ error: "Entity not found." });
    return;
  }

  const isArchitect = await isWorldArchitect(user.id, entity.worldId);
  const isGm =
    (await isWorldGameMaster(user.id, entity.worldId)) ||
    (await isWorldGm(user.id, entity.worldId));
  if (!isAdmin(user) && !isArchitect && !isGm) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  const access = await prisma.entityAccess.findMany({ where: { entityId: id } });
  const read = {
    global: access.some(
      (entry) =>
        entry.accessType === EntityAccessType.READ &&
        entry.scopeType === EntityAccessScope.GLOBAL
    ),
    campaigns: access
      .filter(
        (entry) =>
          entry.accessType === EntityAccessType.READ &&
          entry.scopeType === EntityAccessScope.CAMPAIGN
      )
      .map((entry) => entry.scopeId)
      .filter(Boolean) as string[],
    characters: access
      .filter(
        (entry) =>
          entry.accessType === EntityAccessType.READ &&
          entry.scopeType === EntityAccessScope.CHARACTER
      )
      .map((entry) => entry.scopeId)
      .filter(Boolean) as string[]
  };

  const write = {
    global: access.some(
      (entry) =>
        entry.accessType === EntityAccessType.WRITE &&
        entry.scopeType === EntityAccessScope.GLOBAL
    ),
    campaigns: access
      .filter(
        (entry) =>
          entry.accessType === EntityAccessType.WRITE &&
          entry.scopeType === EntityAccessScope.CAMPAIGN
      )
      .map((entry) => entry.scopeId)
      .filter(Boolean) as string[],
    characters: access
      .filter(
        (entry) =>
          entry.accessType === EntityAccessType.WRITE &&
          entry.scopeType === EntityAccessScope.CHARACTER
      )
      .map((entry) => entry.scopeId)
      .filter(Boolean) as string[]
  };

    res.json({ read, write });
  });

  app.get("/api/entities/:id/audit", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const entity = await prisma.entity.findUnique({
      where: { id },
      select: { worldId: true }
    });
    if (!entity) {
      res.status(404).json({ error: "Entity not found." });
      return;
    }

    const isArchitect = await isWorldArchitect(user.id, entity.worldId);
    const isGm =
      (await isWorldGameMaster(user.id, entity.worldId)) ||
      (await isWorldGm(user.id, entity.worldId));
    if (!isAdmin(user) && !isArchitect && !isGm) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const access = await prisma.entityAccess.findMany({ where: { entityId: id } });
    const readGlobal = access.some(
      (entry) =>
        entry.accessType === EntityAccessType.READ &&
        entry.scopeType === EntityAccessScope.GLOBAL
    );
    const writeGlobal = access.some(
      (entry) =>
        entry.accessType === EntityAccessType.WRITE &&
        entry.scopeType === EntityAccessScope.GLOBAL
    );
    const readCampaignIds = access
      .filter(
        (entry) =>
          entry.accessType === EntityAccessType.READ &&
          entry.scopeType === EntityAccessScope.CAMPAIGN
      )
      .map((entry) => entry.scopeId)
      .filter(Boolean) as string[];
    const writeCampaignIds = access
      .filter(
        (entry) =>
          entry.accessType === EntityAccessType.WRITE &&
          entry.scopeType === EntityAccessScope.CAMPAIGN
      )
      .map((entry) => entry.scopeId)
      .filter(Boolean) as string[];
    const readCharacterIds = access
      .filter(
        (entry) =>
          entry.accessType === EntityAccessType.READ &&
          entry.scopeType === EntityAccessScope.CHARACTER
      )
      .map((entry) => entry.scopeId)
      .filter(Boolean) as string[];
    const writeCharacterIds = access
      .filter(
        (entry) =>
          entry.accessType === EntityAccessType.WRITE &&
          entry.scopeType === EntityAccessScope.CHARACTER
      )
      .map((entry) => entry.scopeId)
      .filter(Boolean) as string[];

    const campaignIds = Array.from(new Set([...readCampaignIds, ...writeCampaignIds]));
    const characterIds = Array.from(new Set([...readCharacterIds, ...writeCharacterIds]));

    const [campaigns, characters] = await Promise.all([
      campaignIds.length > 0
        ? prisma.campaign.findMany({
            where: { id: { in: campaignIds } },
            select: {
              id: true,
              name: true,
              gmUserId: true,
              roster: { select: { character: { select: { playerId: true } } } }
            }
          })
        : Promise.resolve([]),
      characterIds.length > 0
        ? prisma.character.findMany({
            where: { id: { in: characterIds } },
            select: { id: true, name: true, playerId: true }
          })
        : Promise.resolve([])
    ]);

    const campaignUserMap = new Map<string, { label: string; userIds: Set<string> }>();
    campaigns.forEach((campaign) => {
      const userIds = new Set<string>([campaign.gmUserId]);
      campaign.roster.forEach((entry) => {
        userIds.add(entry.character.playerId);
      });
      campaignUserMap.set(campaign.id, { label: `Campaign: ${campaign.name}`, userIds });
    });

    const characterUserMap = new Map<string, { label: string; userId: string }>();
    characters.forEach((character) => {
      characterUserMap.set(character.id, {
        label: `Character: ${character.name}`,
        userId: character.playerId
      });
    });

    const needsGlobal = readGlobal || writeGlobal;
    const scopedUserIds = new Set<string>();
    campaignUserMap.forEach((entry) => entry.userIds.forEach((id) => scopedUserIds.add(id)));
    characterUserMap.forEach((entry) => scopedUserIds.add(entry.userId));

    const [globalUsers, scopedUsers] = await Promise.all([
      needsGlobal
        ? prisma.user.findMany({
            where: {
              role: Role.USER,
              OR: [
                { ownedWorlds: { some: { id: entity.worldId } } },
                { architectWorlds: { some: { worldId: entity.worldId } } },
                { worldGameMasters: { some: { worldId: entity.worldId } } },
                { worldCampaignAccess: { some: { worldId: entity.worldId } } },
                { worldCharacterAccess: { some: { worldId: entity.worldId } } },
                { gmCampaigns: { some: { worldId: entity.worldId } } },
                { characters: { some: { worldId: entity.worldId } } }
              ]
            },
            select: { id: true, name: true, email: true }
          })
        : Promise.resolve([]),
      scopedUserIds.size > 0
        ? prisma.user.findMany({
            where: { id: { in: Array.from(scopedUserIds) }, role: Role.USER },
            select: { id: true, name: true, email: true }
          })
        : Promise.resolve([])
    ]);

    const userDirectory = new Map<string, { id: string; name: string | null; email: string }>();
    globalUsers.forEach((entry) => userDirectory.set(entry.id, entry));
    scopedUsers.forEach((entry) => userDirectory.set(entry.id, entry));

    const accessMap = new Map<
      string,
      {
        user: { id: string; name: string | null; email: string };
        readContexts: Set<string>;
        writeContexts: Set<string>;
      }
    >();

    const ensureAccessEntry = (userId: string) => {
      const userInfo = userDirectory.get(userId);
      if (!userInfo) return;
      if (!accessMap.has(userId)) {
        accessMap.set(userId, {
          user: userInfo,
          readContexts: new Set<string>(),
          writeContexts: new Set<string>()
        });
      }
    };

    if (readGlobal || writeGlobal) {
      globalUsers.forEach((entry) => {
        ensureAccessEntry(entry.id);
        const accessEntry = accessMap.get(entry.id);
        if (!accessEntry) return;
        if (readGlobal) accessEntry.readContexts.add("Global");
        if (writeGlobal) accessEntry.writeContexts.add("Global");
      });
    }

    readCampaignIds.forEach((campaignId) => {
      const campaign = campaignUserMap.get(campaignId);
      if (!campaign) return;
      campaign.userIds.forEach((userId) => {
        ensureAccessEntry(userId);
        accessMap.get(userId)?.readContexts.add(campaign.label);
      });
    });

    writeCampaignIds.forEach((campaignId) => {
      const campaign = campaignUserMap.get(campaignId);
      if (!campaign) return;
      campaign.userIds.forEach((userId) => {
        ensureAccessEntry(userId);
        accessMap.get(userId)?.writeContexts.add(campaign.label);
      });
    });

    readCharacterIds.forEach((characterId) => {
      const character = characterUserMap.get(characterId);
      if (!character) return;
      ensureAccessEntry(character.userId);
      accessMap.get(character.userId)?.readContexts.add(character.label);
    });

    writeCharacterIds.forEach((characterId) => {
      const character = characterUserMap.get(characterId);
      if (!character) return;
      ensureAccessEntry(character.userId);
      accessMap.get(character.userId)?.writeContexts.add(character.label);
    });

    const changes = await prisma.systemAudit.findMany({
      where: { entityKey: "entities", entityId: id },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" }
    });

    const world = await prisma.world.findUnique({
      where: { id: entity.worldId },
      select: {
        primaryArchitectId: true,
        architects: { select: { userId: true } }
      }
    });
    const architectIds = world
      ? [
          world.primaryArchitectId,
          ...world.architects.map((entry) => entry.userId)
        ].filter(Boolean)
      : [];
    const missingArchitectIds = architectIds.filter((id) => !userDirectory.has(id));
    if (missingArchitectIds.length > 0) {
      const architectUsers = await prisma.user.findMany({
        where: { id: { in: missingArchitectIds } },
        select: { id: true, name: true, email: true }
      });
      architectUsers.forEach((entry) => userDirectory.set(entry.id, entry));
    }

    architectIds.forEach((architectId) => {
      ensureAccessEntry(architectId);
      const accessEntry = accessMap.get(architectId);
      if (!accessEntry) return;
      accessEntry.readContexts.add("Architect");
      accessEntry.writeContexts.add("Architect");
    });

    const accessSummary = Array.from(accessMap.values())
      .map((entry) => ({
        id: entry.user.id,
        name: entry.user.name,
        email: entry.user.email,
        readContexts: Array.from(entry.readContexts).sort(),
        writeContexts: Array.from(entry.writeContexts).sort()
      }))
      .sort((a, b) => {
        const labelA = (a.name ?? a.email).toLowerCase();
        const labelB = (b.name ?? b.email).toLowerCase();
        return labelA.localeCompare(labelB);
      });

    res.json({
      access: accessSummary,
      changes: changes.map((entry) => ({
        id: entry.id,
        action: entry.action,
        createdAt: entry.createdAt,
        actor: entry.actor,
        details: entry.details
      }))
    });
  });

  app.put("/api/entities/:id/access", requireAuth, async (req, res) => {
  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const { id } = req.params;
  const entity = await prisma.entity.findUnique({
    where: { id },
    select: { worldId: true }
  });
  if (!entity) {
    res.status(404).json({ error: "Entity not found." });
    return;
  }

    const isArchitect = await isWorldArchitect(user.id, entity.worldId);
    const isGm =
      (await isWorldGameMaster(user.id, entity.worldId)) ||
      (await isWorldGm(user.id, entity.worldId));
    if (!isAdmin(user) && !isArchitect && !isGm) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const existingAccess = await prisma.entityAccess.findMany({ where: { entityId: id } });
    const currentSignature = buildAccessSignature(existingAccess);

    const { read, write } = req.body as {
      read?: { global?: boolean; campaigns?: string[]; characters?: string[] };
      write?: { global?: boolean; campaigns?: string[]; characters?: string[] };
    };

  const accessEntries: EntityAccessEntry[] = [];
  if (read?.global) {
    accessEntries.push({
      entityId: id,
      accessType: EntityAccessType.READ,
      scopeType: EntityAccessScope.GLOBAL
    });
  }
  read?.campaigns?.forEach((campaignId) =>
    accessEntries.push({
      entityId: id,
      accessType: EntityAccessType.READ,
      scopeType: EntityAccessScope.CAMPAIGN,
      scopeId: campaignId
    })
  );
  read?.characters?.forEach((characterId) =>
    accessEntries.push({
      entityId: id,
      accessType: EntityAccessType.READ,
      scopeType: EntityAccessScope.CHARACTER,
      scopeId: characterId
    })
  );

  if (write?.global) {
    accessEntries.push({
      entityId: id,
      accessType: EntityAccessType.WRITE,
      scopeType: EntityAccessScope.GLOBAL
    });
  }
  write?.campaigns?.forEach((campaignId) =>
    accessEntries.push({
      entityId: id,
      accessType: EntityAccessType.WRITE,
      scopeType: EntityAccessScope.CAMPAIGN,
      scopeId: campaignId
    })
  );
    write?.characters?.forEach((characterId) =>
      accessEntries.push({
        entityId: id,
        accessType: EntityAccessType.WRITE,
        scopeType: EntityAccessScope.CHARACTER,
        scopeId: characterId
      })
    );

    const nextSignature = buildAccessSignature(accessEntries);
    const accessChanged = currentSignature !== nextSignature;

    const operations: Prisma.PrismaPromise<unknown>[] = [
      prisma.entityAccess.deleteMany({ where: { entityId: id } }),
      prisma.entityAccess.createMany({ data: accessEntries })
    ];

    if (accessChanged) {
      operations.push(
        prisma.systemAudit.create({
          data: {
            entityKey: "entities",
            entityId: id,
            action: "access_update",
            actorId: user.id,
            details: { read: read ?? null, write: write ?? null }
          }
        })
      );
    }

    await prisma.$transaction(operations);

    res.json({ ok: true });
  });

  app.get("/api/entities/:id/notes", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;

    const entity = await prisma.entity.findUnique({
      where: { id },
      select: { id: true, worldId: true }
    });
    if (!entity) {
      res.status(404).json({ error: "Entity not found." });
      return;
    }

    const accessFilter = await buildEntityAccessFilter(user, entity.worldId, campaignId, characterId);
    const canRead = await prisma.entity.findFirst({
      where: { id, ...accessFilter },
      select: { id: true }
    });
    if (!canRead) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const isAdminUser = isAdmin(user);
    const isArchitect = await isWorldArchitect(user.id, entity.worldId);
    const isWorldGmFlag = await isWorldGameMaster(user.id, entity.worldId);
    const isContextCampaignGm = campaignId ? await isCampaignGm(user.id, campaignId) : false;

    const baseWhere: Prisma.NoteWhereInput = {
      entityId: id,
      campaignId: campaignId ?? null
    };

    const notes = await prisma.note.findMany({
      where: baseWhere,
      include: {
        author: { select: { id: true, name: true, email: true } },
        character: { select: { id: true, name: true } },
        tags: true,
        shares: { select: { characterId: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    const playerCharacterIds = campaignId
      ? await prisma.characterCampaign.findMany({
          where: { campaignId, character: { playerId: user.id } },
          select: { characterId: true }
        })
      : [];
    const playerCharacterIdSet = new Set(playerCharacterIds.map((entry) => entry.characterId));

    const canSeePrivate = isAdminUser || isArchitect || isWorldGmFlag;
    const visibleNotes = notes.filter((note) => {
      if (isAdminUser) return true;
      if (note.visibility === NoteVisibility.GM) {
        if (!campaignId) return false;
        if (isContextCampaignGm) return true;
        if (note.shareWithArchitect && isArchitect) return true;
        if (note.shares.some((share) => playerCharacterIdSet.has(share.characterId))) {
          return true;
        }
        return false;
      }
      if (note.visibility === NoteVisibility.SHARED) return true;
      if (note.authorId === user.id) return true;
      if (campaignId && isContextCampaignGm) return true;
      if (canSeePrivate) return true;
      return false;
    });

    const world = await prisma.world.findUnique({
      where: { id: entity.worldId },
      select: {
        primaryArchitectId: true,
        architects: { select: { userId: true } }
      }
    });
    const architectIds = new Set<string>(
      world
        ? [world.primaryArchitectId, ...world.architects.map((entry) => entry.userId)]
        : []
    );
    const campaignIds = Array.from(
      new Set(visibleNotes.map((note) => note.campaignId).filter(Boolean))
    ) as string[];
    const campaigns = campaignIds.length
      ? await prisma.campaign.findMany({
          where: { id: { in: campaignIds } },
          select: { id: true, gmUserId: true }
        })
      : [];
    const campaignGmMap = new Map(campaigns.map((campaign) => [campaign.id, campaign.gmUserId]));

    const entityTagIds = Array.from(
      new Set(
        visibleNotes
          .flatMap((note) => note.tags)
          .filter((tag) => tag.tagType === NoteTagType.ENTITY)
          .map((tag) => tag.targetId)
      )
    );

    const accessibleTagIds = new Set<string>();
    if (entityTagIds.length > 0) {
      const entityAccessFilter = await buildEntityAccessFilter(
        user,
        entity.worldId,
        campaignId,
        characterId
      );
      const accessibleEntities = await prisma.entity.findMany({
        where: { id: { in: entityTagIds }, ...entityAccessFilter },
        select: { id: true }
      });
      accessibleEntities.forEach((entry) => accessibleTagIds.add(entry.id));
    }

    res.json(
      visibleNotes.map((note) => {
        const authorBase = note.author.name ?? note.author.email;
        const authorLabel = note.character?.name
          ? `${note.character.name} played by ${authorBase}`
          : authorBase;
        const isArchitectAuthor = architectIds.has(note.authorId);
        const isGmAuthor = note.campaignId
          ? campaignGmMap.get(note.campaignId) === note.authorId
          : false;
        const authorRoleLabel =
          note.visibility === NoteVisibility.GM
            ? "GM"
            : note.visibility === NoteVisibility.SHARED
              ? isArchitectAuthor
                ? "Architect"
                : isGmAuthor
                  ? "GM"
                  : null
              : null;

        return {
          id: note.id,
          body: note.body,
          visibility: note.visibility,
          shareWithArchitect: note.shareWithArchitect,
          shareCharacterIds: note.shares.map((share) => share.characterId),
          createdAt: note.createdAt,
          author: note.author,
          authorLabel,
          authorRoleLabel,
          tags: note.tags.map((tag) => ({
            id: tag.id,
            tagType: tag.tagType,
            targetId: tag.targetId,
            label: tag.label,
            canAccess: tag.tagType === NoteTagType.ENTITY && accessibleTagIds.has(tag.targetId)
          }))
        };
      })
    );
  });

  app.post("/api/entities/:id/notes", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const { id } = req.params;
    const { body, visibility, campaignId, characterId, shareWithArchitect, shareCharacterIds } =
      req.body as {
      body?: string;
      visibility?: string;
      campaignId?: string | null;
      characterId?: string | null;
      shareWithArchitect?: boolean;
      shareCharacterIds?: string[];
    };

    if (!body || body.trim() === "") {
      res.status(400).json({ error: "Note body is required." });
      return;
    }

    const entity = await prisma.entity.findUnique({
      where: { id },
      select: { id: true, worldId: true }
    });
    if (!entity) {
      res.status(404).json({ error: "Entity not found." });
      return;
    }

    const accessFilter = await buildEntityAccessFilter(
      user,
      entity.worldId,
      campaignId ?? undefined,
      characterId ?? undefined
    );
    const canRead = await prisma.entity.findFirst({
      where: { id, ...accessFilter },
      select: { id: true }
    });
    if (!canRead) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const resolvedVisibility =
      visibility === "PRIVATE" || visibility === "SHARED" || visibility === "GM"
        ? (visibility as NoteVisibility)
        : NoteVisibility.SHARED;

    if (resolvedVisibility === NoteVisibility.SHARED && !campaignId) {
      res.status(400).json({ error: "Shared notes require a campaign context." });
      return;
    }
    if (resolvedVisibility === NoteVisibility.GM && !campaignId) {
      res.status(400).json({ error: "GM notes require a campaign context." });
      return;
    }

    const campaign = campaignId
      ? await prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { id: true, worldId: true, gmUserId: true }
        })
      : null;
    if (campaignId && !campaign) {
      res.status(400).json({ error: "Campaign not found." });
      return;
    }
    if (campaign && campaign.worldId !== entity.worldId) {
      res.status(400).json({ error: "Campaign world mismatch." });
      return;
    }

    const character = characterId
      ? await prisma.character.findUnique({
          where: { id: characterId },
          select: { id: true, worldId: true, playerId: true }
        })
      : null;
    if (characterId && !character) {
      res.status(400).json({ error: "Character not found." });
      return;
    }
    if (character && character.worldId !== entity.worldId) {
      res.status(400).json({ error: "Character world mismatch." });
      return;
    }

    if (campaignId && characterId) {
      const inCampaign = await prisma.characterCampaign.findFirst({
        where: { campaignId, characterId }
      });
      if (!inCampaign) {
        res.status(400).json({ error: "Character is not in the campaign." });
        return;
      }
    }

    const isArchitect = await isWorldArchitect(user.id, entity.worldId);
    const isWorldGmFlag = await isWorldGameMaster(user.id, entity.worldId);
    const isCampaignGmFlag = campaignId ? campaign?.gmUserId === user.id : false;
    const canAuthor = isAdmin(user) || isArchitect || isWorldGmFlag || isCampaignGmFlag;

    if (!campaignId && !isAdmin(user) && !isArchitect) {
      res.status(403).json({ error: "Campaign context required." });
      return;
    }

    if (!canAuthor) {
      if (!character || !campaignId || character.playerId !== user.id) {
        res.status(403).json({ error: "Player context required." });
        return;
      }
    }

    if (resolvedVisibility === NoteVisibility.GM && !isCampaignGmFlag) {
      res.status(403).json({ error: "Only the campaign GM can write GM notes." });
      return;
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
        where: { campaignId: campaignId as string, characterId: { in: shareCharacterIdList } },
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

    if (entityTagIds.length > 0) {
      const entityAccessFilter = await buildEntityAccessFilter(
        user,
        entity.worldId,
        campaignId ?? undefined,
        characterId ?? undefined
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

    const created = await prisma.$transaction(async (tx) => {
      const note = await tx.note.create({
        data: {
          entityId: id,
          authorId: user.id,
          campaignId: campaignId ?? null,
          characterId: characterId ?? null,
          visibility: resolvedVisibility,
          shareWithArchitect:
            resolvedVisibility === NoteVisibility.GM ? Boolean(shareWithArchitect) : false,
          body
        },
        include: {
          author: { select: { id: true, name: true, email: true } },
          character: { select: { id: true, name: true } }
        }
      });

      if (tags.length > 0) {
        await tx.noteTag.createMany({
          data: tags.map((tag) => ({
            noteId: note.id,
            tagType: tag.tagType,
            targetId: tag.targetId,
            label: tag.label
          }))
        });
      }

      if (resolvedVisibility === NoteVisibility.GM && shareCharacterIdList.length > 0) {
        await tx.noteShare.createMany({
          data: shareCharacterIdList.map((characterId) => ({
            noteId: note.id,
            characterId
          })),
          skipDuplicates: true
        });
      }

      return note;
    });

    const noteTags = await prisma.noteTag.findMany({ where: { noteId: created.id } });
    const noteShares = await prisma.noteShare.findMany({
      where: { noteId: created.id },
      select: { characterId: true }
    });

    const authorBase = created.author.name ?? created.author.email;
    const authorLabel = created.character?.name
      ? `${created.character.name} played by ${authorBase}`
      : authorBase;
    const authorRoleLabel =
      created.visibility === NoteVisibility.GM
        ? "GM"
        : created.visibility === NoteVisibility.SHARED
          ? isArchitect
            ? "Architect"
            : isCampaignGmFlag
              ? "GM"
              : null
          : null;

    res.status(201).json({
      id: created.id,
      body: created.body,
      visibility: created.visibility,
      shareWithArchitect: created.shareWithArchitect,
      shareCharacterIds: noteShares.map((share) => share.characterId),
      createdAt: created.createdAt,
      author: created.author,
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

    const entity = await prisma.entity.findUnique({
      where: { id: note.entityId },
      select: { id: true, worldId: true }
    });
    if (!entity) {
      res.status(404).json({ error: "Entity not found." });
      return;
    }

    const accessFilter = await buildEntityAccessFilter(
      user,
      entity.worldId,
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

    if (entityTagIds.length > 0) {
      const entityAccessFilter = await buildEntityAccessFilter(
        user,
        entity.worldId,
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
      where: { id: entity.worldId },
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

  app.get("/api/entity-tags", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    const query = typeof req.query.query === "string" ? req.query.query : undefined;
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId = typeof req.query.characterId === "string" ? req.query.characterId : undefined;

    if (!worldId) {
      res.status(400).json({ error: "worldId is required." });
      return;
    }

    const accessFilter = await buildEntityAccessFilter(user, worldId, campaignId, characterId);
    const where: Prisma.EntityWhereInput = {
      ...accessFilter
    };

    if (query && query.trim() !== "") {
      where.name = { contains: query.trim(), mode: Prisma.QueryMode.insensitive };
    }

    const entities = await prisma.entity.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 25
    });

    res.json(entities.map((entity) => ({ id: entity.id, label: entity.name })));
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
  void backfillSeededViews(["entity_field_choices.list", "entity_field_choices.form"]);
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

export { app };

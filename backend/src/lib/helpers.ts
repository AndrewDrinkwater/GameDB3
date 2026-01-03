import express from "express";
import dotenv from "dotenv";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import {
  Prisma,
  EntityAccessScope,
  EntityAccessType,
  EntityFormSectionLayout,
  EntityFieldType,
  LocationFieldType,
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
import prisma from "./prismaClient";
import { canAccessWorld, isWorldArchitect } from "./permissions";

dotenv.config();

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

const getSystemPropertyString = async (key: string, fallback: string) => {
  const property = await prisma.systemProperty.findUnique({ where: { key } });
  if (!property) return fallback;
  const value = property.value?.trim();
  return value ? value : fallback;
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

type EntityFieldRecord = Prisma.EntityFieldGetPayload<{
  include: { choiceList: { include: { options: true } } };
}>;

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

type LocationFieldRecord = Prisma.LocationTypeFieldGetPayload<{
  include: { choiceList: { include: { options: true } } };
}>;

type LocationFieldValueWrite = {
  locationId: string;
  fieldId: string;
  valueString?: string | null;
  valueText?: string | null;
  valueBoolean?: boolean | null;
  valueNumber?: number | null;
  valueJson?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
};

type LocationAccessEntry = {
  locationId: string;
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
  },
  "packs.entity_type_templates": {
    key: "packs.entity_type_templates",
    title: "Entity Templates",
    parentEntityKey: "packs",
    relatedEntityKey: "entity_type_templates",
    joinEntityKey: "packEntityTypeTemplate",
    parentFieldKey: "packId",
    relatedFieldKey: "id",
    listOrder: 1,
    adminOnly: true,
    fields: [
      { fieldKey: "name", label: "Name", source: RelatedListFieldSource.RELATED, listOrder: 1 },
      { fieldKey: "isCore", label: "Core", source: RelatedListFieldSource.RELATED, listOrder: 2 },
      { fieldKey: "category", label: "Category", source: RelatedListFieldSource.RELATED, listOrder: 3 }
    ]
  },
  "packs.location_type_templates": {
    key: "packs.location_type_templates",
    title: "Location Templates",
    parentEntityKey: "packs",
    relatedEntityKey: "location_type_templates",
    joinEntityKey: "packLocationTypeTemplate",
    parentFieldKey: "packId",
    relatedFieldKey: "id",
    listOrder: 2,
    adminOnly: true,
    fields: [
      { fieldKey: "name", label: "Name", source: RelatedListFieldSource.RELATED, listOrder: 1 },
      { fieldKey: "isCore", label: "Core", source: RelatedListFieldSource.RELATED, listOrder: 2 }
    ]
  },
  "packs.relationship_type_templates": {
    key: "packs.relationship_type_templates",
    title: "Relationship Templates",
    parentEntityKey: "packs",
    relatedEntityKey: "relationship_type_templates",
    joinEntityKey: "packRelationshipTypeTemplate",
    parentFieldKey: "packId",
    relatedFieldKey: "id",
    listOrder: 3,
    adminOnly: true,
    fields: [
      { fieldKey: "name", label: "Name", source: RelatedListFieldSource.RELATED, listOrder: 1 },
      { fieldKey: "isPeerable", label: "Peerable", source: RelatedListFieldSource.RELATED, listOrder: 2 }
    ]
  },
  "entity_types.relationship_rules_from": {
    key: "entity_types.relationship_rules_from",
    title: "Relationship Rules (From)",
    parentEntityKey: "entity_types",
    relatedEntityKey: "relationship_type_rules",
    joinEntityKey: "relationshipTypeRuleFrom",
    parentFieldKey: "fromEntityTypeId",
    relatedFieldKey: "id",
    listOrder: 2,
    adminOnly: false,
    fields: [
      { fieldKey: "relationshipTypeName", label: "Relationship", source: RelatedListFieldSource.JOIN, listOrder: 1 },
      { fieldKey: "toEntityTypeName", label: "To Entity Type", source: RelatedListFieldSource.JOIN, listOrder: 2 }
    ]
  },
  "entity_types.relationship_rules_to": {
    key: "entity_types.relationship_rules_to",
    title: "Relationship Rules (To)",
    parentEntityKey: "entity_types",
    relatedEntityKey: "relationship_type_rules",
    joinEntityKey: "relationshipTypeRuleTo",
    parentFieldKey: "toEntityTypeId",
    relatedFieldKey: "id",
    listOrder: 3,
    adminOnly: false,
    fields: [
      { fieldKey: "relationshipTypeName", label: "Relationship", source: RelatedListFieldSource.JOIN, listOrder: 1 },
      { fieldKey: "fromEntityTypeName", label: "From Entity Type", source: RelatedListFieldSource.JOIN, listOrder: 2 }
    ]
  },
  "relationship_types.rules": {
    key: "relationship_types.rules",
    title: "Relationship Rules",
    parentEntityKey: "relationship_types",
    relatedEntityKey: "relationship_type_rules",
    joinEntityKey: "relationshipTypeRuleRelationship",
    parentFieldKey: "relationshipTypeId",
    relatedFieldKey: "id",
    listOrder: 4,
    adminOnly: false,
    fields: [
      { fieldKey: "fromEntityTypeName", label: "From Entity Type", source: RelatedListFieldSource.JOIN, listOrder: 1 },
      { fieldKey: "toEntityTypeName", label: "To Entity Type", source: RelatedListFieldSource.JOIN, listOrder: 2 }
    ]
  },
  "location_types.parent_rules": {
    key: "location_types.parent_rules",
    title: "Location Rules (Parent)",
    parentEntityKey: "location_types",
    relatedEntityKey: "location_type_rules",
    joinEntityKey: "locationTypeRuleParent",
    parentFieldKey: "parentTypeId",
    relatedFieldKey: "id",
    listOrder: 1,
    adminOnly: false,
    fields: [
      { fieldKey: "childTypeName", label: "Child Type", source: RelatedListFieldSource.JOIN, listOrder: 1 },
      { fieldKey: "allowed", label: "Allowed", source: RelatedListFieldSource.JOIN, listOrder: 2 }
    ]
  },
  "location_types.child_rules": {
    key: "location_types.child_rules",
    title: "Location Rules (Child)",
    parentEntityKey: "location_types",
    relatedEntityKey: "location_type_rules",
    joinEntityKey: "locationTypeRuleChild",
    parentFieldKey: "childTypeId",
    relatedFieldKey: "id",
    listOrder: 2,
    adminOnly: false,
    fields: [
      { fieldKey: "parentTypeName", label: "Parent Type", source: RelatedListFieldSource.JOIN, listOrder: 1 },
      { fieldKey: "allowed", label: "Allowed", source: RelatedListFieldSource.JOIN, listOrder: 2 }
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
        fieldType: SystemFieldType.REFERENCE,
        listOrder: 7,
        formOrder: 7,
        referenceEntityKey: "location_types",
        referenceScope: "location_type"
      },
      {
        fieldKey: "choiceListId",
        label: "Choice List",
        fieldType: SystemFieldType.REFERENCE,
        listOrder: 8,
        formOrder: 8,
        referenceEntityKey: "choice_lists",
        referenceScope: "choice_list_world"
      },
      { fieldKey: "conditions", label: "Visibility Conditions", fieldType: SystemFieldType.TEXTAREA, listOrder: 9, formOrder: 9 }
    ]
  },
  "choice_lists.list": {
    key: "choice_lists.list",
    title: "Choice Lists",
    entityKey: "choice_lists",
    viewType: SystemViewType.LIST,
    endpoint: "/api/choice-lists",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "scope", label: "Scope", fieldType: SystemFieldType.SELECT, listOrder: 2, formOrder: 2, optionsListKey: "choice_scope" },
      { fieldKey: "packId", label: "Pack", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, referenceEntityKey: "packs" },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 4, formOrder: 4, referenceEntityKey: "worlds" }
    ]
  },
  "choice_lists.form": {
    key: "choice_lists.form",
    title: "Choice List",
    entityKey: "choice_lists",
    viewType: SystemViewType.FORM,
    endpoint: "/api/choice-lists",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 2, formOrder: 2 },
      { fieldKey: "scope", label: "Scope", fieldType: SystemFieldType.SELECT, listOrder: 3, formOrder: 3, required: true, optionsListKey: "choice_scope" },
      { fieldKey: "packId", label: "Pack", fieldType: SystemFieldType.REFERENCE, listOrder: 4, formOrder: 4, referenceEntityKey: "packs" },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 5, formOrder: 5, referenceEntityKey: "worlds" }
    ]
  },
  "choice_options.list": {
    key: "choice_options.list",
    title: "Choice Options",
    entityKey: "choice_options",
    viewType: SystemViewType.LIST,
    endpoint: "/api/choice-options",
    adminOnly: false,
    fields: [
      { fieldKey: "choiceListId", label: "Choice List", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, referenceEntityKey: "choice_lists" },
      { fieldKey: "value", label: "Value", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "order", label: "Order", fieldType: SystemFieldType.NUMBER, listOrder: 4, formOrder: 4 },
      { fieldKey: "isActive", label: "Active", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 }
    ]
  },
  "choice_options.form": {
    key: "choice_options.form",
    title: "Choice Option",
    entityKey: "choice_options",
    viewType: SystemViewType.FORM,
    endpoint: "/api/choice-options",
    adminOnly: false,
    fields: [
      { fieldKey: "choiceListId", label: "Choice List", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, required: true, referenceEntityKey: "choice_lists" },
      { fieldKey: "value", label: "Value", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "label", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      { fieldKey: "order", label: "Order", fieldType: SystemFieldType.NUMBER, listOrder: 4, formOrder: 4 },
      { fieldKey: "isActive", label: "Active", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 }
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
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, referenceEntityKey: "worlds" },
      { fieldKey: "currentLocationId", label: "Location", fieldType: SystemFieldType.REFERENCE, listOrder: 4, formOrder: 4, referenceEntityKey: "locations", referenceScope: "location_reference" }
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
      { fieldKey: "currentLocationId", label: "Location", fieldType: SystemFieldType.REFERENCE, listOrder: 4, formOrder: 4, required: true, referenceEntityKey: "locations", referenceScope: "location_reference" },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 5, formOrder: 5 }
    ]
  },
  "relationship_types.list": {
    key: "relationship_types.list",
    title: "Relationship Types",
    entityKey: "relationship_types",
    viewType: SystemViewType.LIST,
    endpoint: "/api/relationship-types",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "worlds" },
      { fieldKey: "fromLabel", label: "From Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "toLabel", label: "To Label", fieldType: SystemFieldType.TEXT, listOrder: 4, formOrder: 4 },
      { fieldKey: "isPeerable", label: "Peerable", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 }
    ]
  },
  "relationship_types.form": {
    key: "relationship_types.form",
    title: "Relationship Type",
    entityKey: "relationship_types",
    viewType: SystemViewType.FORM,
    endpoint: "/api/relationship-types",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "worlds" },
      { fieldKey: "fromLabel", label: "From Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      { fieldKey: "toLabel", label: "To Label", fieldType: SystemFieldType.TEXT, listOrder: 4, formOrder: 4, required: true },
      { fieldKey: "pastFromLabel", label: "Past From Label", fieldType: SystemFieldType.TEXT, listOrder: 5, formOrder: 5 },
      { fieldKey: "pastToLabel", label: "Past To Label", fieldType: SystemFieldType.TEXT, listOrder: 6, formOrder: 6 },
      { fieldKey: "isPeerable", label: "Peerable", fieldType: SystemFieldType.BOOLEAN, listOrder: 7, formOrder: 7 },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 8, formOrder: 8 },
      { fieldKey: "metadata", label: "Metadata (JSON)", fieldType: SystemFieldType.TEXTAREA, listOrder: 9, formOrder: 9 }
    ]
  },
    "relationship_type_rules.list": {
      key: "relationship_type_rules.list",
      title: "Relationship Type Rules",
      entityKey: "relationship_type_rules",
      viewType: SystemViewType.LIST,
      endpoint: "/api/relationship-type-rules",
      adminOnly: false,
      fields: [
        { fieldKey: "relationshipTypeId", label: "Relationship Type", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, referenceEntityKey: "relationship_types", referenceScope: "relationship_type" },
        { fieldKey: "fromEntityTypeId", label: "From Entity Type", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "entity_types", referenceScope: "entity_type", allowMultiple: true },
        { fieldKey: "toEntityTypeId", label: "To Entity Type", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, referenceEntityKey: "entity_types", referenceScope: "entity_type", allowMultiple: true }
      ]
    },
  "relationship_type_rules.form": {
    key: "relationship_type_rules.form",
    title: "Relationship Type Rule",
    entityKey: "relationship_type_rules",
    viewType: SystemViewType.FORM,
    endpoint: "/api/relationship-type-rules",
    adminOnly: false,
    fields: [
      { fieldKey: "relationshipTypeId", label: "Relationship Type", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, required: true, referenceEntityKey: "relationship_types", referenceScope: "relationship_type" },
      { fieldKey: "fromEntityTypeId", label: "From Entity Type", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "entity_types", referenceScope: "entity_type", allowMultiple: true },
      { fieldKey: "toEntityTypeId", label: "To Entity Type", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, required: true, referenceEntityKey: "entity_types", referenceScope: "entity_type", allowMultiple: true }
    ]
  },
  "location_types.list": {
    key: "location_types.list",
    title: "Location Types",
    entityKey: "location_types",
    viewType: SystemViewType.LIST,
    endpoint: "/api/location-types",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "worlds" },
      { fieldKey: "icon", label: "Icon", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "menu", label: "Menu", fieldType: SystemFieldType.BOOLEAN, listOrder: 4, formOrder: 4 }
    ]
  },
  "location_types.form": {
    key: "location_types.form",
    title: "Location Type",
    entityKey: "location_types",
    viewType: SystemViewType.FORM,
    endpoint: "/api/location-types",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "worlds" },
      { fieldKey: "icon", label: "Icon", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "colour", label: "Colour", fieldType: SystemFieldType.TEXT, listOrder: 4, formOrder: 4 },
      { fieldKey: "menu", label: "Menu", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 6, formOrder: 6 }
    ]
  },
  "location_type_fields.list": {
    key: "location_type_fields.list",
    title: "Location Type Fields",
    entityKey: "location_type_fields",
    viewType: SystemViewType.LIST,
    endpoint: "/api/location-type-fields",
    adminOnly: false,
    fields: [
      { fieldKey: "locationTypeId", label: "Location Type", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "fieldKey", label: "Field Key", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "fieldLabel", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "fieldType", label: "Type", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 4, optionsListKey: "location_field_type" },
      { fieldKey: "required", label: "Required", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 }
    ]
  },
  "location_type_fields.form": {
    key: "location_type_fields.form",
    title: "Location Type Field",
    entityKey: "location_type_fields",
    viewType: SystemViewType.FORM,
    endpoint: "/api/location-type-fields",
    adminOnly: false,
    fields: [
      { fieldKey: "locationTypeId", label: "Location Type", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, required: true, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "fieldKey", label: "Field Key", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "fieldLabel", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      { fieldKey: "fieldType", label: "Field Type", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 4, required: true, optionsListKey: "location_field_type" },
      { fieldKey: "required", label: "Required", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 },
      {
        fieldKey: "choiceListId",
        label: "Choice List",
        fieldType: SystemFieldType.REFERENCE,
        listOrder: 6,
        formOrder: 6,
        referenceEntityKey: "choice_lists",
        referenceScope: "choice_list_world"
      },
      { fieldKey: "listOrder", label: "List Order", fieldType: SystemFieldType.NUMBER, listOrder: 7, formOrder: 7 },
      { fieldKey: "formOrder", label: "Form Order", fieldType: SystemFieldType.NUMBER, listOrder: 8, formOrder: 8 },
      { fieldKey: "defaultValue", label: "Default Value", fieldType: SystemFieldType.TEXTAREA, listOrder: 9, formOrder: 9 },
      { fieldKey: "validationRules", label: "Validation Rules", fieldType: SystemFieldType.TEXTAREA, listOrder: 10, formOrder: 10 }
    ]
  },
  "location_type_rules.list": {
    key: "location_type_rules.list",
    title: "Location Type Rules",
    entityKey: "location_type_rules",
    viewType: SystemViewType.LIST,
    endpoint: "/api/location-type-rules",
    adminOnly: false,
    fields: [
      { fieldKey: "parentTypeId", label: "Parent Type", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "childTypeId", label: "Child Type", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "allowed", label: "Allowed", fieldType: SystemFieldType.BOOLEAN, listOrder: 3, formOrder: 3 }
    ]
  },
  "location_type_rules.form": {
    key: "location_type_rules.form",
    title: "Location Type Rule",
    entityKey: "location_type_rules",
    viewType: SystemViewType.FORM,
    endpoint: "/api/location-type-rules",
    adminOnly: false,
    fields: [
      { fieldKey: "parentTypeId", label: "Parent Type", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, required: true, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "childTypeId", label: "Child Type", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "allowed", label: "Allowed", fieldType: SystemFieldType.BOOLEAN, listOrder: 3, formOrder: 3 }
    ]
  },
  "locations.list": {
    key: "locations.list",
    title: "Locations",
    entityKey: "locations",
    viewType: SystemViewType.LIST,
    endpoint: "/api/locations",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "locationTypeId", label: "Type", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, referenceEntityKey: "worlds" },
      { fieldKey: "status", label: "Status", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 4, optionsListKey: "location_status" }
    ]
  },
  "locations.form": {
    key: "locations.form",
    title: "Location",
    entityKey: "locations",
    viewType: SystemViewType.FORM,
    endpoint: "/api/locations",
    adminOnly: false,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "worldId", label: "World", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "worlds" },
      { fieldKey: "locationTypeId", label: "Type", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, required: true, referenceEntityKey: "location_types", referenceScope: "location_type" },
      { fieldKey: "parentLocationId", label: "Parent Location", fieldType: SystemFieldType.REFERENCE, listOrder: 4, formOrder: 4, referenceEntityKey: "locations", referenceScope: "location_parent" },
      { fieldKey: "status", label: "Status", fieldType: SystemFieldType.SELECT, listOrder: 5, formOrder: 5, optionsListKey: "location_status" },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 6, formOrder: 6 }
    ]
  },
  "admin.packs.list": {
    key: "admin.packs.list",
    title: "Packs",
    entityKey: "packs",
    viewType: SystemViewType.LIST,
    endpoint: "/api/packs",
    adminOnly: true,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "posture", label: "Posture", fieldType: SystemFieldType.SELECT, listOrder: 2, formOrder: 2, optionsListKey: "pack_posture" },
      { fieldKey: "isActive", label: "Active", fieldType: SystemFieldType.BOOLEAN, listOrder: 3, formOrder: 3 }
    ]
  },
  "admin.packs.form": {
    key: "admin.packs.form",
    title: "Pack",
    entityKey: "packs",
    viewType: SystemViewType.FORM,
    endpoint: "/api/packs",
    adminOnly: true,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "posture", label: "Posture", fieldType: SystemFieldType.SELECT, listOrder: 2, formOrder: 2, required: true, optionsListKey: "pack_posture" },
      { fieldKey: "isActive", label: "Active", fieldType: SystemFieldType.BOOLEAN, listOrder: 3, formOrder: 3 },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 4, formOrder: 4 }
    ]
  },
  "admin.entity_type_templates.list": {
    key: "admin.entity_type_templates.list",
    title: "Entity Type Templates",
    entityKey: "entity_type_templates",
    viewType: SystemViewType.LIST,
    endpoint: "/api/entity-type-templates",
    adminOnly: true,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "packId", label: "Pack", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "packs" },
      { fieldKey: "category", label: "Category", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "isCore", label: "Core", fieldType: SystemFieldType.BOOLEAN, listOrder: 4, formOrder: 4 }
    ]
  },
  "admin.entity_type_templates.form": {
    key: "admin.entity_type_templates.form",
    title: "Entity Type Template",
    entityKey: "entity_type_templates",
    viewType: SystemViewType.FORM,
    endpoint: "/api/entity-type-templates",
    adminOnly: true,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "packId", label: "Pack", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "packs" },
      { fieldKey: "category", label: "Category", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "isCore", label: "Core", fieldType: SystemFieldType.BOOLEAN, listOrder: 4, formOrder: 4 },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 5, formOrder: 5 }
    ]
  },
  "admin.entity_type_template_fields.list": {
    key: "admin.entity_type_template_fields.list",
    title: "Entity Template Fields",
    entityKey: "entity_type_template_fields",
    viewType: SystemViewType.LIST,
    endpoint: "/api/entity-type-template-fields",
    adminOnly: true,
    fields: [
      { fieldKey: "templateId", label: "Template", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, referenceEntityKey: "entity_type_templates" },
      { fieldKey: "fieldKey", label: "Field Key", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "fieldLabel", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "fieldType", label: "Type", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 4, optionsListKey: "entity_field_type" },
      { fieldKey: "required", label: "Required", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 },
      { fieldKey: "defaultEnabled", label: "Enabled", fieldType: SystemFieldType.BOOLEAN, listOrder: 6, formOrder: 6 }
    ]
  },
  "admin.entity_type_template_fields.form": {
    key: "admin.entity_type_template_fields.form",
    title: "Entity Template Field",
    entityKey: "entity_type_template_fields",
    viewType: SystemViewType.FORM,
    endpoint: "/api/entity-type-template-fields",
    adminOnly: true,
    fields: [
      { fieldKey: "templateId", label: "Template", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, required: true, referenceEntityKey: "entity_type_templates" },
      { fieldKey: "fieldKey", label: "Field Key", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "fieldLabel", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      { fieldKey: "fieldType", label: "Type", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 4, required: true, optionsListKey: "entity_field_type" },
      { fieldKey: "required", label: "Required", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 },
      { fieldKey: "defaultEnabled", label: "Enabled", fieldType: SystemFieldType.BOOLEAN, listOrder: 6, formOrder: 6 },
      { fieldKey: "choiceListId", label: "Choice List", fieldType: SystemFieldType.REFERENCE, listOrder: 7, formOrder: 7, referenceEntityKey: "choice_lists", referenceScope: "choice_list_pack" },
      { fieldKey: "validationRules", label: "Validation (JSON)", fieldType: SystemFieldType.TEXTAREA, listOrder: 8, formOrder: 8 }
    ]
  },
  "admin.location_type_templates.list": {
    key: "admin.location_type_templates.list",
    title: "Location Type Templates",
    entityKey: "location_type_templates",
    viewType: SystemViewType.LIST,
    endpoint: "/api/location-type-templates",
    adminOnly: true,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "packId", label: "Pack", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "packs" },
      { fieldKey: "isCore", label: "Core", fieldType: SystemFieldType.BOOLEAN, listOrder: 3, formOrder: 3 }
    ]
  },
  "admin.location_type_templates.form": {
    key: "admin.location_type_templates.form",
    title: "Location Type Template",
    entityKey: "location_type_templates",
    viewType: SystemViewType.FORM,
    endpoint: "/api/location-type-templates",
    adminOnly: true,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "packId", label: "Pack", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "packs" },
      { fieldKey: "isCore", label: "Core", fieldType: SystemFieldType.BOOLEAN, listOrder: 3, formOrder: 3 },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 4, formOrder: 4 }
    ]
  },
  "admin.location_type_template_fields.list": {
    key: "admin.location_type_template_fields.list",
    title: "Location Template Fields",
    entityKey: "location_type_template_fields",
    viewType: SystemViewType.LIST,
    endpoint: "/api/location-type-template-fields",
    adminOnly: true,
    fields: [
      { fieldKey: "templateId", label: "Template", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, referenceEntityKey: "location_type_templates" },
      { fieldKey: "fieldKey", label: "Field Key", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "fieldLabel", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 },
      { fieldKey: "fieldType", label: "Type", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 4, optionsListKey: "location_field_type" },
      { fieldKey: "required", label: "Required", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 },
      { fieldKey: "defaultEnabled", label: "Enabled", fieldType: SystemFieldType.BOOLEAN, listOrder: 6, formOrder: 6 }
    ]
  },
  "admin.location_type_template_fields.form": {
    key: "admin.location_type_template_fields.form",
    title: "Location Template Field",
    entityKey: "location_type_template_fields",
    viewType: SystemViewType.FORM,
    endpoint: "/api/location-type-template-fields",
    adminOnly: true,
    fields: [
      { fieldKey: "templateId", label: "Template", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, required: true, referenceEntityKey: "location_type_templates" },
      { fieldKey: "fieldKey", label: "Field Key", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "fieldLabel", label: "Label", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true },
      { fieldKey: "fieldType", label: "Type", fieldType: SystemFieldType.SELECT, listOrder: 4, formOrder: 4, required: true, optionsListKey: "location_field_type" },
      { fieldKey: "required", label: "Required", fieldType: SystemFieldType.BOOLEAN, listOrder: 5, formOrder: 5 },
      { fieldKey: "defaultEnabled", label: "Enabled", fieldType: SystemFieldType.BOOLEAN, listOrder: 6, formOrder: 6 },
      { fieldKey: "choiceListId", label: "Choice List", fieldType: SystemFieldType.REFERENCE, listOrder: 7, formOrder: 7, referenceEntityKey: "choice_lists", referenceScope: "choice_list_pack" },
      { fieldKey: "validationRules", label: "Validation (JSON)", fieldType: SystemFieldType.TEXTAREA, listOrder: 8, formOrder: 8 }
    ]
  },
  "admin.location_type_rule_templates.list": {
    key: "admin.location_type_rule_templates.list",
    title: "Location Rule Templates",
    entityKey: "location_type_rule_templates",
    viewType: SystemViewType.LIST,
    endpoint: "/api/location-type-rule-templates",
    adminOnly: true,
    fields: [
      { fieldKey: "packId", label: "Pack", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, referenceEntityKey: "packs" },
      { fieldKey: "parentLocationTypeTemplateId", label: "Parent Template", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "location_type_templates" },
      { fieldKey: "childLocationTypeTemplateId", label: "Child Template", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, referenceEntityKey: "location_type_templates" }
    ]
  },
  "admin.location_type_rule_templates.form": {
    key: "admin.location_type_rule_templates.form",
    title: "Location Rule Template",
    entityKey: "location_type_rule_templates",
    viewType: SystemViewType.FORM,
    endpoint: "/api/location-type-rule-templates",
    adminOnly: true,
    fields: [
      { fieldKey: "packId", label: "Pack", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, required: true, referenceEntityKey: "packs" },
      { fieldKey: "parentLocationTypeTemplateId", label: "Parent Template", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "location_type_templates" },
      { fieldKey: "childLocationTypeTemplateId", label: "Child Template", fieldType: SystemFieldType.REFERENCE, listOrder: 3, formOrder: 3, required: true, referenceEntityKey: "location_type_templates" }
    ]
  },
  "admin.relationship_type_templates.list": {
    key: "admin.relationship_type_templates.list",
    title: "Relationship Type Templates",
    entityKey: "relationship_type_templates",
    viewType: SystemViewType.LIST,
    endpoint: "/api/relationship-type-templates",
    adminOnly: true,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1 },
      { fieldKey: "packId", label: "Pack", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, referenceEntityKey: "packs" },
      { fieldKey: "isPeerable", label: "Peerable", fieldType: SystemFieldType.BOOLEAN, listOrder: 3, formOrder: 3 }
    ]
  },
  "admin.relationship_type_templates.form": {
    key: "admin.relationship_type_templates.form",
    title: "Relationship Type Template",
    entityKey: "relationship_type_templates",
    viewType: SystemViewType.FORM,
    endpoint: "/api/relationship-type-templates",
    adminOnly: true,
    fields: [
      { fieldKey: "name", label: "Name", fieldType: SystemFieldType.TEXT, listOrder: 1, formOrder: 1, required: true },
      { fieldKey: "packId", label: "Pack", fieldType: SystemFieldType.REFERENCE, listOrder: 2, formOrder: 2, required: true, referenceEntityKey: "packs" },
      { fieldKey: "isPeerable", label: "Peerable", fieldType: SystemFieldType.BOOLEAN, listOrder: 3, formOrder: 3 },
      { fieldKey: "fromLabel", label: "From Label", fieldType: SystemFieldType.TEXT, listOrder: 4, formOrder: 4, required: true },
      { fieldKey: "toLabel", label: "To Label", fieldType: SystemFieldType.TEXT, listOrder: 5, formOrder: 5, required: true },
      { fieldKey: "pastFromLabel", label: "Past From Label", fieldType: SystemFieldType.TEXT, listOrder: 6, formOrder: 6 },
      { fieldKey: "pastToLabel", label: "Past To Label", fieldType: SystemFieldType.TEXT, listOrder: 7, formOrder: 7 },
      { fieldKey: "description", label: "Description", fieldType: SystemFieldType.TEXTAREA, listOrder: 8, formOrder: 8 }
    ]
  },
  "admin.relationship_type_template_roles.list": {
    key: "admin.relationship_type_template_roles.list",
    title: "Relationship Template Roles",
    entityKey: "relationship_type_template_roles",
    viewType: SystemViewType.LIST,
    endpoint: "/api/relationship-type-template-roles",
    adminOnly: true,
    fields: [
      { fieldKey: "relationshipTypeTemplateId", label: "Template", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, referenceEntityKey: "relationship_type_templates" },
      { fieldKey: "fromRole", label: "From Role", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2 },
      { fieldKey: "toRole", label: "To Role", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3 }
    ]
  },
  "admin.relationship_type_template_roles.form": {
    key: "admin.relationship_type_template_roles.form",
    title: "Relationship Template Role",
    entityKey: "relationship_type_template_roles",
    viewType: SystemViewType.FORM,
    endpoint: "/api/relationship-type-template-roles",
    adminOnly: true,
    fields: [
      { fieldKey: "relationshipTypeTemplateId", label: "Template", fieldType: SystemFieldType.REFERENCE, listOrder: 1, formOrder: 1, required: true, referenceEntityKey: "relationship_type_templates" },
      { fieldKey: "fromRole", label: "From Role", fieldType: SystemFieldType.TEXT, listOrder: 2, formOrder: 2, required: true },
      { fieldKey: "toRole", label: "To Role", fieldType: SystemFieldType.TEXT, listOrder: 3, formOrder: 3, required: true }
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

const canAccessLocationType = async (userId: string, locationTypeId: string) => {
  const locationType = await prisma.locationType.findUnique({
    where: { id: locationTypeId },
    select: { worldId: true }
  });
  if (!locationType) return false;
  return canAccessWorld(userId, locationType.worldId);
};

const canManageLocationType = async (userId: string, locationTypeId: string) => {
  const locationType = await prisma.locationType.findUnique({
    where: { id: locationTypeId },
    select: { worldId: true }
  });
  if (!locationType) return false;
  return isWorldArchitect(userId, locationType.worldId);
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

const buildLocationAccessFilter = async (
  user: User,
  worldId: string,
  campaignId?: string,
  characterId?: string
): Promise<Prisma.LocationWhereInput> => {
  const isArchitect = await isWorldArchitect(user.id, worldId);
  if (isArchitect && !characterId) {
    return { worldId };
  }

  const accessFilters: Prisma.LocationWhereInput[] = [
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
const sessionNoteReferencePattern = /@\[(.+?)\]\((entity|location):([^)]+)\)/g;

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

type SessionNoteReferenceInput = {
  targetType: "entity" | "location";
  targetId: string;
  label: string;
};

type SessionNoteContent = {
  version: 1;
  format: "markdown";
  text: string;
  references: SessionNoteReferenceInput[];
};

const extractSessionNoteReferences = (text: string) => {
  sessionNoteReferencePattern.lastIndex = 0;
  const references: SessionNoteReferenceInput[] = [];
  if (!text) return references;
  const seen = new Set<string>();
  let match: RegExpExecArray | null = null;
  while ((match = sessionNoteReferencePattern.exec(text))) {
    const [, label, rawType, targetId] = match;
    if (!label || !targetId) continue;
    const targetType = rawType === "location" ? "location" : "entity";
    const key = `${targetType}:${targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push({ targetType, targetId, label });
  }
  return references;
};

const normalizeSessionNoteContent = (input: unknown): SessionNoteContent | null => {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<SessionNoteContent>;
  if (typeof raw.text !== "string") return null;
  const text = raw.text.replace(/\r\n/g, "\n");
  return {
    version: 1,
    format: "markdown",
    text,
    references: extractSessionNoteReferences(text)
  };
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

const getAccessibleLocation = async (
  user: User,
  locationId: string,
  campaignId?: string,
  characterId?: string
) => {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, worldId: true, name: true }
  });
  if (!location) return null;
  const accessFilter = await buildLocationAccessFilter(
    user,
    location.worldId,
    campaignId,
    characterId
  );
  const access = await prisma.location.findFirst({
    where: { id: locationId, ...accessFilter },
    select: { id: true }
  });
  return access ? location : null;
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
): string | number | boolean | null => {
  if (
    fieldType === EntityFieldType.TEXT ||
    fieldType === EntityFieldType.CHOICE ||
    fieldType === EntityFieldType.ENTITY_REFERENCE ||
    fieldType === EntityFieldType.LOCATION_REFERENCE
  ) {
    return rawValue ? String(rawValue) : null;
  }
  if (fieldType === EntityFieldType.NUMBER) {
    const parsed = rawValue === null || rawValue === undefined ? null : Number(rawValue);
    return Number.isNaN(parsed) ? null : parsed;
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
}): string | number | boolean | null => {
  if (value.valueNumber !== null && value.valueNumber !== undefined) {
    return value.valueNumber;
  }
  if (value.valueString !== null && value.valueString !== undefined) {
    return value.valueString;
  }
  if (value.valueText !== null && value.valueText !== undefined) {
    return value.valueText;
  }
  if (value.valueBoolean !== null && value.valueBoolean !== undefined) {
    return value.valueBoolean;
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

const canWriteLocation = async (
  user: User,
  locationId: string,
  campaignId?: string,
  characterId?: string
) => {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { worldId: true }
  });
  if (!location) return false;
  if (await isWorldArchitect(user.id, location.worldId)) return true;

  const accessFilters: Prisma.LocationAccessWhereInput[] = [
    {
      locationId,
      accessType: EntityAccessType.WRITE,
      scopeType: EntityAccessScope.GLOBAL
    }
  ];

  if (campaignId) {
    accessFilters.push({
      locationId,
      accessType: EntityAccessType.WRITE,
      scopeType: EntityAccessScope.CAMPAIGN,
      scopeId: campaignId
    });
  }

  if (characterId) {
    accessFilters.push({
      locationId,
      accessType: EntityAccessType.WRITE,
      scopeType: EntityAccessScope.CHARACTER,
      scopeId: characterId
    });
  }

  const access = await prisma.locationAccess.findFirst({
    where: { OR: accessFilters }
  });

  return Boolean(access);
};

const getLabelFieldForEntity = async (entityKey: string) => {
  const defaults: Record<string, string> = {
    entity_fields: "label",
    entity_types: "name",
    entities: "name",
    relationship_types: "name",
    location_types: "name",
    locations: "name",
    location_type_fields: "fieldLabel",
    packs: "name",
    entity_type_templates: "name",
    entity_type_template_fields: "fieldLabel",
    location_type_templates: "name",
    location_type_template_fields: "fieldLabel",
    location_type_rule_templates: "id",
    relationship_type_templates: "name",
    relationship_type_template_roles: "fromRole",
    choice_lists: "name",
    choice_options: "label"
  };
  const allowed: Record<string, string[]> = {
    entity_fields: ["label", "fieldKey"],
    entity_types: ["name"],
    entities: ["name"],
    relationship_types: ["name"],
    location_types: ["name"],
    locations: ["name"],
    location_type_fields: ["fieldLabel", "fieldKey"],
    packs: ["name"],
    entity_type_templates: ["name"],
    entity_type_template_fields: ["fieldLabel", "fieldKey"],
    location_type_templates: ["name"],
    location_type_template_fields: ["fieldLabel", "fieldKey"],
    location_type_rule_templates: ["id"],
    relationship_type_templates: ["name"],
    relationship_type_template_roles: ["fromRole", "toRole"],
    choice_lists: ["name"],
    choice_options: ["label", "value"]
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

  if (entityKey === "location_types") {
    const whereClause: Prisma.LocationTypeWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const types = await prisma.locationType.findMany({
      where: whereClause,
      select: select as { id: true },
      orderBy: { name: "asc" },
      take: 25
    });

    return types.map((locationType) => {
      const labelValue = (locationType as Record<string, unknown>)[labelField];
      return {
        id: locationType.id,
        label: labelValue ? String(labelValue) : locationType.id
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

  if (entityKey === "locations") {
    const whereClause: Prisma.LocationWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const locations = await prisma.location.findMany({
      where: whereClause,
      select: select as { id: true },
      orderBy: { name: "asc" },
      take: 25
    });

    return locations.map((location) => {
      const labelValue = (location as Record<string, unknown>)[labelField];
      return {
        id: location.id,
        label: labelValue ? String(labelValue) : location.id
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

  if (entityKey === "location_type_fields") {
    const whereClause: Prisma.LocationTypeFieldWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { fieldLabel: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const fields = await prisma.locationTypeField.findMany({
      where: whereClause,
      select: select as { id: true },
      orderBy: { fieldLabel: "asc" },
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

  if (entityKey === "packs") {
    const whereClause: Prisma.PackWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const packs = await prisma.pack.findMany({
      where: whereClause,
      select: select as { id: true },
      orderBy: { name: "asc" },
      take: 25
    });

    return packs.map((pack) => {
      const labelValue = (pack as Record<string, unknown>)[labelField];
      return {
        id: pack.id,
        label: labelValue ? String(labelValue) : pack.id
      };
    });
  }

  if (entityKey === "entity_type_templates") {
    const whereClause: Prisma.EntityTypeTemplateWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const templates = await prisma.entityTypeTemplate.findMany({
      where: whereClause,
      select: select as { id: true },
      orderBy: { name: "asc" },
      take: 25
    });

    return templates.map((template) => {
      const labelValue = (template as Record<string, unknown>)[labelField];
      return {
        id: template.id,
        label: labelValue ? String(labelValue) : template.id
      };
    });
  }

  if (entityKey === "entity_type_template_fields") {
    const whereClause: Prisma.EntityTypeTemplateFieldWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { fieldLabel: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const fields = await prisma.entityTypeTemplateField.findMany({
      where: whereClause,
      select: select as { id: true },
      orderBy: { fieldLabel: "asc" },
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

  if (entityKey === "location_type_templates") {
    const whereClause: Prisma.LocationTypeTemplateWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const templates = await prisma.locationTypeTemplate.findMany({
      where: whereClause,
      select: select as { id: true },
      orderBy: { name: "asc" },
      take: 25
    });

    return templates.map((template) => {
      const labelValue = (template as Record<string, unknown>)[labelField];
      return {
        id: template.id,
        label: labelValue ? String(labelValue) : template.id
      };
    });
  }

  if (entityKey === "location_type_template_fields") {
    const whereClause: Prisma.LocationTypeTemplateFieldWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { fieldLabel: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const fields = await prisma.locationTypeTemplateField.findMany({
      where: whereClause,
      select: select as { id: true },
      orderBy: { fieldLabel: "asc" },
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

  if (entityKey === "relationship_type_templates") {
    const whereClause: Prisma.RelationshipTypeTemplateWhereInput = ids
      ? { id: { in: ids } }
      : queryValue
        ? { name: { contains: queryValue, mode: Prisma.QueryMode.insensitive } }
        : {};

    const select: Record<string, boolean> = { id: true };
    select[labelField] = true;

    const templates = await prisma.relationshipTypeTemplate.findMany({
      where: whereClause,
      select: select as { id: true },
      orderBy: { name: "asc" },
      take: 25
    });

    return templates.map((template) => {
      const labelValue = (template as Record<string, unknown>)[labelField];
      return {
        id: template.id,
        label: labelValue ? String(labelValue) : template.id
      };
    });
  }

  return [];
};

export {
  prisma,
  accessTokenPropertyKey,
  refreshTokenPropertyKey,
  defaultAccessTokenMinutes,
  defaultRefreshTokenDays,
  getCookieValue,
  getSystemPropertyNumber,
  getSystemPropertyString,
  hashToken,
  createRefreshToken,
  setRefreshCookie,
  signToken,
  verifyToken,
  normalizeListViewFilters,
  getBearerToken,
  requireAuth,
  requireSystemAdmin,
  buildAccessSignature,
  relatedListSeeds,
  entityViewSeeds,
  ensureSeededView,
  backfillSeededViews,
  ensureSeededRelatedList,
  canAccessEntityType,
  canManageEntityType,
  canAccessLocationType,
  canManageLocationType,
  buildEntityAccessFilter,
  buildLocationAccessFilter,
  extractNoteTags,
  getAccessibleEntity,
  getAccessibleLocation,
  logSystemAudit,
  normalizeEntityValue,
  getStoredEntityValue,
  canWriteEntity,
  canWriteLocation,
  getLabelFieldForEntity,
  getReferenceResults,
  extractSessionNoteReferences,
  normalizeSessionNoteContent
};

export * from "./permissions";

export type {
  AuthRequest,
  ListViewFilterRule,
  ListViewFilterGroup,
  EntityFieldRecord,
  EntityFieldValueWrite,
  EntityAccessEntry,
  LocationFieldRecord,
  LocationFieldValueWrite,
  LocationAccessEntry,
  ViewFieldSeed,
  ViewSeed,
  RelatedListFieldSeed,
  RelatedListSeed
};







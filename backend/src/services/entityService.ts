import { Prisma, EntityAccessScope, EntityAccessType, EntityFieldType } from "@prisma/client";
import type { User } from "@prisma/client";

import { buildWhereClause, FieldDefinition } from "./filterService";
import { validateEntityInput } from "./validationService";
import { ServiceError } from "./serviceError";
import prisma from "../lib/prismaClient";
import {
  EntityFieldRecord,
  EntityFieldValueWrite,
  EntityAccessEntry,
  canAccessWorld,
  buildEntityAccessFilter,
  buildLocationAccessFilter,
  canCreateEntityInWorld,
  isAdmin,
  logSystemAudit,
  normalizeEntityValue,
  getStoredEntityValue,
  canWriteEntity,
  isWorldArchitect,
  isWorldGameMaster,
  isWorldGm,
  normalizeListViewFilters
} from "../lib/helpers";
import { serializeRecordImages } from "./imageService";
import type { FilterOperator, FilterRule } from "../types/filters";

type EntityListQuery = {
  worldId?: string;
  entityTypeId?: string;
  campaignId?: string;
  characterId?: string;
  filters?: string;
  fieldKeys?: string;
};

type EntityCreatePayload = {
  worldId?: string;
  entityTypeId?: string;
  currentLocationId?: string;
  name?: string;
  description?: string | null;
  fieldValues?: Record<string, unknown>;
  contextCampaignId?: string;
  contextCharacterId?: string;
  access?: {
    read?: { global?: boolean; campaigns?: string[]; characters?: string[] };
    write?: { global?: boolean; campaigns?: string[]; characters?: string[] };
  };
};

type EntityUpdatePayload = {
  name?: string;
  description?: string | null;
  currentLocationId?: string;
  fieldValues?: Record<string, unknown>;
};

type EntityAccessContext = {
  campaignId?: string;
  characterId?: string;
};

type EntityWithValues = Prisma.EntityGetPayload<{
  include: { values: { include: { field: true } } };
}>;

type EntityValueRecord = {
  fieldId: string;
  valueString: string | null;
  valueText: string | null;
  valueBoolean: boolean | null;
  valueNumber: number | null;
  valueJson: Prisma.JsonValue | null;
};

const parseFilters = (filtersParam?: string) => {
  if (!filtersParam) return null;
  try {
    return JSON.parse(filtersParam);
  } catch {
    throw new ServiceError(400, "Invalid filters payload.");
  }
};

const normalizeFieldKeys = (value?: string) =>
  value
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

const buildFieldValuesMap = (values: Array<{
  field: { fieldKey: string };
  valueString: string | null;
  valueText: string | null;
  valueBoolean: boolean | null;
  valueNumber: number | null;
  valueJson: Prisma.JsonValue | null;
}>) => {
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
  return fieldValues;
};

export const listEntities = async ({
  user,
  query
}: {
  user: User;
  query: EntityListQuery;
}) => {
  const { worldId, entityTypeId, campaignId, characterId } = query;

  if (!worldId && !isAdmin(user)) {
    return [];
  }

  let whereClause: Prisma.EntityWhereInput = {};
  if (worldId) {
    if (isAdmin(user)) {
      whereClause = { worldId };
    } else {
      if (!(await canAccessWorld(user.id, worldId))) {
        return [];
      }
      whereClause = await buildEntityAccessFilter(user, worldId, campaignId, characterId);
    }
  }

  if (entityTypeId) {
    whereClause = { AND: [whereClause, { entityTypeId }] };
  }

  const filterGroup = normalizeListViewFilters(parseFilters(query.filters));
  const fieldKeyList = normalizeFieldKeys(query.fieldKeys);

  if ((filterGroup.rules.length > 0 || fieldKeyList.length > 0) && !entityTypeId) {
    throw new ServiceError(400, "entityTypeId is required for list filters.");
  }

  let fields: Array<{ fieldKey: string; fieldType: EntityFieldType }> = [];
  if (filterGroup.rules.length > 0 || fieldKeyList.length > 0) {
    if (!entityTypeId) {
      throw new ServiceError(400, "entityTypeId is required for list filters.");
    }
    fields = await prisma.entityField.findMany({
      where: { entityTypeId },
      select: { fieldKey: true, fieldType: true }
    });
  }

  if (filterGroup.rules.length > 0) {
    const normalizedRules: FilterRule[] = filterGroup.rules.map((rule) => ({
      fieldKey: rule.fieldKey,
      operator: rule.operator as FilterOperator,
      value: rule.value
    }));
    const fieldDefinitions: FieldDefinition[] = fields.map((field) => ({
      fieldKey: field.fieldKey,
      fieldType: field.fieldType
    }));
    const clause = buildWhereClause(normalizedRules, fieldDefinitions, {
      relation: "values",
      logic: filterGroup.logic,
      numberValidator: (value) => !Number.isNaN(value)
    });
    if (clause) {
      whereClause = { AND: [whereClause, clause as Prisma.EntityWhereInput] };
    }
  }

  const includeValues =
    fieldKeyList.length > 0
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
    return entities;
  }

  return (entities as EntityWithValues[]).map((entity) => {
    const fieldValues = buildFieldValuesMap(entity.values ?? []);
    const { values: _values, ...rest } = entity as EntityWithValues & { values?: unknown };
    return { ...rest, fieldValues };
  });
};

export const getEntityById = async ({
  user,
  entityId,
  context
}: {
  user: User;
  entityId: string;
  context?: EntityAccessContext;
}) => {
  const { campaignId, characterId } = context ?? {};
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    include: {
      values: { include: { field: true } },
      recordImages: { include: { imageAsset: { include: { variants: true } } } }
    }
  });
  if (!entity) {
    throw new ServiceError(404, "Entity not found.");
  }

  const basePayload = {
    id: entity.id,
    worldId: entity.worldId,
    entityTypeId: entity.entityTypeId,
    currentLocationId: entity.currentLocationId,
    name: entity.name,
    description: entity.description,
    createdById: entity.createdById,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    fieldValues: buildFieldValuesMap(entity.values ?? []),
    recordImages: serializeRecordImages(entity.recordImages ?? [])
  };

  if (isAdmin(user)) {
    return basePayload;
  }

  if (!(await canAccessWorld(user.id, entity.worldId))) {
    throw new ServiceError(403, "Forbidden.");
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
  const accessAllowed = isArchitect || isGm;
  const auditAllowed = accessAllowed;

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
    throw new ServiceError(403, "Forbidden.");
  }

  return { ...basePayload, accessAllowed, auditAllowed };
};

export const createEntity = async ({
  user,
  payload
}: {
  user: User;
  payload: EntityCreatePayload;
}) => {
  const {
    worldId,
    entityTypeId,
    currentLocationId,
    name,
    description,
    fieldValues,
    contextCampaignId,
    contextCharacterId,
    access
  } = payload;

  if (!worldId || !entityTypeId || !name) {
    throw new ServiceError(
      400,
      "worldId, entityTypeId, and name are required."
    );
  }

  const entityType = await prisma.entityType.findUnique({
    where: { id: entityTypeId },
    select: { worldId: true, isTemplate: true }
  });
  if (!entityType || entityType.isTemplate || entityType.worldId !== worldId) {
    throw new ServiceError(400, "Entity type must belong to the selected world.");
  }

  if (currentLocationId) {
    const location = await prisma.location.findUnique({
      where: { id: currentLocationId },
      select: { id: true, worldId: true }
    });
    if (!location || location.worldId !== worldId) {
      throw new ServiceError(400, "Location must belong to the selected world.");
    }
  }

  if (!isAdmin(user) && !(await canCreateEntityInWorld(user.id, worldId))) {
    throw new ServiceError(403, "Forbidden.");
  }

  if (!isAdmin(user) && currentLocationId) {
    const locationAccessFilter = await buildLocationAccessFilter(
      user,
      worldId,
      contextCampaignId,
      contextCharacterId
    );
    const canAccessLocation = await prisma.location.findFirst({
      where: { id: currentLocationId, ...locationAccessFilter },
      select: { id: true }
    });
    if (!canAccessLocation) {
      throw new ServiceError(403, "Location is not accessible.");
    }
  }

  const fields: EntityFieldRecord[] = await prisma.entityField.findMany({
    where: { entityTypeId },
    include: { choiceList: { include: { options: true } } }
  });
  const fieldMap = new Map(fields.map((field) => [field.fieldKey, field]));

  const entityReferenceIds = new Set<string>();
  const locationReferenceIds = new Set<string>();
  if (fieldValues) {
    for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
      const field = fieldMap.get(fieldKey);
      if (!field) continue;
      if (field.fieldType === EntityFieldType.ENTITY_REFERENCE && rawValue) {
        entityReferenceIds.add(String(rawValue));
      }
      if (field.fieldType === EntityFieldType.LOCATION_REFERENCE && rawValue) {
        locationReferenceIds.add(String(rawValue));
      }
    }
  }

  if (entityReferenceIds.size > 0) {
    const accessFilter = isAdmin(user)
      ? { worldId }
      : await buildEntityAccessFilter(
          user,
          worldId,
          contextCampaignId,
          contextCharacterId
        );
    const accessible = await prisma.entity.findMany({
      where: { id: { in: Array.from(entityReferenceIds) }, ...accessFilter },
      select: { id: true }
    });
    const accessibleIds = new Set(accessible.map((entry: { id: string }) => entry.id));
    const missing = Array.from(entityReferenceIds).filter(
      (entry) => !accessibleIds.has(entry)
    );
    if (missing.length > 0) {
      throw new ServiceError(400, "One or more referenced entities are not accessible.");
    }
  }

  if (locationReferenceIds.size > 0) {
    const accessFilter = isAdmin(user)
      ? { worldId }
      : await buildLocationAccessFilter(
          user,
          worldId,
          contextCampaignId,
          contextCharacterId
        );
    const accessible = await prisma.location.findMany({
      where: { id: { in: Array.from(locationReferenceIds) }, ...accessFilter },
      select: { id: true }
    });
    const accessibleIds = new Set(accessible.map((entry: { id: string }) => entry.id));
    const missing = Array.from(locationReferenceIds).filter(
      (entry) => !accessibleIds.has(entry)
    );
    if (missing.length > 0) {
      throw new ServiceError(400, "One or more referenced locations are not accessible.");
    }
  }

  const validationFields = fields.map((field) => ({
    fieldKey: field.fieldKey,
    fieldType: field.fieldType,
    choiceList: field.choiceList
  }));
  const validation = validateEntityInput({
    fields: validationFields,
    fieldValues,
    mode: "create"
  });
  if (validation.invalidChoices.length > 0) {
    throw new ServiceError(
      400,
      `Invalid choice values for: ${validation.invalidChoices.join(", ")}`
    );
  }
  if (validation.invalidNumbers.length > 0) {
    throw new ServiceError(
      400,
      `Invalid number values for: ${validation.invalidNumbers.join(", ")}`
    );
  }

  const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const entity = await tx.entity.create({
      data: {
        worldId,
        entityTypeId,
        currentLocationId,
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
        } else if (field.fieldType === EntityFieldType.NUMBER) {
          const numericValue =
            rawValue === null || rawValue === undefined || rawValue === ""
              ? null
              : Number(rawValue);
          valuePayload.valueNumber = Number.isNaN(numericValue) ? null : numericValue;
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

    await tx.entityAccess.createMany({ data: accessEntries });

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
        currentLocationId,
        access: access ?? null
      }
    });

    return entity;
  });

  return created;
};

export const updateEntity = async ({
  user,
  entityId,
  payload,
  context
}: {
  user: User;
  entityId: string;
  payload: EntityUpdatePayload;
  context?: EntityAccessContext;
}) => {
  const { campaignId, characterId } = context ?? {};
  const { name, description, currentLocationId, fieldValues } = payload;

  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: {
      worldId: true,
      entityTypeId: true,
      currentLocationId: true,
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
    throw new ServiceError(404, "Entity not found.");
  }

  if (!isAdmin(user) && !(await canWriteEntity(user, entityId, campaignId, characterId))) {
    throw new ServiceError(403, "Forbidden.");
  }

  const fields: EntityFieldRecord[] = await prisma.entityField.findMany({
    where: { entityTypeId: entity.entityTypeId },
    include: { choiceList: { include: { options: true } } }
  });
  const fieldMap = new Map(fields.map((field) => [field.fieldKey, field]));

  const entityReferenceIds = new Set<string>();
  const locationReferenceIds = new Set<string>();
  if (fieldValues) {
    for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
      const field = fieldMap.get(fieldKey);
      if (!field) continue;
      if (field.fieldType === EntityFieldType.ENTITY_REFERENCE && rawValue) {
        entityReferenceIds.add(String(rawValue));
      }
      if (field.fieldType === EntityFieldType.LOCATION_REFERENCE && rawValue) {
        locationReferenceIds.add(String(rawValue));
      }
    }
  }

  if (entityReferenceIds.size > 0) {
    const accessFilter = isAdmin(user)
      ? { worldId: entity.worldId }
      : await buildEntityAccessFilter(user, entity.worldId, campaignId, characterId);
    const accessible = await prisma.entity.findMany({
      where: { id: { in: Array.from(entityReferenceIds) }, ...accessFilter },
      select: { id: true }
    });
    const accessibleIds = new Set(accessible.map((entry: { id: string }) => entry.id));
    const missing = Array.from(entityReferenceIds).filter(
      (entry) => !accessibleIds.has(entry)
    );
    if (missing.length > 0) {
      throw new ServiceError(400, "One or more referenced entities are not accessible.");
    }
  }

  if (locationReferenceIds.size > 0) {
    const accessFilter = isAdmin(user)
      ? { worldId: entity.worldId }
      : await buildLocationAccessFilter(user, entity.worldId, campaignId, characterId);
    const accessible = await prisma.location.findMany({
      where: { id: { in: Array.from(locationReferenceIds) }, ...accessFilter },
      select: { id: true }
    });
    const accessibleIds = new Set(accessible.map((entry: { id: string }) => entry.id));
    const missing = Array.from(locationReferenceIds).filter(
      (entry) => !accessibleIds.has(entry)
    );
    if (missing.length > 0) {
      throw new ServiceError(400, "One or more referenced locations are not accessible.");
    }
  }

  const validationFields = fields.map((field) => ({
    fieldKey: field.fieldKey,
    fieldType: field.fieldType,
    choiceList: field.choiceList
  }));
  const validation = validateEntityInput({
    fields: validationFields,
    fieldValues,
    mode: "update"
  });
  if (validation.invalidChoices.length > 0) {
    throw new ServiceError(
      400,
      `Invalid choice values for: ${validation.invalidChoices.join(", ")}`
    );
  }
  if (validation.invalidNumbers.length > 0) {
    throw new ServiceError(
      400,
      `Invalid number values for: ${validation.invalidNumbers.join(", ")}`
    );
  }

  const storedValueMap = new Map<string, string | number | boolean | null>(
    entity.values.map((value: EntityValueRecord) => [value.fieldId, getStoredEntityValue(value)])
  );
  const changes: Array<{
    fieldKey: string;
    label: string;
    from: string | number | boolean | null;
    to: string | number | boolean | null;
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

  if (currentLocationId !== undefined && currentLocationId !== entity.currentLocationId) {
    changes.push({
      fieldKey: "currentLocationId",
      label: "Location",
      from: entity.currentLocationId,
      to: currentLocationId
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

  if (currentLocationId !== undefined && currentLocationId !== entity.currentLocationId) {
    const location = await prisma.location.findUnique({
      where: { id: currentLocationId },
      select: { worldId: true }
    });
    if (!location || location.worldId !== entity.worldId) {
      throw new ServiceError(400, "Location must belong to the entity world.");
    }
    if (!isAdmin(user)) {
      const locationAccessFilter = await buildLocationAccessFilter(
        user,
        entity.worldId,
        campaignId,
        characterId
      );
      const canAccessLocation = await prisma.location.findFirst({
        where: { id: currentLocationId, ...locationAccessFilter },
        select: { id: true }
      });
      if (!canAccessLocation) {
        throw new ServiceError(403, "Location is not accessible.");
      }
    }
  }

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const entityRecord = await tx.entity.update({
      where: { id: entityId },
      data: { name, description, currentLocationId }
    });

    if (fieldValues) {
      for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
        const field = fieldMap.get(fieldKey);
        if (!field) continue;

        const valueData: EntityFieldValueWrite = {
          entityId,
          fieldId: field.id
        };

        if (field.fieldType === EntityFieldType.TEXT || field.fieldType === EntityFieldType.CHOICE) {
          valueData.valueString = rawValue ? String(rawValue) : null;
        } else if (field.fieldType === EntityFieldType.NUMBER) {
          const numericValue =
            rawValue === null || rawValue === undefined || rawValue === ""
              ? null
              : Number(rawValue);
          valueData.valueNumber = Number.isNaN(numericValue) ? null : numericValue;
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
          valueData.valueBoolean === null &&
          valueData.valueNumber === null &&
          valueData.valueJson === undefined
        ) {
          await tx.entityFieldValue.deleteMany({
            where: { entityId, fieldId: field.id }
          });
        } else {
          await tx.entityFieldValue.upsert({
            where: { entityId_fieldId: { entityId, fieldId: field.id } },
            update: valueData,
            create: valueData
          });
        }
      }
    }

    if (changes.length > 0) {
      await logSystemAudit(tx, {
        entityKey: "entities",
        entityId,
        action: "update",
        actorId: user.id,
        details: { changes }
      });
    }

    return entityRecord;
  });

  return updated;
};

export const deleteEntity = async ({ user, entityId }: { user: User; entityId: string }) => {
  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { worldId: true, name: true }
  });
  if (!entity) {
    throw new ServiceError(404, "Entity not found.");
  }

  const isArchitect = await isWorldArchitect(user.id, entity.worldId);
  const isGm =
    (await isWorldGameMaster(user.id, entity.worldId)) ||
    (await isWorldGm(user.id, entity.worldId));
  if (!isAdmin(user) && !isArchitect && !isGm) {
    throw new ServiceError(403, "Forbidden.");
  }

  try {
    await prisma.$transaction([
      prisma.noteTag.deleteMany({ where: { note: { entityId } } }),
      prisma.note.deleteMany({ where: { entityId } }),
      prisma.systemAudit.create({
        data: {
          entityKey: "entities",
          entityId,
          action: "delete",
          actorId: user.id,
          details: { name: entity.name }
        }
      }),
      prisma.entityAccess.deleteMany({ where: { entityId } }),
      prisma.entityFieldValue.deleteMany({ where: { entityId } }),
      prisma.entity.delete({ where: { id: entityId } })
    ]);
  } catch (error) {
    console.error("Failed to delete entity.", error);
    throw new ServiceError(500, "Delete failed.");
  }
};

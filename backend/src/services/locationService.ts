import { Prisma, EntityAccessScope, EntityAccessType, LocationFieldType, LocationStatus } from "@prisma/client";
import type { User } from "@prisma/client";

import { buildWhereClause, FieldDefinition } from "./filterService";
import { ServiceError } from "./serviceError";
import prisma from "../lib/prismaClient";
import {
  LocationFieldRecord,
  LocationFieldValueWrite,
  LocationAccessEntry,
  canCreateLocationInWorld,
  canAccessWorld,
  buildLocationAccessFilter,
  canWriteLocation,
  isAdmin,
  logSystemAudit,
  isWorldArchitect,
  isWorldGameMaster,
  isWorldGm,
  buildEntityAccessFilter,
  normalizeListViewFilters
} from "../lib/helpers";
import { serializeRecordImages } from "./imageService";
import { hasLocationCycle, getAllowedLocationParentTypeIds } from "../routes/shared";
import type { FilterOperator, FilterRule } from "../types/filters";

type LocationListQuery = {
  worldId?: string;
  locationTypeId?: string;
  parentLocationId?: string;
  campaignId?: string;
  characterId?: string;
  filters?: string;
  fieldKeys?: string;
};

type LocationCreatePayload = {
  worldId?: string;
  locationTypeId?: string;
  parentLocationId?: string | null;
  name?: string;
  description?: string;
  status?: LocationStatus;
  metadata?: Prisma.InputJsonValue;
  fieldValues?: Record<string, unknown>;
  contextCampaignId?: string;
  contextCharacterId?: string;
  access?: {
    read?: { global?: boolean; campaigns?: string[]; characters?: string[] };
    write?: { global?: boolean; campaigns?: string[]; characters?: string[] };
  };
};

type LocationUpdatePayload = {
  name?: string;
  description?: string;
  parentLocationId?: string | null;
  status?: LocationStatus;
  metadata?: Prisma.InputJsonValue;
  fieldValues?: Record<string, unknown>;
};

type EntityAccessContext = {
  campaignId?: string;
  characterId?: string;
};

type LocationWithFieldValues = Prisma.LocationGetPayload<{
  include: { fieldValues: { include: { field: true } } };
}>;

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

export const listLocations = async ({
  user,
  query
}: {
  user: User;
  query: LocationListQuery;
}) => {
  const { worldId, locationTypeId, parentLocationId, campaignId, characterId } = query;

  if (!worldId && !isAdmin(user)) {
    return [];
  }

  let whereClause: Prisma.LocationWhereInput = {};
  if (worldId) {
    if (isAdmin(user)) {
      whereClause = { worldId };
    } else {
      if (!(await canAccessWorld(user.id, worldId))) {
        return [];
      }
      whereClause = await buildLocationAccessFilter(user, worldId, campaignId, characterId);
    }
  }

  if (locationTypeId) {
    whereClause = { AND: [whereClause, { locationTypeId }] };
  }
  if (parentLocationId) {
    whereClause = { AND: [whereClause, { parentLocationId }] };
  }

  const filterGroup = normalizeListViewFilters(parseFilters(query.filters));
  const fieldKeyList = normalizeFieldKeys(query.fieldKeys);

  if ((filterGroup.rules.length > 0 || fieldKeyList.length > 0) && !locationTypeId) {
    throw new ServiceError(400, "locationTypeId is required for list filters.");
  }

  let fields: Array<{ fieldKey: string; fieldType: LocationFieldType }> = [];
  if (filterGroup.rules.length > 0 || fieldKeyList.length > 0) {
    if (!locationTypeId) {
      throw new ServiceError(400, "locationTypeId is required for list filters.");
    }
    fields = await prisma.locationTypeField.findMany({
      where: { locationTypeId },
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
      relation: "fieldValues",
      logic: filterGroup.logic,
      numberValidator: Number.isFinite
    });
    if (clause) {
      whereClause = { AND: [whereClause, clause as Prisma.LocationWhereInput] };
    }
  }

  const includeValues =
    locationTypeId && fieldKeyList.length > 0
      ? {
          fieldValues: {
            where: { field: { fieldKey: { in: fieldKeyList } } },
            include: { field: true }
          }
        }
      : undefined;

  const locations = await prisma.location.findMany({
    where: whereClause,
    orderBy: { name: "asc" },
    include: includeValues
  });

  if (!includeValues) {
    return locations;
  }

  return (locations as LocationWithFieldValues[]).map((location) => {
    const fieldValues = buildFieldValuesMap(location.fieldValues ?? []);
    const { fieldValues: _fieldValues, ...rest } = location as LocationWithFieldValues & {
      fieldValues?: unknown;
    };
    return { ...rest, fieldValues };
  });
};

export const getLocationById = async ({
  user,
  locationId,
  context
}: {
  user: User;
  locationId: string;
  context?: EntityAccessContext;
}) => {
  const { campaignId, characterId } = context ?? {};
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    include: {
      fieldValues: { include: { field: true } },
      recordImages: { include: { imageAsset: { include: { variants: true } } } }
    }
  });
  if (!location) {
    throw new ServiceError(404, "Location not found.");
  }

  const basePayload = {
    id: location.id,
    worldId: location.worldId,
    locationTypeId: location.locationTypeId,
    parentLocationId: location.parentLocationId,
    status: location.status,
    metadata: location.metadata,
    name: location.name,
    description: location.description,
    createdById: location.createdById,
    createdAt: location.createdAt,
    updatedAt: location.updatedAt,
    fieldValues: buildFieldValuesMap(location.fieldValues ?? []),
    recordImages: serializeRecordImages(location.recordImages ?? [])
  };

  if (isAdmin(user)) {
    return basePayload;
  }

  if (!(await canAccessWorld(user.id, location.worldId))) {
    throw new ServiceError(403, "Forbidden.");
  }

  const accessFilter = await buildLocationAccessFilter(
    user,
    location.worldId,
    campaignId,
    characterId
  );
  const canRead = await prisma.location.findFirst({
    where: { id: location.id, ...accessFilter },
    select: { id: true }
  });
  if (!canRead) {
    throw new ServiceError(403, "Forbidden.");
  }

  const isArchitect = await isWorldArchitect(user.id, location.worldId);
  const isGm =
    (await isWorldGameMaster(user.id, location.worldId)) ||
    (await isWorldGm(user.id, location.worldId));
  const accessAllowed = isArchitect || isGm;
  const auditAllowed = accessAllowed;

  return { ...basePayload, accessAllowed, auditAllowed };
};

export const createLocation = async ({
  user,
  payload
}: {
  user: User;
  payload: LocationCreatePayload;
}) => {
  const {
    worldId,
    locationTypeId,
    parentLocationId,
    name,
    description,
    status,
    metadata,
    fieldValues,
    contextCampaignId,
    contextCharacterId,
    access
  } = payload;

  if (!worldId || !locationTypeId || !name) {
    throw new ServiceError(400, "worldId, locationTypeId, and name are required.");
  }

  const locationType = await prisma.locationType.findUnique({
    where: { id: locationTypeId },
    select: { worldId: true }
  });
  if (!locationType || locationType.worldId !== worldId) {
    throw new ServiceError(400, "Location type must belong to the selected world.");
  }

  if (parentLocationId) {
    const parent = await prisma.location.findUnique({
      where: { id: parentLocationId },
      select: { worldId: true, locationTypeId: true }
    });
    if (!parent || parent.worldId !== worldId) {
      throw new ServiceError(400, "Parent location must belong to the selected world.");
    }
    const allowedParentTypeIds = await getAllowedLocationParentTypeIds(locationTypeId, worldId);
    if (!allowedParentTypeIds.has(parent.locationTypeId)) {
      throw new ServiceError(400, "Location type rule does not allow this parent.");
    }
  }

  if (!isAdmin(user) && !(await canCreateLocationInWorld(user.id, worldId))) {
    throw new ServiceError(403, "Forbidden.");
  }

  const fields: LocationFieldRecord[] = await prisma.locationTypeField.findMany({
    where: { locationTypeId },
    include: { choiceList: { include: { options: true } } }
  });
  const fieldMap = new Map(fields.map((field) => [field.fieldKey, field]));

  const entityReferenceIds = new Set<string>();
  const locationReferenceIds = new Set<string>();
  if (fieldValues) {
    for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
      const field = fieldMap.get(fieldKey);
      if (!field) continue;
      if (field.fieldType === LocationFieldType.ENTITY_REFERENCE && rawValue) {
        entityReferenceIds.add(String(rawValue));
      }
      if (field.fieldType === LocationFieldType.LOCATION_REFERENCE && rawValue) {
        locationReferenceIds.add(String(rawValue));
      }
    }
  }

  if (entityReferenceIds.size > 0) {
    const accessFilter = isAdmin(user)
      ? { worldId }
      : await buildEntityAccessFilter(user, worldId, contextCampaignId, contextCharacterId);
    const accessible = await prisma.entity.findMany({
      where: { id: { in: Array.from(entityReferenceIds) }, ...accessFilter },
      select: { id: true }
    });
    const accessibleIds = new Set(accessible.map((entry) => entry.id));
    const missing = Array.from(entityReferenceIds).filter((id) => !accessibleIds.has(id));
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
    const accessibleIds = new Set(accessible.map((entry) => entry.id));
    const missing = Array.from(locationReferenceIds).filter((id) => !accessibleIds.has(id));
    if (missing.length > 0) {
      throw new ServiceError(400, "One or more referenced locations are not accessible.");
    }
  }

  const invalidChoices: string[] = [];
  const invalidNumbers: string[] = [];
  if (fieldValues) {
    for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
      const field = fieldMap.get(fieldKey);
      if (!field) continue;
      if (
        field.fieldType === LocationFieldType.CHOICE &&
        rawValue !== null &&
        rawValue !== undefined &&
        rawValue !== ""
      ) {
        const options = field.choiceList?.options ?? [];
        const allowed = new Set(options.filter((opt) => opt.isActive).map((opt) => opt.value));
        if (!field.choiceList || !allowed.has(String(rawValue))) {
          invalidChoices.push(fieldKey);
        }
      }
      if (
        field.fieldType === LocationFieldType.NUMBER &&
        rawValue !== null &&
        rawValue !== undefined &&
        rawValue !== ""
      ) {
        const numericValue = Number(rawValue);
        if (Number.isNaN(numericValue)) {
          invalidNumbers.push(fieldKey);
        }
      }
    }
  }
  if (invalidChoices.length > 0) {
    throw new ServiceError(
      400,
      `Invalid choice values for: ${invalidChoices.join(", ")}`
    );
  }
  if (invalidNumbers.length > 0) {
    throw new ServiceError(
      400,
      `Invalid number values for: ${invalidNumbers.join(", ")}`
    );
  }

  const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const location = await tx.location.create({
      data: {
        worldId,
        locationTypeId,
        parentLocationId: parentLocationId ?? null,
        name,
        description,
        status: status ?? LocationStatus.ACTIVE,
        metadata: metadata === undefined ? undefined : metadata,
        createdById: user.id
      }
    });

    if (fieldValues) {
      for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
        const field = fieldMap.get(fieldKey);
        if (!field) continue;
        const valuePayload: LocationFieldValueWrite = {
          locationId: location.id,
          fieldId: field.id
        };

        if (
          field.fieldType === LocationFieldType.TEXT ||
          field.fieldType === LocationFieldType.CHOICE ||
          field.fieldType === LocationFieldType.ENTITY_REFERENCE ||
          field.fieldType === LocationFieldType.LOCATION_REFERENCE
        ) {
          valuePayload.valueString =
            rawValue === null || rawValue === undefined || rawValue === ""
              ? null
              : String(rawValue);
        } else if (field.fieldType === LocationFieldType.BOOLEAN) {
          valuePayload.valueBoolean = Boolean(rawValue);
        } else if (field.fieldType === LocationFieldType.NUMBER) {
          if (rawValue === null || rawValue === undefined || rawValue === "") {
            valuePayload.valueNumber = null;
          } else {
            const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
            valuePayload.valueNumber = Number.isFinite(parsed) ? parsed : null;
          }
        }

        await tx.locationFieldValue.create({ data: valuePayload });
      }
    }

    const accessEntries: LocationAccessEntry[] = [];

    if (access?.read) {
      if (access.read.global) {
        accessEntries.push({
          locationId: location.id,
          accessType: EntityAccessType.READ,
          scopeType: EntityAccessScope.GLOBAL
        });
      }
      access.read.campaigns?.forEach((id) =>
        accessEntries.push({
          locationId: location.id,
          accessType: EntityAccessType.READ,
          scopeType: EntityAccessScope.CAMPAIGN,
          scopeId: id
        })
      );
      access.read.characters?.forEach((id) =>
        accessEntries.push({
          locationId: location.id,
          accessType: EntityAccessType.READ,
          scopeType: EntityAccessScope.CHARACTER,
          scopeId: id
        })
      );
    }

    if (access?.write) {
      if (access.write.global) {
        accessEntries.push({
          locationId: location.id,
          accessType: EntityAccessType.WRITE,
          scopeType: EntityAccessScope.GLOBAL
        });
      }
      access.write.campaigns?.forEach((id) =>
        accessEntries.push({
          locationId: location.id,
          accessType: EntityAccessType.WRITE,
          scopeType: EntityAccessScope.CAMPAIGN,
          scopeId: id
        })
      );
      access.write.characters?.forEach((id) =>
        accessEntries.push({
          locationId: location.id,
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
            locationId: location.id,
            accessType: EntityAccessType.READ,
            scopeType: EntityAccessScope.CAMPAIGN,
            scopeId: contextCampaignId
          },
          {
            locationId: location.id,
            accessType: EntityAccessType.WRITE,
            scopeType: EntityAccessScope.CAMPAIGN,
            scopeId: contextCampaignId
          }
        );
      } else {
        accessEntries.push(
          {
            locationId: location.id,
            accessType: EntityAccessType.READ,
            scopeType: EntityAccessScope.GLOBAL
          },
          {
            locationId: location.id,
            accessType: EntityAccessType.WRITE,
            scopeType: EntityAccessScope.GLOBAL
          }
        );
      }
    }

    await tx.locationAccess.createMany({ data: accessEntries });

    await logSystemAudit(tx, {
      entityKey: "locations",
      entityId: location.id,
      action: "create",
      actorId: user.id,
      details: {
        name,
        description,
        worldId,
        locationTypeId,
        parentLocationId: parentLocationId ?? null,
        status: status ?? LocationStatus.ACTIVE,
        access: access ?? null
      }
    });

    return location;
  });

  return created;
};

export const updateLocation = async ({
  user,
  locationId,
  payload,
  context
}: {
  user: User;
  locationId: string;
  payload: LocationUpdatePayload;
  context?: EntityAccessContext;
}) => {
  const { campaignId, characterId } = context ?? {};
  const { name, description, parentLocationId, status, metadata, fieldValues } = payload;

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: {
      worldId: true,
      locationTypeId: true,
      parentLocationId: true,
      name: true,
      description: true,
      status: true,
      metadata: true,
      fieldValues: {
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
  if (!location) {
    throw new ServiceError(404, "Location not found.");
  }

  if (!isAdmin(user) && !(await canWriteLocation(user, locationId, campaignId, characterId))) {
    throw new ServiceError(403, "Forbidden.");
  }

  const fields: LocationFieldRecord[] = await prisma.locationTypeField.findMany({
    where: { locationTypeId: location.locationTypeId },
    include: { choiceList: { include: { options: true } } }
  });
  const fieldMap = new Map(fields.map((field) => [field.fieldKey, field]));

  const storedValueMap = new Map(
    location.fieldValues.map((value) => {
      let stored: string | boolean | number | null = null;
      if (value.valueString !== null && value.valueString !== undefined) {
        stored = value.valueString;
      } else if (value.valueText !== null && value.valueText !== undefined) {
        stored = value.valueText;
      } else if (value.valueBoolean !== null && value.valueBoolean !== undefined) {
        stored = value.valueBoolean;
      } else if (value.valueNumber !== null && value.valueNumber !== undefined) {
        stored = value.valueNumber;
      } else if (value.valueJson !== null && value.valueJson !== undefined) {
        stored = JSON.stringify(value.valueJson);
      }
      return [value.fieldId, stored];
    })
  );

  const changes: Array<{
    fieldKey: string;
    label: string;
    from: string | boolean | number | null;
    to: string | boolean | number | null;
  }> = [];

  if (name !== undefined && name !== location.name) {
    changes.push({
      fieldKey: "name",
      label: "Name",
      from: location.name,
      to: name
    });
  }

  if (description !== undefined && description !== location.description) {
    changes.push({
      fieldKey: "description",
      label: "Description",
      from: location.description ?? null,
      to: description ?? null
    });
  }

  if (status !== undefined && status !== location.status) {
    changes.push({
      fieldKey: "status",
      label: "Status",
      from: location.status,
      to: status
    });
  }

  if (parentLocationId !== undefined && parentLocationId !== location.parentLocationId) {
    changes.push({
      fieldKey: "parentLocationId",
      label: "Parent Location",
      from: location.parentLocationId ?? null,
      to: parentLocationId ?? null
    });
  }

  if (metadata !== undefined) {
    const previous = location.metadata ? JSON.stringify(location.metadata) : null;
    const next = metadata ? JSON.stringify(metadata) : null;
    if (previous !== next) {
      changes.push({
        fieldKey: "metadata",
        label: "Metadata",
        from: previous,
        to: next
      });
    }
  }

  if (fieldValues) {
    for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
      const field = fieldMap.get(fieldKey);
      if (!field) continue;
      const previous = storedValueMap.get(field.id) ?? null;
      let next: string | boolean | number | null = null;
      if (
        field.fieldType === LocationFieldType.TEXT ||
        field.fieldType === LocationFieldType.CHOICE ||
        field.fieldType === LocationFieldType.ENTITY_REFERENCE ||
        field.fieldType === LocationFieldType.LOCATION_REFERENCE
      ) {
        next =
          rawValue === null || rawValue === undefined || rawValue === ""
            ? null
            : String(rawValue);
      } else if (field.fieldType === LocationFieldType.BOOLEAN) {
        next = Boolean(rawValue);
      } else if (field.fieldType === LocationFieldType.NUMBER) {
        if (rawValue === null || rawValue === undefined || rawValue === "") {
          next = null;
        } else {
          const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
          next = Number.isFinite(parsed) ? parsed : null;
        }
      }
      if (previous !== next) {
        changes.push({
          fieldKey,
          label: field.fieldLabel,
          from: previous,
          to: next
        });
      }
    }
  }

  if (parentLocationId !== undefined && parentLocationId !== location.parentLocationId) {
    if (parentLocationId === locationId) {
      throw new ServiceError(400, "Location cannot be its own parent.");
    }
    if (parentLocationId) {
      const parent = await prisma.location.findUnique({
        where: { id: parentLocationId },
        select: { worldId: true, locationTypeId: true }
      });
      if (!parent || parent.worldId !== location.worldId) {
        throw new ServiceError(400, "Parent location must belong to the same world.");
      }
      const allowedParentTypeIds = await getAllowedLocationParentTypeIds(
        location.locationTypeId,
        location.worldId
      );
      if (!allowedParentTypeIds.has(parent.locationTypeId)) {
        throw new ServiceError(400, "Location type rule does not allow this parent.");
      }
      if (await hasLocationCycle(locationId, parentLocationId)) {
        throw new ServiceError(400, "Location parent would create a cycle.");
      }
    }
  }

  const entityReferenceIds = new Set<string>();
  const locationReferenceIds = new Set<string>();
  if (fieldValues) {
    for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
      const field = fieldMap.get(fieldKey);
      if (!field) continue;
      if (field.fieldType === LocationFieldType.ENTITY_REFERENCE && rawValue) {
        entityReferenceIds.add(String(rawValue));
      }
      if (field.fieldType === LocationFieldType.LOCATION_REFERENCE && rawValue) {
        locationReferenceIds.add(String(rawValue));
      }
    }
  }

  if (entityReferenceIds.size > 0) {
    const accessFilter = isAdmin(user)
      ? { worldId: location.worldId }
      : await buildEntityAccessFilter(user, location.worldId, campaignId, characterId);
    const accessible = await prisma.entity.findMany({
      where: { id: { in: Array.from(entityReferenceIds) }, ...accessFilter },
      select: { id: true }
    });
    const accessibleIds = new Set(accessible.map((entry) => entry.id));
    const missing = Array.from(entityReferenceIds).filter((id) => !accessibleIds.has(id));
    if (missing.length > 0) {
      throw new ServiceError(400, "One or more referenced entities are not accessible.");
    }
  }

  if (locationReferenceIds.size > 0) {
    const accessFilter = isAdmin(user)
      ? { worldId: location.worldId }
      : await buildLocationAccessFilter(user, location.worldId, campaignId, characterId);
    const accessible = await prisma.location.findMany({
      where: { id: { in: Array.from(locationReferenceIds) }, ...accessFilter },
      select: { id: true }
    });
    const accessibleIds = new Set(accessible.map((entry) => entry.id));
    const missing = Array.from(locationReferenceIds).filter((id) => !accessibleIds.has(id));
    if (missing.length > 0) {
      throw new ServiceError(400, "One or more referenced locations are not accessible.");
    }
  }

  const invalidChoices: string[] = [];
  const invalidNumbers: string[] = [];
  if (fieldValues) {
    for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
      const field = fieldMap.get(fieldKey);
      if (!field) continue;
      if (
        field.fieldType === LocationFieldType.CHOICE &&
        rawValue !== null &&
        rawValue !== undefined &&
        rawValue !== ""
      ) {
        const options = field.choiceList?.options ?? [];
        const allowed = new Set(options.filter((opt) => opt.isActive).map((opt) => opt.value));
        if (!field.choiceList || !allowed.has(String(rawValue))) {
          invalidChoices.push(fieldKey);
        }
      }
      if (
        field.fieldType === LocationFieldType.NUMBER &&
        rawValue !== null &&
        rawValue !== undefined &&
        rawValue !== ""
      ) {
        const numericValue = Number(rawValue);
        if (Number.isNaN(numericValue)) {
          invalidNumbers.push(fieldKey);
        }
      }
    }
  }
  if (invalidChoices.length > 0) {
    throw new ServiceError(
      400,
      `Invalid choice values for: ${invalidChoices.join(", ")}`
    );
  }
  if (invalidNumbers.length > 0) {
    throw new ServiceError(
      400,
      `Invalid number values for: ${invalidNumbers.join(", ")}`
    );
  }

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const locationRecord = await tx.location.update({
      where: { id: locationId },
      data: {
        name,
        description,
        parentLocationId,
        status,
        metadata: metadata === undefined ? undefined : metadata
      }
    });

    if (fieldValues) {
      for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
        const field = fieldMap.get(fieldKey);
        if (!field) continue;

        const valueData: LocationFieldValueWrite = {
          locationId,
          fieldId: field.id
        };

        if (
          field.fieldType === LocationFieldType.TEXT ||
          field.fieldType === LocationFieldType.CHOICE ||
          field.fieldType === LocationFieldType.ENTITY_REFERENCE ||
          field.fieldType === LocationFieldType.LOCATION_REFERENCE
        ) {
          valueData.valueString =
            rawValue === null || rawValue === undefined || rawValue === ""
              ? null
              : String(rawValue);
        } else if (field.fieldType === LocationFieldType.BOOLEAN) {
          valueData.valueBoolean = Boolean(rawValue);
        } else if (field.fieldType === LocationFieldType.NUMBER) {
          if (rawValue === null || rawValue === undefined || rawValue === "") {
            valueData.valueNumber = null;
          } else {
            const parsed = typeof rawValue === "number" ? rawValue : Number(rawValue);
            valueData.valueNumber = Number.isFinite(parsed) ? parsed : null;
          }
        }

        if (
          valueData.valueString === null &&
          valueData.valueBoolean === null &&
          valueData.valueNumber === null &&
          valueData.valueJson === undefined
        ) {
          await tx.locationFieldValue.deleteMany({
            where: { locationId, fieldId: field.id }
          });
        } else {
          await tx.locationFieldValue.upsert({
            where: { locationId_fieldId: { locationId, fieldId: field.id } },
            update: valueData,
            create: valueData
          });
        }
      }
    }

    if (changes.length > 0) {
      await logSystemAudit(tx, {
        entityKey: "locations",
        entityId: locationId,
        action: "update",
        actorId: user.id,
        details: { changes }
      });
    }

    return locationRecord;
  });

  return updated;
};

export const deleteLocation = async ({
  user,
  locationId
}: {
  user: User;
  locationId: string;
}) => {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { worldId: true, name: true }
  });
  if (!location) {
    throw new ServiceError(404, "Location not found.");
  }

  const isArchitect = await isWorldArchitect(user.id, location.worldId);
  const isGm =
    (await isWorldGameMaster(user.id, location.worldId)) ||
    (await isWorldGm(user.id, location.worldId));
  if (!isAdmin(user) && !isArchitect && !isGm) {
    throw new ServiceError(403, "Forbidden.");
  }

  const childCount = await prisma.location.count({ where: { parentLocationId: locationId } });
  if (childCount > 0) {
    throw new ServiceError(409, "Location has child locations.");
  }
  const entityCount = await prisma.entity.count({ where: { currentLocationId: locationId } });
  if (entityCount > 0) {
    throw new ServiceError(409, "Location has entities assigned.");
  }

  try {
    await prisma.$transaction([
      prisma.noteTag.deleteMany({ where: { note: { locationId } } }),
      prisma.note.deleteMany({ where: { locationId } }),
      prisma.systemAudit.create({
        data: {
          entityKey: "locations",
          entityId: locationId,
          action: "delete",
          actorId: user.id,
          details: { name: location.name }
        }
      }),
      prisma.locationAccess.deleteMany({ where: { locationId } }),
      prisma.locationFieldValue.deleteMany({ where: { locationId } }),
      prisma.location.delete({ where: { id: locationId } })
    ]);
  } catch (error) {
    console.error("Failed to delete location.", error);
    throw new ServiceError(500, "Delete failed.");
  }
};

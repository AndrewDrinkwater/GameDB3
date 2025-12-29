import express from "express";
import { Prisma, EntityAccessScope, EntityAccessType, LocationFieldType, LocationStatus, NoteTagType, NoteVisibility, Role } from "@prisma/client";
import { prisma, requireAuth, isAdmin, normalizeListViewFilters, canAccessWorld, isWorldArchitect, isWorldGameMaster, isWorldGm, canCreateLocationInWorld, buildLocationAccessFilter, isCampaignGm, buildEntityAccessFilter, extractNoteTags, logSystemAudit, canWriteLocation, buildAccessSignature } from "../lib/helpers";
import type { AuthRequest, LocationFieldRecord, LocationFieldValueWrite, LocationAccessEntry } from "../lib/helpers";
import { hasLocationCycle, getAllowedLocationParentTypeIds, getWorldAccessUserIds } from "./shared";

export const registerLocationsRoutes = (app: express.Express) => {
  app.get("/api/locations", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const worldId = typeof req.query.worldId === "string" ? req.query.worldId : undefined;
    const locationTypeId =
      typeof req.query.locationTypeId === "string" ? req.query.locationTypeId : undefined;
    const parentLocationId =
      typeof req.query.parentLocationId === "string" ? req.query.parentLocationId : undefined;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId =
      typeof req.query.characterId === "string" ? req.query.characterId : undefined;
    const fieldKeysParam = typeof req.query.fieldKeys === "string" ? req.query.fieldKeys : undefined;
    const filtersParam = typeof req.query.filters === "string" ? req.query.filters : undefined;
  
    if (!worldId && !isAdmin(user)) {
      res.json([]);
      return;
    }
  
    let whereClause: Prisma.LocationWhereInput = {};
    if (worldId) {
      if (isAdmin(user)) {
        whereClause = { worldId };
      } else {
        if (!(await canAccessWorld(user.id, worldId))) {
          res.json([]);
          return;
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
      if (!locationTypeId) {
        res.status(400).json({ error: "locationTypeId is required for list filters." });
        return;
      }
    }
  
    const locationFieldMap = new Map<string, LocationFieldType>();
    if (filterGroup.rules.length > 0 || fieldKeyList.length > 0) {
      const fields = await prisma.locationTypeField.findMany({
        where: { locationTypeId },
        select: { fieldKey: true, fieldType: true }
      });
      fields.forEach((field) => locationFieldMap.set(field.fieldKey, field.fieldType));
    }
  
    const filterClauses: Prisma.LocationWhereInput[] = [];
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
  
      const fieldType = locationFieldMap.get(rule.fieldKey);
      if (!fieldType) return;
  
      const valueList = Array.isArray(rule.value)
        ? rule.value.map((item) => String(item))
        : rule.value !== undefined
          ? [String(rule.value)]
          : [];
  
      if (rule.operator === "is_set") {
        filterClauses.push({
          fieldValues: {
            some: {
              field: { fieldKey: rule.fieldKey }
            }
          }
        });
        return;
      }
      if (rule.operator === "is_not_set") {
        filterClauses.push({
          fieldValues: {
            none: {
              field: { fieldKey: rule.fieldKey }
            }
          }
        });
        return;
      }
  
      if (valueList.length === 0) return;
  
      const value = valueList[0];
      const valueFilter: Prisma.LocationFieldValueWhereInput = {
        field: { fieldKey: rule.fieldKey }
      };
  
      if (fieldType === LocationFieldType.BOOLEAN) {
        const boolValue = value === "true" || value === "1";
        if (rule.operator === "not_equals") {
          valueFilter.valueBoolean = { not: boolValue };
        } else {
          valueFilter.valueBoolean = boolValue;
        }
      } else if (fieldType === LocationFieldType.NUMBER) {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) return;
        if (rule.operator === "not_equals") {
          valueFilter.valueNumber = { not: numberValue };
        } else {
          valueFilter.valueNumber = numberValue;
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
  
      filterClauses.push({ fieldValues: { some: valueFilter } });
    });
  
    if (filterClauses.length > 0) {
      const combined =
        filterGroup.logic === "OR" ? { OR: filterClauses } : { AND: filterClauses };
      whereClause = { AND: [whereClause, combined] };
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
      res.json(locations);
      return;
    }
  
    const results = locations.map((location) => {
      const values = (location as typeof location & {
        fieldValues?: Array<{
          field: { fieldKey: string };
          valueString: string | null;
          valueText: string | null;
          valueBoolean: boolean | null;
          valueNumber: number | null;
          valueJson: Prisma.JsonValue | null;
        }>;
      }).fieldValues ?? [];
  
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
  
      const { fieldValues: _fieldValues, ...rest } =
        location as typeof location & { fieldValues?: unknown };
      return { ...rest, fieldValues };
    });
  
    res.json(results);
  });

  app.post("/api/locations", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
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
    } = req.body as {
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
  
    if (!worldId || !locationTypeId || !name) {
      res.status(400).json({ error: "worldId, locationTypeId, and name are required." });
      return;
    }
  
    const locationType = await prisma.locationType.findUnique({
      where: { id: locationTypeId },
      select: { worldId: true }
    });
    if (!locationType || locationType.worldId !== worldId) {
      res.status(400).json({ error: "Location type must belong to the selected world." });
      return;
    }
  
    if (parentLocationId) {
      const parent = await prisma.location.findUnique({
        where: { id: parentLocationId },
        select: { worldId: true, locationTypeId: true }
      });
      if (!parent || parent.worldId !== worldId) {
        res.status(400).json({ error: "Parent location must belong to the selected world." });
        return;
      }
      const allowedParentTypeIds = await getAllowedLocationParentTypeIds(
        locationTypeId,
        worldId
      );
      if (!allowedParentTypeIds.has(parent.locationTypeId)) {
        res.status(400).json({ error: "Location type rule does not allow this parent." });
        return;
      }
    }
  
    if (!isAdmin(user) && !(await canCreateLocationInWorld(user.id, worldId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
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
      const accessibleIds = new Set(accessible.map((entry) => entry.id));
      const missing = Array.from(entityReferenceIds).filter((id) => !accessibleIds.has(id));
      if (missing.length > 0) {
        res.status(400).json({ error: "One or more referenced entities are not accessible." });
        return;
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
        res.status(400).json({ error: "One or more referenced locations are not accessible." });
        return;
      }
    }

    const invalidChoices: string[] = [];
    const invalidNumbers: string[] = [];
    if (fieldValues) {
      for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
        const field = fieldMap.get(fieldKey);
        if (!field) continue;
        if (field.fieldType === LocationFieldType.CHOICE && rawValue !== null && rawValue !== undefined && rawValue !== "") {
          const options = field.choiceList?.options ?? [];
          const allowed = new Set(options.filter((opt) => opt.isActive).map((opt) => opt.value));
          if (!field.choiceList || !allowed.has(String(rawValue))) {
            invalidChoices.push(fieldKey);
          }
        }
        if (field.fieldType === LocationFieldType.NUMBER && rawValue !== null && rawValue !== undefined && rawValue !== "") {
          const numericValue = Number(rawValue);
          if (Number.isNaN(numericValue)) {
            invalidNumbers.push(fieldKey);
          }
        }
      }
    }
    if (invalidChoices.length > 0) {
      res.status(400).json({ error: `Invalid choice values for: ${invalidChoices.join(", ")}` });
      return;
    }
    if (invalidNumbers.length > 0) {
      res.status(400).json({ error: `Invalid number values for: ${invalidNumbers.join(", ")}` });
      return;
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
  
    res.status(201).json(created);
  });

  app.get("/api/locations/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId =
      typeof req.query.characterId === "string" ? req.query.characterId : undefined;
  
    const location = await prisma.location.findUnique({
      where: { id },
      include: {
        fieldValues: { include: { field: true } }
      }
    });
  
    if (!location) {
      res.status(404).json({ error: "Location not found." });
      return;
    }
  
    let accessAllowed = false;
    let auditAllowed = false;
    if (!isAdmin(user)) {
      if (!(await canAccessWorld(user.id, location.worldId))) {
        res.status(403).json({ error: "Forbidden." });
        return;
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
        res.status(403).json({ error: "Forbidden." });
        return;
      }
  
      const isArchitect = await isWorldArchitect(user.id, location.worldId);
      const isGm =
        (await isWorldGameMaster(user.id, location.worldId)) ||
        (await isWorldGm(user.id, location.worldId));
      accessAllowed = isArchitect || isGm;
      auditAllowed = accessAllowed;
    }
  
    const fieldValues: Record<string, unknown> = {};
    location.fieldValues.forEach((value) => {
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
      fieldValues
    };
  
    if (!isAdmin(user)) {
      res.json({ ...basePayload, accessAllowed, auditAllowed });
      return;
    }
  
    res.json(basePayload);
  });

  app.put("/api/locations/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId =
      typeof req.query.characterId === "string" ? req.query.characterId : undefined;
  
    const location = await prisma.location.findUnique({
      where: { id },
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
      res.status(404).json({ error: "Location not found." });
      return;
    }
  
    if (!isAdmin(user) && !(await canWriteLocation(user, id, campaignId, characterId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const { name, description, parentLocationId, status, metadata, fieldValues } = req.body as {
      name?: string;
      description?: string;
      parentLocationId?: string | null;
      status?: LocationStatus;
      metadata?: Prisma.InputJsonValue;
      fieldValues?: Record<string, unknown>;
    };
  
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
      if (parentLocationId === id) {
        res.status(400).json({ error: "Location cannot be its own parent." });
        return;
      }
      if (parentLocationId) {
        const parent = await prisma.location.findUnique({
          where: { id: parentLocationId },
          select: { worldId: true, locationTypeId: true }
        });
        if (!parent || parent.worldId !== location.worldId) {
          res.status(400).json({ error: "Parent location must belong to the same world." });
          return;
        }
        const allowedParentTypeIds = await getAllowedLocationParentTypeIds(
          location.locationTypeId,
          location.worldId
        );
        if (!allowedParentTypeIds.has(parent.locationTypeId)) {
          res.status(400).json({ error: "Location type rule does not allow this parent." });
          return;
        }
        if (await hasLocationCycle(id, parentLocationId)) {
          res.status(400).json({ error: "Location parent would create a cycle." });
          return;
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
        : await buildEntityAccessFilter(
            user,
            location.worldId,
            campaignId,
            characterId
          );
      const accessible = await prisma.entity.findMany({
        where: { id: { in: Array.from(entityReferenceIds) }, ...accessFilter },
        select: { id: true }
      });
      const accessibleIds = new Set(accessible.map((entry) => entry.id));
      const missing = Array.from(entityReferenceIds).filter((id) => !accessibleIds.has(id));
      if (missing.length > 0) {
        res.status(400).json({ error: "One or more referenced entities are not accessible." });
        return;
      }
    }
  
    if (locationReferenceIds.size > 0) {
      const accessFilter = isAdmin(user)
        ? { worldId: location.worldId }
        : await buildLocationAccessFilter(
            user,
            location.worldId,
            campaignId,
            characterId
          );
      const accessible = await prisma.location.findMany({
        where: { id: { in: Array.from(locationReferenceIds) }, ...accessFilter },
        select: { id: true }
      });
      const accessibleIds = new Set(accessible.map((entry) => entry.id));
      const missing = Array.from(locationReferenceIds).filter((id) => !accessibleIds.has(id));
      if (missing.length > 0) {
        res.status(400).json({ error: "One or more referenced locations are not accessible." });
        return;
      }
    }

    const invalidChoices: string[] = [];
    const invalidNumbers: string[] = [];
    if (fieldValues) {
      for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
        const field = fieldMap.get(fieldKey);
        if (!field) continue;
        if (field.fieldType === LocationFieldType.CHOICE && rawValue !== null && rawValue !== undefined && rawValue !== "") {
          const options = field.choiceList?.options ?? [];
          const allowed = new Set(options.filter((opt) => opt.isActive).map((opt) => opt.value));
          if (!field.choiceList || !allowed.has(String(rawValue))) {
            invalidChoices.push(fieldKey);
          }
        }
        if (field.fieldType === LocationFieldType.NUMBER && rawValue !== null && rawValue !== undefined && rawValue !== "") {
          const numericValue = Number(rawValue);
          if (Number.isNaN(numericValue)) {
            invalidNumbers.push(fieldKey);
          }
        }
      }
    }
    if (invalidChoices.length > 0) {
      res.status(400).json({ error: `Invalid choice values for: ${invalidChoices.join(", ")}` });
      return;
    }
    if (invalidNumbers.length > 0) {
      res.status(400).json({ error: `Invalid number values for: ${invalidNumbers.join(", ")}` });
      return;
    }

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const locationRecord = await tx.location.update({
        where: { id },
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
            locationId: id,
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
              where: { locationId: id, fieldId: field.id }
            });
          } else {
            await tx.locationFieldValue.upsert({
              where: { locationId_fieldId: { locationId: id, fieldId: field.id } },
              update: valueData,
              create: valueData
            });
          }
        }
      }
  
      if (changes.length > 0) {
        await logSystemAudit(tx, {
          entityKey: "locations",
          entityId: id,
          action: "update",
          actorId: user.id,
          details: { changes }
        });
      }
  
      return locationRecord;
    });
  
    res.json(updated);
  });

  app.delete("/api/locations/:id", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    try {
      const location = await prisma.location.findUnique({
        where: { id },
        select: { worldId: true, name: true }
      });
      if (!location) {
        res.status(404).json({ error: "Location not found." });
        return;
      }
  
      const isArchitect = await isWorldArchitect(user.id, location.worldId);
      const isGm =
        (await isWorldGameMaster(user.id, location.worldId)) ||
        (await isWorldGm(user.id, location.worldId));
      if (!isAdmin(user) && !isArchitect && !isGm) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
  
      const childCount = await prisma.location.count({ where: { parentLocationId: id } });
      if (childCount > 0) {
        res.status(409).json({ error: "Location has child locations." });
        return;
      }
      const entityCount = await prisma.entity.count({ where: { currentLocationId: id } });
      if (entityCount > 0) {
        res.status(409).json({ error: "Location has entities assigned." });
        return;
      }
  
      await prisma.$transaction([
        prisma.noteTag.deleteMany({ where: { note: { locationId: id } } }),
        prisma.note.deleteMany({ where: { locationId: id } }),
        prisma.systemAudit.create({
          data: {
            entityKey: "locations",
            entityId: id,
            action: "delete",
            actorId: user.id,
            details: { name: location.name }
          }
        }),
        prisma.locationAccess.deleteMany({ where: { locationId: id } }),
        prisma.locationFieldValue.deleteMany({ where: { locationId: id } }),
        prisma.location.delete({ where: { id } })
      ]);
      res.json({ ok: true });
    } catch (error) {
      console.error("Failed to delete location.", error);
      res.status(500).json({ error: "Delete failed." });
    }
  });

  app.get("/api/locations/:id/access", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const location = await prisma.location.findUnique({
      where: { id },
      select: { worldId: true }
    });
    if (!location) {
      res.status(404).json({ error: "Location not found." });
      return;
    }
  
    const isArchitect = await isWorldArchitect(user.id, location.worldId);
    const isGm =
      (await isWorldGameMaster(user.id, location.worldId)) ||
      (await isWorldGm(user.id, location.worldId));
    if (!isAdmin(user) && !isArchitect && !isGm) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const access = await prisma.locationAccess.findMany({ where: { locationId: id } });
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

  app.get("/api/locations/:id/audit", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const location = await prisma.location.findUnique({
      where: { id },
      select: { worldId: true }
    });
    if (!location) {
      res.status(404).json({ error: "Location not found." });
      return;
    }
  
    const isArchitect = await isWorldArchitect(user.id, location.worldId);
    const isGm =
      (await isWorldGameMaster(user.id, location.worldId)) ||
      (await isWorldGm(user.id, location.worldId));
    if (!isAdmin(user) && !isArchitect && !isGm) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const access = await prisma.locationAccess.findMany({ where: { locationId: id } });
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

    const worldUserIds = needsGlobal ? await getWorldAccessUserIds(location.worldId) : [];
    const [globalUsers, scopedUsers] = await Promise.all([
      worldUserIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: worldUserIds }, role: Role.USER },
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
      where: { entityKey: "locations", entityId: id },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" }
    });
  
    const world = await prisma.world.findUnique({
      where: { id: location.worldId },
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

  app.put("/api/locations/:id/access", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const location = await prisma.location.findUnique({
      where: { id },
      select: { worldId: true }
    });
    if (!location) {
      res.status(404).json({ error: "Location not found." });
      return;
    }
  
    const isArchitect = await isWorldArchitect(user.id, location.worldId);
    const isGm =
      (await isWorldGameMaster(user.id, location.worldId)) ||
      (await isWorldGm(user.id, location.worldId));
    if (!isAdmin(user) && !isArchitect && !isGm) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const existingAccess = await prisma.locationAccess.findMany({ where: { locationId: id } });
    const currentSignature = buildAccessSignature(existingAccess);
  
    const { read, write } = req.body as {
      read?: { global?: boolean; campaigns?: string[]; characters?: string[] };
      write?: { global?: boolean; campaigns?: string[]; characters?: string[] };
    };
  
    const accessEntries: LocationAccessEntry[] = [];
    if (read?.global) {
      accessEntries.push({
        locationId: id,
        accessType: EntityAccessType.READ,
        scopeType: EntityAccessScope.GLOBAL
      });
    }
    read?.campaigns?.forEach((campaignId) =>
      accessEntries.push({
        locationId: id,
        accessType: EntityAccessType.READ,
        scopeType: EntityAccessScope.CAMPAIGN,
        scopeId: campaignId
      })
    );
    read?.characters?.forEach((characterId) =>
      accessEntries.push({
        locationId: id,
        accessType: EntityAccessType.READ,
        scopeType: EntityAccessScope.CHARACTER,
        scopeId: characterId
      })
    );
  
    if (write?.global) {
      accessEntries.push({
        locationId: id,
        accessType: EntityAccessType.WRITE,
        scopeType: EntityAccessScope.GLOBAL
      });
    }
    write?.campaigns?.forEach((campaignId) =>
      accessEntries.push({
        locationId: id,
        accessType: EntityAccessType.WRITE,
        scopeType: EntityAccessScope.CAMPAIGN,
        scopeId: campaignId
      })
    );
    write?.characters?.forEach((characterId) =>
      accessEntries.push({
        locationId: id,
        accessType: EntityAccessType.WRITE,
        scopeType: EntityAccessScope.CHARACTER,
        scopeId: characterId
      })
    );
  
    const nextSignature = buildAccessSignature(accessEntries);
    const accessChanged = currentSignature !== nextSignature;
  
    const operations: Prisma.PrismaPromise<unknown>[] = [
      prisma.locationAccess.deleteMany({ where: { locationId: id } }),
      prisma.locationAccess.createMany({ data: accessEntries })
    ];
  
    if (accessChanged) {
      operations.push(
        prisma.systemAudit.create({
          data: {
            entityKey: "locations",
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

  app.get("/api/locations/:id/notes", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId =
      typeof req.query.characterId === "string" ? req.query.characterId : undefined;
  
    const location = await prisma.location.findUnique({
      where: { id },
      select: { id: true, worldId: true }
    });
    if (!location) {
      res.status(404).json({ error: "Location not found." });
      return;
    }
  
    const accessFilter = await buildLocationAccessFilter(
      user,
      location.worldId,
      campaignId,
      characterId
    );
    const canRead = await prisma.location.findFirst({
      where: { id, ...accessFilter },
      select: { id: true }
    });
    if (!canRead) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const isAdminUser = isAdmin(user);
    const isArchitect = await isWorldArchitect(user.id, location.worldId);
    const isWorldGmFlag = await isWorldGameMaster(user.id, location.worldId);
    const isContextCampaignGm = campaignId ? await isCampaignGm(user.id, campaignId) : false;
  
    const baseWhere: Prisma.NoteWhereInput = {
      locationId: id,
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
      where: { id: location.worldId },
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
    const locationTagIds = Array.from(
      new Set(
        visibleNotes
          .flatMap((note) => note.tags)
          .filter((tag) => tag.tagType === NoteTagType.LOCATION)
          .map((tag) => tag.targetId)
      )
    );
  
    const accessibleEntityTagIds = new Set<string>();
    if (entityTagIds.length > 0) {
      const entityAccessFilter = await buildEntityAccessFilter(
        user,
        location.worldId,
        campaignId,
        characterId
      );
      const accessibleEntities = await prisma.entity.findMany({
        where: { id: { in: entityTagIds }, ...entityAccessFilter },
        select: { id: true }
      });
      accessibleEntities.forEach((entry) => accessibleEntityTagIds.add(entry.id));
    }
    const accessibleLocationTagIds = new Set<string>();
    if (locationTagIds.length > 0) {
      const locationAccessFilter = await buildLocationAccessFilter(
        user,
        location.worldId,
        campaignId,
        characterId
      );
      const accessibleLocations = await prisma.location.findMany({
        where: { id: { in: locationTagIds }, ...locationAccessFilter },
        select: { id: true }
      });
      accessibleLocations.forEach((entry) => accessibleLocationTagIds.add(entry.id));
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
            canAccess:
              tag.tagType === NoteTagType.ENTITY
                ? accessibleEntityTagIds.has(tag.targetId)
                : tag.tagType === NoteTagType.LOCATION
                  ? accessibleLocationTagIds.has(tag.targetId)
                  : false
          }))
        };
      })
    );
  });

  app.get("/api/locations/:id/mentions", requireAuth, async (req, res) => {
    const user = (req as AuthRequest).user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
  
    const { id } = req.params;
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    const characterId =
      typeof req.query.characterId === "string" ? req.query.characterId : undefined;
  
    const location = await prisma.location.findUnique({
      where: { id },
      select: { id: true, worldId: true }
    });
    if (!location) {
      res.status(404).json({ error: "Location not found." });
      return;
    }
  
    const locationAccessFilter = await buildLocationAccessFilter(
      user,
      location.worldId,
      campaignId,
      characterId
    );
    const entityAccessFilter = await buildEntityAccessFilter(
      user,
      location.worldId,
      campaignId,
      characterId
    );
    const canRead = await prisma.location.findFirst({
      where: { id, ...locationAccessFilter },
      select: { id: true }
    });
    if (!canRead) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  
    const isAdminUser = isAdmin(user);
    const isArchitect = await isWorldArchitect(user.id, location.worldId);
    const isWorldGmFlag = await isWorldGameMaster(user.id, location.worldId);
    const isContextCampaignGm = campaignId ? await isCampaignGm(user.id, campaignId) : false;
  
    const baseWhere: Prisma.NoteWhereInput = {
      campaignId: campaignId ?? null,
      tags: { some: { tagType: NoteTagType.LOCATION, targetId: id } },
      OR: [{ entity: entityAccessFilter }, { location: locationAccessFilter }]
    };
  
    const notes = await prisma.note.findMany({
      where: baseWhere,
      include: {
        author: { select: { id: true, name: true, email: true } },
        character: { select: { id: true, name: true } },
        tags: true,
        shares: { select: { characterId: true } },
        entity: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } }
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
      where: { id: location.worldId },
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
    const locationTagIds = Array.from(
      new Set(
        visibleNotes
          .flatMap((note) => note.tags)
          .filter((tag) => tag.tagType === NoteTagType.LOCATION)
          .map((tag) => tag.targetId)
      )
    );
  
    const accessibleEntityTagIds = new Set<string>();
    if (entityTagIds.length > 0) {
      const entityAccessFilter = await buildEntityAccessFilter(
        user,
        location.worldId,
        campaignId,
        characterId
      );
      const accessibleEntities = await prisma.entity.findMany({
        where: { id: { in: entityTagIds }, ...entityAccessFilter },
        select: { id: true }
      });
      accessibleEntities.forEach((entry) => accessibleEntityTagIds.add(entry.id));
    }
    const accessibleLocationTagIds = new Set<string>();
    if (locationTagIds.length > 0) {
      const locAccessFilter = await buildLocationAccessFilter(
        user,
        location.worldId,
        campaignId,
        characterId
      );
      const accessibleLocations = await prisma.location.findMany({
        where: { id: { in: locationTagIds }, ...locAccessFilter },
        select: { id: true }
      });
      accessibleLocations.forEach((entry) => accessibleLocationTagIds.add(entry.id));
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
          entity: note.entity,
          location: note.location,
          tags: note.tags.map((tag) => ({
            id: tag.id,
            tagType: tag.tagType,
            targetId: tag.targetId,
            label: tag.label,
            canAccess:
              tag.tagType === NoteTagType.ENTITY
                ? accessibleEntityTagIds.has(tag.targetId)
                : tag.tagType === NoteTagType.LOCATION
                  ? accessibleLocationTagIds.has(tag.targetId)
                  : false
          }))
        };
      })
    );
  });

  app.post("/api/locations/:id/notes", requireAuth, async (req, res) => {
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
  
    const location = await prisma.location.findUnique({
      where: { id },
      select: { id: true, worldId: true }
    });
    if (!location) {
      res.status(404).json({ error: "Location not found." });
      return;
    }
  
    const accessFilter = await buildLocationAccessFilter(
      user,
      location.worldId,
      campaignId ?? undefined,
      characterId ?? undefined
    );
    const canRead = await prisma.location.findFirst({
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
    if (campaign && campaign.worldId !== location.worldId) {
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
    if (character && character.worldId !== location.worldId) {
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
  
    const isArchitect = await isWorldArchitect(user.id, location.worldId);
    const isWorldGmFlag = await isWorldGameMaster(user.id, location.worldId);
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
      const missing = shareCharacterIdList.filter((entry) => !allowed.has(entry));
      if (missing.length > 0) {
        res.status(400).json({ error: "One or more shared characters are not in the campaign." });
        return;
      }
    }
  
    const tags = extractNoteTags(body);
    const entityTagIds = tags
      .filter((tag) => tag.tagType === NoteTagType.ENTITY)
      .map((tag) => tag.targetId);
    const locationTagIds = tags
      .filter((tag) => tag.tagType === NoteTagType.LOCATION)
      .map((tag) => tag.targetId);
  
    if (entityTagIds.length > 0) {
      const entityAccessFilter = await buildEntityAccessFilter(
        user,
        location.worldId,
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
    if (locationTagIds.length > 0) {
      const locationAccessFilter = await buildLocationAccessFilter(
        user,
        location.worldId,
        campaignId ?? undefined,
        characterId ?? undefined
      );
      const accessibleLocations = await prisma.location.findMany({
        where: { id: { in: locationTagIds }, ...locationAccessFilter },
        select: { id: true }
      });
      const accessibleIds = new Set(accessibleLocations.map((entry) => entry.id));
      const missing = locationTagIds.filter((targetId) => !accessibleIds.has(targetId));
      if (missing.length > 0) {
        res.status(400).json({ error: "One or more tagged locations are not accessible." });
        return;
      }
    }
  
    const created = await prisma.$transaction(async (tx) => {
      const note = await tx.note.create({
        data: {
          locationId: id,
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

};

import { useEffect, useMemo, useState } from "react";
import { dispatchUnauthorized } from "./auth";

export type PermissionQuery = {
  token: string;
  entityKey?: string;
  recordId?: string;
  worldId?: string;
  campaignId?: string;
  characterId?: string;
  entityTypeId?: string;
  entityFieldId?: string;
  locationTypeId?: string;
  locationTypeFieldId?: string;
  isTemplate?: boolean;
  enabled?: boolean;
};

export type PermissionResult = {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

const emptyPermissions: PermissionResult = {
  canCreate: false,
  canEdit: false,
  canDelete: false
};

export const usePermissions = (query: PermissionQuery) => {
  const [permissions, setPermissions] = useState<PermissionResult>(emptyPermissions);
  const [loading, setLoading] = useState(false);

  const paramsKey = useMemo(() => {
    if (!query.entityKey) return "";
    const params = new URLSearchParams();
    params.set("entityKey", query.entityKey);
    if (query.recordId) params.set("recordId", query.recordId);
    if (query.worldId) params.set("worldId", query.worldId);
    if (query.campaignId) params.set("campaignId", query.campaignId);
    if (query.characterId) params.set("characterId", query.characterId);
    if (query.entityTypeId) params.set("entityTypeId", query.entityTypeId);
    if (query.entityFieldId) params.set("entityFieldId", query.entityFieldId);
    if (query.locationTypeId) params.set("locationTypeId", query.locationTypeId);
    if (query.locationTypeFieldId) params.set("locationTypeFieldId", query.locationTypeFieldId);
    if (query.isTemplate) params.set("isTemplate", "true");
    return params.toString();
  }, [
    query.entityKey,
    query.recordId,
    query.worldId,
    query.campaignId,
    query.characterId,
    query.entityTypeId,
    query.entityFieldId,
    query.locationTypeId,
    query.locationTypeFieldId,
    query.isTemplate
  ]);

  useEffect(() => {
    if (!query.enabled || !query.entityKey) {
      setPermissions(emptyPermissions);
      setLoading(false);
      return;
    }

    let ignore = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/permissions?${paramsKey}`, {
          headers: { Authorization: `Bearer ${query.token}` }
        });
        if (response.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (!response.ok) {
          if (!ignore) setPermissions(emptyPermissions);
          return;
        }
        const data = (await response.json()) as PermissionResult;
        if (!ignore) setPermissions(data);
      } catch {
        if (!ignore) setPermissions(emptyPermissions);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    void load();
    return () => {
      ignore = true;
    };
  }, [query.enabled, query.entityKey, query.token, paramsKey]);

  return { permissions, loading };
};

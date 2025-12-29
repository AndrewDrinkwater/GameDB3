import { useEffect, useMemo, useRef, useState } from "react";
import { dispatchUnauthorized } from "../utils/auth";
import { usePopout } from "./PopoutProvider";

type RelationshipItem = {
  id: string;
  relationshipId: string;
  relationshipTypeId: string;
  relationshipTypeName: string;
  label: string;
  direction: "peer" | "outgoing" | "incoming";
  status: "ACTIVE" | "EXPIRED";
  visibilityScope: "GLOBAL" | "CAMPAIGN" | "CHARACTER";
  visibilityRefId: string | null;
  isPeer: boolean;
  createdAt: string;
  expiredAt: string | null;
  relatedEntityId: string;
  relatedEntityName: string;
  relatedEntityTypeId: string;
};

type RelationshipResponse = {
  canManage: boolean;
  relationships: RelationshipItem[];
};

type RelationshipType = {
  id: string;
  name: string;
  fromLabel: string;
  toLabel: string;
  isPeerable: boolean;
};

type RelationshipRule = {
  relationshipTypeId: string;
  fromEntityTypeId: string;
  toEntityTypeId: string;
};

type ReferenceOption = { id: string; label: string; entityTypeId?: string };

type ReferencePickerProps = {
  token: string;
  entityKey: "entities" | "campaigns" | "characters";
  worldId?: string;
  campaignId?: string;
  characterId?: string;
  entityTypeIds?: string[];
  excludeEntityId?: string;
  value: ReferenceOption | null;
  placeholder: string;
  disabled?: boolean;
  onChange: (next: ReferenceOption | null) => void;
};

const ReferencePicker = ({
  token,
  entityKey,
  worldId,
  campaignId,
  characterId,
  entityTypeIds,
  excludeEntityId,
  value,
  placeholder,
  disabled,
  onChange
}: ReferencePickerProps) => {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ReferenceOption[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const params = new URLSearchParams({ entityKey, query });
      if (worldId) params.set("worldId", worldId);
      if (entityKey === "entities") {
        if (campaignId) params.set("campaignId", campaignId);
        if (characterId) params.set("characterId", characterId);
        if (entityTypeIds && entityTypeIds.length > 0) {
          params.set("entityTypeIds", entityTypeIds.join(","));
        }
        params.set("includeEntityTypeId", "1");
      }
      const response = await fetch(`/api/references?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) return;
      const data = (await response.json()) as Array<{
        id: string;
        label: string;
        entityTypeId?: string;
      }>;
      const filtered = excludeEntityId
        ? data.filter((item) => item.id !== excludeEntityId)
        : data;
      setOptions(
        filtered.map((item) => ({
          id: item.id,
          label: item.label,
          entityTypeId: item.entityTypeId
        }))
      );
    };

    void load();
  }, [
    token,
    entityKey,
    query,
    open,
    worldId,
    campaignId,
    characterId,
    entityTypeIds,
    excludeEntityId
  ]);

  return (
    <div
      className="reference-field"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (nextTarget && event.currentTarget.contains(nextTarget)) return;
        setOpen(false);
      }}
    >
      <input
        type="text"
        value={value?.label ?? query}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        disabled={disabled}
      />
      {open ? (
        <div className="reference-field__options">
          {options.length > 0 ? (
            options.map((option) => (
              <button
                type="button"
                key={option.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.preventDefault();
                  onChange(option);
                  setQuery("");
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))
          ) : (
            <div className="reference-field__empty">No matches.</div>
          )}
        </div>
      ) : null}
    </div>
  );
};

type VisibilityEditorProps = {
  token: string;
  worldId?: string;
  contextCampaignId?: string;
  contextCharacterId?: string;
  relationship: RelationshipItem;
  onSaved: () => void;
  onCancel: () => void;
};

const VisibilityEditor = ({
  token,
  worldId,
  contextCampaignId,
  contextCharacterId,
  relationship,
  onSaved,
  onCancel
}: VisibilityEditorProps) => {
  const [scope, setScope] = useState<RelationshipItem["visibilityScope"]>(
    relationship.visibilityScope
  );
  const [ref, setRef] = useState<ReferenceOption | null>(
    relationship.visibilityRefId
      ? { id: relationship.visibilityRefId, label: relationship.visibilityRefId }
      : null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDowngrade, setConfirmDowngrade] = useState(false);

  const scopeRank: Record<RelationshipItem["visibilityScope"], number> = {
    GLOBAL: 3,
    CAMPAIGN: 2,
    CHARACTER: 1
  };
  const isDowngrade = scopeRank[scope] < scopeRank[relationship.visibilityScope];

  useEffect(() => {
    if (scope === "GLOBAL") {
      setRef(null);
    } else if (!ref?.id) {
      if (scope === "CAMPAIGN" && contextCampaignId) {
        setRef({ id: contextCampaignId, label: contextCampaignId });
      }
      if (scope === "CHARACTER" && contextCharacterId) {
        setRef({ id: contextCharacterId, label: contextCharacterId });
      }
    }
  }, [scope, ref, contextCampaignId, contextCharacterId]);

  const handleSave = async () => {
    if (scope !== "GLOBAL" && !ref?.id) {
      setError("Select a campaign or character for this visibility scope.");
      return;
    }
    if (isDowngrade && !confirmDowngrade) {
      setError("Confirm the visibility downgrade to continue.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/relationships/${relationship.relationshipId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          visibilityScope: scope,
          visibilityRefId: scope === "GLOBAL" ? null : ref?.id ?? null
        })
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Unable to update visibility.");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update visibility.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relationship-editor">
      <label className="form-view__field">
        <span className="form-view__label">Visibility</span>
        <select
          value={scope}
          onChange={(event) =>
            setScope(event.target.value as RelationshipItem["visibilityScope"])
          }
        >
          <option value="GLOBAL">Global</option>
          <option value="CAMPAIGN">Campaign</option>
          <option value="CHARACTER">Character</option>
        </select>
      </label>
      {scope === "CAMPAIGN" ? (
        <label className="form-view__field">
          <span className="form-view__label">Campaign</span>
          <ReferencePicker
            token={token}
            entityKey="campaigns"
            worldId={worldId}
            value={ref}
            placeholder="Search campaigns..."
            onChange={setRef}
          />
        </label>
      ) : null}
      {scope === "CHARACTER" ? (
        <label className="form-view__field">
          <span className="form-view__label">Character</span>
          <ReferencePicker
            token={token}
            entityKey="characters"
            worldId={worldId}
            value={ref}
            placeholder="Search characters..."
            onChange={setRef}
          />
        </label>
      ) : null}
      {isDowngrade ? (
        <label className="form-view__field form-view__field--boolean">
          <input
            type="checkbox"
            checked={confirmDowngrade}
            onChange={(event) => setConfirmDowngrade(event.target.checked)}
            disabled={saving}
          />
          <span>Confirm visibility downgrade</span>
        </label>
      ) : null}
      {error ? <div className="form-view__hint">{error}</div> : null}
      <div className="relationship-editor__actions">
        <button type="button" className="ghost-button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="primary-button" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
};

type EntityRelationshipsProps = {
  token: string;
  entityId: string;
  worldId?: string;
  entityTypeId?: string;
  entityName?: string;
  contextCampaignId?: string;
  contextCharacterId?: string;
  onOpenEntity?: (entityId: string) => void;
};

export default function EntityRelationships({
  token,
  entityId,
  worldId,
  entityTypeId,
  entityName,
  contextCampaignId,
  contextCharacterId,
  onOpenEntity
}: EntityRelationshipsProps) {
  const { showPopout, closePopout, updatePopout } = usePopout();
  const [relationships, setRelationships] = useState<RelationshipResponse | null>(null);
  const [relationshipTypes, setRelationshipTypes] = useState<RelationshipType[]>([]);
  const [relationshipRules, setRelationshipRules] = useState<RelationshipRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [typesLoading, setTypesLoading] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeExpired, setIncludeExpired] = useState(false);
  const [filterTypeId, setFilterTypeId] = useState("");
  const [filterVisibilityScope, setFilterVisibilityScope] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [relationshipTypeId, setRelationshipTypeId] = useState("");
  const [direction, setDirection] = useState<"outgoing" | "incoming">("outgoing");
  const [targetEntity, setTargetEntity] = useState<ReferenceOption | null>(null);
  const [targetEntityTypeId, setTargetEntityTypeId] = useState<string | null>(null);
  const [visibilityScope, setVisibilityScope] = useState<
    RelationshipItem["visibilityScope"]
  >("GLOBAL");
  const [visibilityRef, setVisibilityRef] = useState<ReferenceOption | null>(null);
  const [contextLabels, setContextLabels] = useState<{
    campaign?: string;
    character?: string;
  }>({});
  const [visibilityLabels, setVisibilityLabels] = useState<{
    campaigns: Record<string, string>;
    characters: Record<string, string>;
  }>({ campaigns: {}, characters: {} });
  const [createPopoutId, setCreatePopoutId] = useState<string | null>(null);
  const relationshipsRequestRef = useRef(0);

  const loadRelationships = async () => {
    const requestId = ++relationshipsRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (contextCampaignId) params.set("campaignId", contextCampaignId);
      if (contextCharacterId) params.set("characterId", contextCharacterId);
      params.set("status", includeExpired ? "all" : "active");
      if (filterTypeId) params.set("relationshipTypeId", filterTypeId);
      if (filterVisibilityScope) params.set("visibilityScope", filterVisibilityScope);
      const url = params.toString()
        ? `/api/entities/${entityId}/relationships?${params.toString()}`
        : `/api/entities/${entityId}/relationships`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Unable to load relationships.");
      }
      const data = (await response.json()) as RelationshipResponse;
      if (requestId === relationshipsRequestRef.current) {
        setRelationships(data);
      }
    } catch (err) {
      if (requestId === relationshipsRequestRef.current) {
        setError(err instanceof Error ? err.message : "Unable to load relationships.");
      }
    } finally {
      if (requestId === relationshipsRequestRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadRelationships();
  }, [
    entityId,
    token,
    contextCampaignId,
    contextCharacterId,
    includeExpired,
    filterTypeId,
    filterVisibilityScope
  ]);

  useEffect(() => {
    const defaultScope = contextCharacterId
      ? "CHARACTER"
      : contextCampaignId
        ? "CAMPAIGN"
        : "GLOBAL";
    setVisibilityScope(defaultScope);
    if (defaultScope === "CAMPAIGN" && contextCampaignId) {
      setVisibilityRef({ id: contextCampaignId, label: contextCampaignId });
    } else if (defaultScope === "CHARACTER" && contextCharacterId) {
      setVisibilityRef({ id: contextCharacterId, label: contextCharacterId });
    } else {
      setVisibilityRef(null);
    }
  }, [contextCampaignId, contextCharacterId]);

  useEffect(() => {
    const loadContextLabels = async () => {
      const nextLabels: { campaign?: string; character?: string } = {};
      if (contextCampaignId) {
        const params = new URLSearchParams({
          entityKey: "campaigns",
          ids: contextCampaignId
        });
        if (worldId) params.set("worldId", worldId);
        const response = await fetch(`/api/references?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as Array<{ id: string; label: string }>;
          nextLabels.campaign = data[0]?.label;
        }
      }
      if (contextCharacterId) {
        const params = new URLSearchParams({
          entityKey: "characters",
          ids: contextCharacterId
        });
        if (worldId) params.set("worldId", worldId);
        const response = await fetch(`/api/references?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as Array<{ id: string; label: string }>;
          nextLabels.character = data[0]?.label;
        }
      }
      setContextLabels(nextLabels);
    };

    void loadContextLabels();
  }, [contextCampaignId, contextCharacterId, token, worldId]);

  useEffect(() => {
    if (visibilityScope === "GLOBAL") {
      setVisibilityRef(null);
      return;
    }
    if (visibilityRef?.id) return;
    if (visibilityScope === "CAMPAIGN" && contextCampaignId) {
      setVisibilityRef({
        id: contextCampaignId,
        label: contextLabels.campaign ?? contextCampaignId
      });
    }
    if (visibilityScope === "CHARACTER" && contextCharacterId) {
      setVisibilityRef({
        id: contextCharacterId,
        label: contextLabels.character ?? contextCharacterId
      });
    }
  }, [
    visibilityScope,
    visibilityRef,
    contextCampaignId,
    contextCharacterId,
    contextLabels
  ]);

  useEffect(() => {
    const canManage = relationships?.canManage ?? false;
    if (!worldId || !canManage) {
      setRelationshipTypes([]);
      return;
    }
    let ignore = false;
    const loadTypes = async () => {
      setTypesLoading(true);
      try {
        const response = await fetch(`/api/relationship-types?worldId=${worldId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (!response.ok) return;
        const data = (await response.json()) as RelationshipType[];
        if (!ignore) setRelationshipTypes(data);
      } catch {
        if (!ignore) setRelationshipTypes([]);
      } finally {
        if (!ignore) setTypesLoading(false);
      }
    };
    void loadTypes();
    return () => {
      ignore = true;
    };
  }, [worldId, token, relationships?.canManage]);

  useEffect(() => {
    const canManage = relationships?.canManage ?? false;
    if (!worldId || !canManage) {
      setRelationshipRules([]);
      return;
    }
    let ignore = false;
    const loadRules = async () => {
      setRulesLoading(true);
      try {
        const response = await fetch(`/api/relationship-type-rules?worldId=${worldId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (!response.ok) return;
        const data = (await response.json()) as RelationshipRule[];
        if (!ignore) setRelationshipRules(data);
      } catch {
        if (!ignore) setRelationshipRules([]);
      } finally {
        if (!ignore) setRulesLoading(false);
      }
    };
    void loadRules();
    return () => {
      ignore = true;
    };
  }, [worldId, token, relationships?.canManage]);

  const currentEntityTypeId = entityTypeId ?? null;
  const currentEntityLabel = entityName?.trim() ? entityName.trim() : "This entity";

  const relationshipTypeMap = useMemo(() => {
    return new Map(relationshipTypes.map((type) => [type.id, type]));
  }, [relationshipTypes]);

  const ruleKeySet = useMemo(() => {
    return new Set(
      relationshipRules.map(
        (rule) => `${rule.relationshipTypeId}:${rule.fromEntityTypeId}:${rule.toEntityTypeId}`
      )
    );
  }, [relationshipRules]);

  const hasRule = (typeId: string, fromTypeId: string, toTypeId: string) =>
    ruleKeySet.has(`${typeId}:${fromTypeId}:${toTypeId}`);

  const availableRelationshipTypes = useMemo(() => {
    if (!currentEntityTypeId) return relationshipTypes;
    if (!targetEntityTypeId) return relationshipTypes;
    if (relationshipRules.length === 0 || rulesLoading) return relationshipTypes;
    return relationshipTypes.filter((type) => {
      const forward = hasRule(type.id, currentEntityTypeId, targetEntityTypeId);
      const reverse = hasRule(type.id, targetEntityTypeId, currentEntityTypeId);
      if (type.isPeerable) {
        return forward && reverse;
      }
      return forward || reverse;
    });
  }, [
    relationshipTypes,
    rulesLoading,
    ruleKeySet,
    relationshipRules.length,
    currentEntityTypeId,
    targetEntityTypeId
  ]);

  const selectedRelationshipType = relationshipTypeId
    ? relationshipTypeMap.get(relationshipTypeId)
    : undefined;

  const rulesForSelectedType = useMemo(() => {
    if (!relationshipTypeId) return [];
    return relationshipRules.filter((rule) => rule.relationshipTypeId === relationshipTypeId);
  }, [relationshipRules, relationshipTypeId]);

  const outgoingTargetTypeIds = useMemo(() => {
    if (!currentEntityTypeId) return [];
    return rulesForSelectedType
      .filter((rule) => rule.fromEntityTypeId === currentEntityTypeId)
      .map((rule) => rule.toEntityTypeId);
  }, [rulesForSelectedType, currentEntityTypeId]);

  const incomingTargetTypeIds = useMemo(() => {
    if (!currentEntityTypeId) return [];
    return rulesForSelectedType
      .filter((rule) => rule.toEntityTypeId === currentEntityTypeId)
      .map((rule) => rule.fromEntityTypeId);
  }, [rulesForSelectedType, currentEntityTypeId]);

  const peerTargetTypeIds = useMemo(() => {
    if (!selectedRelationshipType?.isPeerable) return [];
    const incomingSet = new Set(incomingTargetTypeIds);
    return outgoingTargetTypeIds.filter((id) => incomingSet.has(id));
  }, [selectedRelationshipType?.isPeerable, outgoingTargetTypeIds, incomingTargetTypeIds]);

  const allowedTargetTypeIds = useMemo(() => {
    if (!selectedRelationshipType || !currentEntityTypeId) return [];
    if (selectedRelationshipType.isPeerable) return peerTargetTypeIds;
    return Array.from(new Set([...outgoingTargetTypeIds, ...incomingTargetTypeIds]));
  }, [
    selectedRelationshipType,
    currentEntityTypeId,
    outgoingTargetTypeIds,
    incomingTargetTypeIds,
    peerTargetTypeIds
  ]);

  const directionAvailability = useMemo(() => {
    if (!selectedRelationshipType || !currentEntityTypeId) {
      return { outgoing: false, incoming: false };
    }
    if (selectedRelationshipType.isPeerable) {
      const hasPeers = peerTargetTypeIds.length > 0;
      return { outgoing: hasPeers, incoming: hasPeers };
    }
    if (!targetEntityTypeId) {
      return {
        outgoing: outgoingTargetTypeIds.length > 0,
        incoming: incomingTargetTypeIds.length > 0
      };
    }
    return {
      outgoing: outgoingTargetTypeIds.includes(targetEntityTypeId),
      incoming: incomingTargetTypeIds.includes(targetEntityTypeId)
    };
  }, [
    selectedRelationshipType,
    currentEntityTypeId,
    peerTargetTypeIds,
    outgoingTargetTypeIds,
    incomingTargetTypeIds,
    targetEntityTypeId
  ]);

  const canSwapDirection =
    Boolean(
      selectedRelationshipType &&
        !selectedRelationshipType.isPeerable &&
        directionAvailability.outgoing &&
        directionAvailability.incoming
    );

  const previewText = useMemo(() => {
    if (!selectedRelationshipType || !targetEntity) return null;
    if (selectedRelationshipType.isPeerable) {
      return `${currentEntityLabel} ${selectedRelationshipType.fromLabel} ${targetEntity.label}`;
    }
    const fromName = direction === "outgoing" ? currentEntityLabel : targetEntity.label;
    const toName = direction === "outgoing" ? targetEntity.label : currentEntityLabel;
    const label =
      direction === "outgoing"
        ? selectedRelationshipType.fromLabel
        : selectedRelationshipType.toLabel;
    return `${fromName} ${label} ${toName}`;
  }, [selectedRelationshipType, targetEntity, direction, currentEntityLabel]);

  useEffect(() => {
    if (!relationshipTypeId) return;
    if (!directionAvailability.outgoing && !directionAvailability.incoming) return;
    if (direction === "outgoing" && !directionAvailability.outgoing) {
      setDirection("incoming");
      return;
    }
      if (direction === "incoming" && !directionAvailability.incoming) {
        setDirection("outgoing");
      }
    }, [relationshipTypeId, directionAvailability, direction]);

  useEffect(() => {
    if (!selectedRelationshipType || !targetEntityTypeId) return;
    if (allowedTargetTypeIds.length === 0) {
      setTargetEntity(null);
      setTargetEntityTypeId(null);
      return;
    }
    if (!allowedTargetTypeIds.includes(targetEntityTypeId)) {
      setTargetEntity(null);
      setTargetEntityTypeId(null);
    }
  }, [selectedRelationshipType, targetEntityTypeId, allowedTargetTypeIds]);

  useEffect(() => {
    if (!relationshipTypeId) return;
    if (availableRelationshipTypes.some((type) => type.id === relationshipTypeId)) return;
    setRelationshipTypeId("");
  }, [relationshipTypeId, availableRelationshipTypes]);

  useEffect(() => {
    if (!selectedRelationshipType || selectedRelationshipType.isPeerable) return;
    if (!targetEntityTypeId) return;
    const canOutgoing = outgoingTargetTypeIds.includes(targetEntityTypeId);
    const canIncoming = incomingTargetTypeIds.includes(targetEntityTypeId);
    if (direction === "outgoing" && !canOutgoing && canIncoming) {
      setDirection("incoming");
    } else if (direction === "incoming" && !canIncoming && canOutgoing) {
      setDirection("outgoing");
    }
  }, [
    selectedRelationshipType,
    targetEntityTypeId,
    outgoingTargetTypeIds,
    incomingTargetTypeIds,
    direction
  ]);

  const visibilityKey = useMemo(() => {
    const campaignIds = new Set<string>();
    const characterIds = new Set<string>();
    const list = relationships?.relationships ?? [];
    list.forEach((item) => {
      if (item.visibilityScope === "CAMPAIGN" && item.visibilityRefId) {
        campaignIds.add(item.visibilityRefId);
      }
      if (item.visibilityScope === "CHARACTER" && item.visibilityRefId) {
        characterIds.add(item.visibilityRefId);
      }
    });
    return JSON.stringify({
      campaigns: Array.from(campaignIds).sort(),
      characters: Array.from(characterIds).sort()
    });
  }, [relationships]);

  useEffect(() => {
    const loadLabels = async () => {
    const list = relationships?.relationships ?? [];
    if (list.length === 0) {
      setVisibilityLabels({ campaigns: {}, characters: {} });
      return;
    }
      const campaignIds = Array.from(
        new Set(
          list
            .filter((item) => item.visibilityScope === "CAMPAIGN" && item.visibilityRefId)
            .map((item) => item.visibilityRefId as string)
        )
      );
      const characterIds = Array.from(
        new Set(
          list
            .filter((item) => item.visibilityScope === "CHARACTER" && item.visibilityRefId)
            .map((item) => item.visibilityRefId as string)
        )
      );

      const nextLabels = { campaigns: {}, characters: {} } as {
        campaigns: Record<string, string>;
        characters: Record<string, string>;
      };

      if (campaignIds.length > 0) {
        const params = new URLSearchParams({
          entityKey: "campaigns",
          ids: campaignIds.join(",")
        });
        if (worldId) params.set("worldId", worldId);
        const response = await fetch(`/api/references?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as Array<{ id: string; label: string }>;
          data.forEach((entry) => {
            nextLabels.campaigns[entry.id] = entry.label;
          });
        }
      }

      if (characterIds.length > 0) {
        const params = new URLSearchParams({
          entityKey: "characters",
          ids: characterIds.join(",")
        });
        if (worldId) params.set("worldId", worldId);
        const response = await fetch(`/api/references?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as Array<{ id: string; label: string }>;
          data.forEach((entry) => {
            nextLabels.characters[entry.id] = entry.label;
          });
        }
      }

      setVisibilityLabels(nextLabels);
    };

    void loadLabels();
  }, [visibilityKey, token, worldId, relationships]);

  const formatVisibility = (item: RelationshipItem) => {
    if (item.visibilityScope === "GLOBAL") return "Global";
    if (item.visibilityScope === "CAMPAIGN") {
      const label = item.visibilityRefId
        ? visibilityLabels.campaigns[item.visibilityRefId] ?? item.visibilityRefId
        : "";
      return label ? `Secret (Campaign: ${label})` : "Secret (Campaign)";
    }
    const label = item.visibilityRefId
      ? visibilityLabels.characters[item.visibilityRefId] ?? item.visibilityRefId
      : "";
    return label ? `Secret (Character: ${label})` : "Secret (Character)";
  };

  const handleTargetSelect = async (next: ReferenceOption | null) => {
    setTargetEntity(next);
    setCreateError(null);
    setCreateNotice(null);
    if (!next) {
      setTargetEntityTypeId(null);
      return;
    }
    if (next.id === entityId) {
      setTargetEntity(null);
      setTargetEntityTypeId(null);
      setCreateError("An entity cannot relate to itself.");
      return;
    }
    if (next.entityTypeId) {
      setTargetEntityTypeId(next.entityTypeId);
      return;
    }
    try {
      const params = new URLSearchParams();
      if (contextCampaignId) params.set("campaignId", contextCampaignId);
      if (contextCharacterId) params.set("characterId", contextCharacterId);
      const url = params.toString()
        ? `/api/entities/${next.id}?${params.toString()}`
        : `/api/entities/${next.id}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) {
        setTargetEntityTypeId(null);
        setCreateError("Unable to read the selected entity.");
        return;
      }
      const data = (await response.json()) as { entityTypeId?: string };
      setTargetEntityTypeId(data.entityTypeId ?? null);
    } catch {
      setTargetEntityTypeId(null);
      setCreateError("Unable to read the selected entity.");
    }
  };

  const handleCreate = async (event?: React.SyntheticEvent) => {
    event?.preventDefault();
    setCreateError(null);
    setCreateNotice(null);
    if (!currentEntityTypeId) {
      setCreateError("Save this entity before creating relationships.");
      return false;
    }
    if (!relationshipTypeId || !selectedRelationshipType) {
      setCreateError("Select a relationship type.");
      return false;
    }
    if (!targetEntity) {
      setCreateError("Select an entity.");
      return false;
    }
    if (!targetEntityTypeId) {
      setCreateError("Unable to determine the target entity type.");
      return false;
    }
    if (visibilityScope !== "GLOBAL" && !visibilityRef?.id) {
      setCreateError("Select a campaign or character for visibility.");
      return false;
    }

    if (!rulesLoading && relationshipRules.length > 0) {
      const forwardRule = hasRule(
        relationshipTypeId,
        currentEntityTypeId,
        targetEntityTypeId
      );
      const reverseRule = hasRule(
        relationshipTypeId,
        targetEntityTypeId,
        currentEntityTypeId
      );
        if (selectedRelationshipType.isPeerable) {
          if (!forwardRule || !reverseRule) {
            setCreateError("Peer relationships require rules in both directions.");
            return false;
          }
        } else if (direction === "outgoing" ? !forwardRule : !reverseRule) {
          setCreateError("No relationship rule allows this direction.");
          return false;
        }
      }

    const fromEntityId = direction === "outgoing" ? entityId : targetEntity.id;
    const toEntityId = direction === "outgoing" ? targetEntity.id : entityId;

    setCreating(true);
    try {
        const response = await fetch("/api/relationships", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            relationshipTypeId,
            fromEntityId,
            toEntityId,
            visibilityScope,
            visibilityRefId: visibilityScope === "GLOBAL" ? null : visibilityRef?.id ?? null,
            contextCampaignId,
            contextCharacterId
          })
        });
        if (response.status === 401) {
          dispatchUnauthorized();
          return false;
        }
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Unable to create relationship.");
        }
        setTargetEntity(null);
        setTargetEntityTypeId(null);
        await loadRelationships();
        if (visibilityScope === "CAMPAIGN" && visibilityRef?.id) {
          const label = visibilityRef.label ?? visibilityRef.id;
          if (visibilityRef.id !== contextCampaignId) {
            setCreateNotice(
              `Created. This relationship is scoped to ${label} and may be hidden in the current context.`
            );
          }
        }
        if (visibilityScope === "CHARACTER" && visibilityRef?.id) {
          const label = visibilityRef.label ?? visibilityRef.id;
          if (visibilityRef.id !== contextCharacterId) {
            setCreateNotice(
              `Created. This relationship is scoped to ${label} and may be hidden in the current context.`
            );
          }
        }
        return true;
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Unable to create relationship.");
        return false;
      } finally {
        setCreating(false);
      }
    };

  const confirmAction = (options: {
    title: string;
    message: string;
    confirmLabel: string;
    confirmTone?: "primary" | "danger";
    onConfirm: () => void;
  }) => {
    showPopout({
      title: options.title,
      message: <p>{options.message}</p>,
      actions: [
        { label: "Cancel", tone: "ghost" },
        {
          label: options.confirmLabel,
          tone: options.confirmTone ?? "primary",
          onClick: options.onConfirm
        }
      ]
    });
  };

  const handleExpire = (relationship: RelationshipItem) => {
    const message = relationship.isPeer
      ? "This will expire both sides of the peer relationship and switch to past-tense labels."
      : "This will expire the relationship and switch to past-tense labels.";
    confirmAction({
      title: "Expire relationship",
      message,
      confirmLabel: "Expire",
      confirmTone: "danger",
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/relationships/${relationship.relationshipId}/expire`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
          });
          if (response.status === 401) {
            dispatchUnauthorized();
            return;
          }
          if (!response.ok) {
            const data = (await response.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error ?? "Unable to expire relationship.");
          }
          await loadRelationships();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unable to expire relationship.");
        }
      }
    });
  };

  const handleDelete = (relationship: RelationshipItem) => {
    const message = relationship.isPeer
      ? "This will permanently delete both sides of the peer relationship."
      : "This will permanently delete the relationship.";
    confirmAction({
      title: "Delete relationship",
      message,
      confirmLabel: "Delete",
      confirmTone: "danger",
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/relationships/${relationship.relationshipId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
          });
          if (response.status === 401) {
            dispatchUnauthorized();
            return;
          }
          if (!response.ok) {
            const data = (await response.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error ?? "Unable to delete relationship.");
          }
          await loadRelationships();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unable to delete relationship.");
        }
      }
    });
  };

  const openVisibilityEditor = (relationship: RelationshipItem) => {
    let popoutId = "";
    popoutId = showPopout({
      title: "Update Visibility",
      message: (
        <VisibilityEditor
          token={token}
          worldId={worldId}
          contextCampaignId={contextCampaignId}
          contextCharacterId={contextCharacterId}
          relationship={relationship}
          onSaved={() => {
            closePopout(popoutId);
            void loadRelationships();
          }}
          onCancel={() => closePopout(popoutId)}
        />
      ),
      actions: [{ label: "Close" }]
    });
  };

  const canManage = relationships?.canManage ?? false;
  const relationshipItems = relationships?.relationships ?? [];

  const buildCreatePopoutOptions = (popoutId: string) => ({
    title: "Add relationship",
    message: (
      <div className="entity-relationships__popout">
        <div className="form-view__hint">
          Select a relationship or target first; the other field will filter automatically.
        </div>
        <div className="entity-relationships__popout-body">
          <div className="entity-relationships__popout-step">
            <div className="entity-relationships__step-title">1. Relationship</div>
            <div className="entity-relationships__pair">
              <label className="form-view__field">
                <span className="form-view__label">Relationship Type</span>
                <select
                  value={relationshipTypeId}
                  onChange={(event) => setRelationshipTypeId(event.target.value)}
                  disabled={typesLoading}
                >
                  <option value="">Select type...</option>
                  {availableRelationshipTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-view__field">
                <span className="form-view__label">Target Entity</span>
                <ReferencePicker
                  token={token}
                  entityKey="entities"
                  worldId={worldId}
                  campaignId={contextCampaignId}
                  characterId={contextCharacterId}
                  entityTypeIds={relationshipTypeId ? allowedTargetTypeIds : undefined}
                  excludeEntityId={entityId}
                  value={targetEntity}
                  placeholder="Search entities..."
                  disabled={
                    relationshipTypeId &&
                    relationshipRules.length > 0 &&
                    allowedTargetTypeIds.length === 0
                  }
                  onChange={handleTargetSelect}
                />
              </label>
            </div>
            {selectedRelationshipType ? (
              <div className="entity-relationships__step-meta">
                <span>
                  {selectedRelationshipType.isPeerable
                    ? "Peerable relationship"
                    : "Directional relationship"}
                </span>
                <span>
                  Labels: {selectedRelationshipType.fromLabel} /
                  {selectedRelationshipType.toLabel}
                </span>
              </div>
            ) : null}
            {relationshipTypeId &&
            selectedRelationshipType &&
            relationshipRules.length > 0 &&
            allowedTargetTypeIds.length === 0 ? (
              <div className="form-view__hint">
                No target entity types match this relationship.
              </div>
            ) : null}
            {targetEntityTypeId &&
            relationshipRules.length > 0 &&
            availableRelationshipTypes.length === 0 ? (
              <div className="form-view__hint">
                No relationship types match the selected entity.
              </div>
            ) : null}
          </div>
          {selectedRelationshipType ? (
            selectedRelationshipType.isPeerable ? (
              <div className="entity-relationships__popout-step">
                <div className="entity-relationships__step-title">2. Direction</div>
                <div className="form-view__hint">Peer relationship: direction is shared.</div>
              </div>
            ) : (
              <div className="entity-relationships__popout-step">
                <div className="entity-relationships__step-title">2. Direction</div>
                <label className="form-view__field">
                  <span className="form-view__label">Direction</span>
                  <select
                    value={direction}
                    onChange={(event) =>
                      setDirection(event.target.value as "outgoing" | "incoming")
                    }
                    disabled={
                      !directionAvailability.outgoing && !directionAvailability.incoming
                    }
                  >
                    <option value="outgoing" disabled={!directionAvailability.outgoing}>
                      This entity -&gt; target
                    </option>
                    <option value="incoming" disabled={!directionAvailability.incoming}>
                      Target -&gt; this entity
                    </option>
                  </select>
                </label>
                {canSwapDirection ? (
                  <button
                    type="button"
                    className="ghost-button entity-relationships__swap"
                    onClick={() =>
                      setDirection((current) =>
                        current === "outgoing" ? "incoming" : "outgoing"
                      )
                    }
                  >
                    &lt;-&gt; Swap direction
                  </button>
                ) : null}
              </div>
            )
          ) : null}
          <div className="entity-relationships__popout-step">
            <div className="entity-relationships__step-title">3. Visibility</div>
            <div className="entity-relationships__form-row">
              <label className="form-view__field">
                <span className="form-view__label">Visibility</span>
                <select
                  value={visibilityScope}
                  onChange={(event) =>
                    setVisibilityScope(
                      event.target.value as RelationshipItem["visibilityScope"]
                    )
                  }
                >
                  <option value="GLOBAL">Global</option>
                  <option value="CAMPAIGN">Secret (Campaign)</option>
                  <option value="CHARACTER">Secret (Character)</option>
                </select>
              </label>
              {visibilityScope === "CAMPAIGN" ? (
                <label className="form-view__field">
                  <span className="form-view__label">Campaign</span>
                  <ReferencePicker
                    token={token}
                    entityKey="campaigns"
                    worldId={worldId}
                    value={visibilityRef}
                    placeholder="Search campaigns..."
                    onChange={setVisibilityRef}
                  />
                </label>
              ) : null}
              {visibilityScope === "CHARACTER" ? (
                <label className="form-view__field">
                  <span className="form-view__label">Character</span>
                  <ReferencePicker
                    token={token}
                    entityKey="characters"
                    worldId={worldId}
                    value={visibilityRef}
                    placeholder="Search characters..."
                    onChange={setVisibilityRef}
                  />
                </label>
              ) : null}
            </div>
          </div>
          <div className="entity-relationships__popout-step">
            <div className="entity-relationships__step-title">4. Preview</div>
            <div className="entity-relationships__preview">
              <span className="entity-relationships__preview-label">Preview</span>
              <span>{previewText ?? "Select a relationship and target to preview."}</span>
            </div>
          </div>
          {createError ? <div className="form-view__hint">{createError}</div> : null}
          {createNotice ? <div className="form-view__hint">{createNotice}</div> : null}
        </div>
      </div>
    ),
    actions: [
      {
        label: "Cancel",
        tone: "ghost",
        onClick: () => setCreatePopoutId(null)
      },
      {
        label: creating ? "Creating..." : "Create",
        tone: "primary",
        closeOnClick: false,
        onClick: async () => {
          const created = await handleCreate();
          if (created) {
            closePopout(popoutId);
            setCreatePopoutId(null);
          }
        }
      }
    ],
    dismissOnBackdrop: false
  });

  useEffect(() => {
    if (!createPopoutId) return;
    updatePopout(createPopoutId, buildCreatePopoutOptions(createPopoutId));
  }, [
    createPopoutId,
    updatePopout,
    relationshipTypeId,
    availableRelationshipTypes,
    typesLoading,
    targetEntity,
    targetEntityTypeId,
    selectedRelationshipType,
    relationshipRules.length,
    allowedTargetTypeIds,
    direction,
    directionAvailability,
    canSwapDirection,
    visibilityScope,
    visibilityRef,
    previewText,
    createError,
    createNotice,
    creating,
    token,
    worldId,
    contextCampaignId,
    contextCharacterId,
    entityId
  ]);

  return (
    <div className="entity-relationships">
      <div className="entity-relationships__header">
        <div>
          <h2>Relationships</h2>
          <p>Connections between entities in this world.</p>
        </div>
        <div className="entity-relationships__header-actions">
          <label className="entity-relationships__toggle">
            <input
              type="checkbox"
              checked={includeExpired}
              onChange={(event) => setIncludeExpired(event.target.checked)}
            />
            <span>Show expired</span>
          </label>
          {canManage ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setCreateError(null);
                setCreateNotice(null);
                const id = showPopout({ title: "Add relationship", message: null, actions: [] });
                setCreatePopoutId(id);
                updatePopout(id, buildCreatePopoutOptions(id));
              }}
            >
              Add relationship
            </button>
          ) : null}
        </div>
      </div>
      {error ? <div className="form-view__hint">{error}</div> : null}
      {loading ? <div className="form-view__hint">Loading relationships...</div> : null}

      <div className="entity-relationships__filters">
        <label className="form-view__field">
          <span className="form-view__label">Relationship Type</span>
          <select
            value={filterTypeId}
            onChange={(event) => setFilterTypeId(event.target.value)}
          >
            <option value="">All</option>
            {relationshipTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-view__field">
          <span className="form-view__label">Visibility</span>
          <select
            value={filterVisibilityScope}
            onChange={(event) => setFilterVisibilityScope(event.target.value)}
          >
            <option value="">All</option>
            <option value="GLOBAL">Global</option>
            <option value="CAMPAIGN">Secret (Campaign)</option>
            <option value="CHARACTER">Secret (Character)</option>
          </select>
        </label>
      </div>

      {relationshipItems.length === 0 && !loading ? (
        <div className="form-view__hint">No relationships found.</div>
      ) : (
        <div className="entity-relationships__table-wrapper">
          <table className="entity-relationships__table">
            <thead>
              <tr>
                <th>Relationship</th>
                <th>Related Entity</th>
                <th>
                  Direction
                  <span
                    className="relationship-table__help"
                    title="Peer relationships are mutual and directional on both sides."
                  >
                    ?
                  </span>
                </th>
                <th>Status</th>
                <th>Visibility</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {relationshipItems.map((item) => (
                <tr
                  key={item.id}
                  className={item.status === "EXPIRED" ? "is-expired" : ""}
                >
                  <td>
                    <div className="relationship-table__label">{item.label}</div>
                    <div className="relationship-table__meta">
                      {item.relationshipTypeName}
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="relationship-table__entity"
                      onClick={() => onOpenEntity?.(item.relatedEntityId)}
                    >
                      {item.relatedEntityName}
                    </button>
                  </td>
                  <td className="relationship-table__direction">
                    {item.direction === "peer"
                      ? "Peer"
                      : item.direction === "outgoing"
                        ? "Outgoing"
                        : "Incoming"}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        item.status === "ACTIVE"
                          ? "status-badge--success"
                          : "status-badge--warning"
                      }`}
                    >
                      {item.status === "ACTIVE" ? "Active" : "Expired"}
                    </span>
                  </td>
                  <td className="relationship-table__visibility">
                    {formatVisibility(item)}
                  </td>
                  <td>
                    {canManage ? (
                      <div className="relationship-table__actions">
                        {item.status === "ACTIVE" ? (
                          <>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => openVisibilityEditor(item)}
                            >
                              {item.visibilityScope === "GLOBAL"
                                ? "Change visibility"
                                : "Reveal"}
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => handleExpire(item)}
                            >
                              Expire
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          className="ghost-button relationship-table__delete"
                          onClick={() => handleDelete(item)}
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      <span className="form-view__hint">Read-only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

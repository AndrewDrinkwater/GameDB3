import { useEffect, useState } from "react";
import { dispatchUnauthorized } from "../utils/auth";

type EntitySummary = {
  id: string;
  name: string;
  description?: string | null;
  entityTypeId: string;
  worldId: string;
  fieldValues?: Record<string, unknown>;
};

type EntitySidePanelProps = {
  token: string;
  entityId: string | null;
  contextCampaignId?: string;
  contextCharacterId?: string;
  onClose: () => void;
  onOpenRecord: (entityId: string) => void;
};

type EntityFieldDefinition = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  required: boolean;
  formOrder: number;
  listOrder: number;
  conditions?: unknown;
  choices?: Array<{ value: string; label: string }>;
  referenceEntityTypeId?: string | null;
};

type ConditionRule = {
  fieldKey: string;
  operator: string;
  value?: string;
};

type ConditionGroup = {
  logic: "AND" | "OR";
  rules?: ConditionRule[];
  groups?: ConditionGroup[];
};

const evaluateRule = (rule: ConditionRule, values: Record<string, unknown>) => {
  const rawValue = values[rule.fieldKey];
  const value = rawValue === undefined || rawValue === null ? "" : String(rawValue);
  const targetValues = Array.isArray(rule.value)
    ? rule.value.map((item) => String(item))
    : rule.value
      ? [String(rule.value)]
      : [];
  const target = targetValues[0] ?? "";

  switch (rule.operator) {
    case "equals":
      return value === target;
    case "not_equals":
      return value !== target;
    case "contains":
      return value.toLowerCase().includes(target.toLowerCase());
    case "contains_any":
      return targetValues.some((item) => item === value);
    case "is_set":
      return value !== "";
    case "is_not_set":
      return value === "";
    default:
      return true;
  }
};

const evaluateGroup = (group: ConditionGroup, values: Record<string, unknown>) => {
  const rules = group.rules ?? [];
  const groups = group.groups ?? [];
  const results = [
    ...rules.map((rule) => evaluateRule(rule, values)),
    ...groups.map((child) => evaluateGroup(child, values))
  ];

  if (results.length === 0) return true;
  return group.logic === "AND" ? results.every(Boolean) : results.some(Boolean);
};

const formatFieldValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "Empty";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (Array.isArray(value)) {
    if (value.length === 0) return "Empty";
    return value.map((item) => String(item)).join(", ");
  }
  return String(value);
};

export default function EntitySidePanel({
  token,
  entityId,
  contextCampaignId,
  contextCharacterId,
  onClose,
  onOpenRecord
}: EntitySidePanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entity, setEntity] = useState<EntitySummary | null>(null);
  const [entityTypeLabel, setEntityTypeLabel] = useState<string | null>(null);
  const [entityFields, setEntityFields] = useState<EntityFieldDefinition[]>([]);
  const [referenceLabels, setReferenceLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    let ignore = false;
    if (!entityId) {
      setEntity(null);
      setEntityTypeLabel(null);
      setEntityFields([]);
      setReferenceLabels({});
      setError(null);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (contextCampaignId) params.set("campaignId", contextCampaignId);
        if (contextCharacterId) params.set("characterId", contextCharacterId);
        const url = params.toString()
          ? `/api/entities/${entityId}?${params.toString()}`
          : `/api/entities/${entityId}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (!response.ok) {
          throw new Error("Unable to load entity.");
        }
        const data = (await response.json()) as EntitySummary;
        if (ignore) return;
        setEntity(data);

        const typeParams = new URLSearchParams({
          entityKey: "entity_types",
          ids: data.entityTypeId,
          scope: "entity_type",
          worldId: data.worldId
        });
        const typeResponse = await fetch(`/api/references?${typeParams.toString()}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (typeResponse.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (typeResponse.ok) {
          const types = (await typeResponse.json()) as Array<{ id: string; label: string }>;
          if (!ignore && types[0]) {
            setEntityTypeLabel(types[0].label);
          }
        }

        const fieldResponse = await fetch(
          `/api/entity-fields?entityTypeId=${data.entityTypeId}`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        if (fieldResponse.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (fieldResponse.ok) {
          const fields = (await fieldResponse.json()) as EntityFieldDefinition[];
          if (!ignore) {
            const sorted = [...fields].sort((a, b) => a.formOrder - b.formOrder);
            setEntityFields(sorted);
          }

          const referenceFields = fields.filter(
            (field) => field.fieldType === "ENTITY_REFERENCE"
          );
          const refIds = new Set<string>();
          referenceFields.forEach((field) => {
            const rawValue = data.fieldValues?.[field.fieldKey];
            if (Array.isArray(rawValue)) {
              rawValue.forEach((entry) => refIds.add(String(entry)));
            } else if (rawValue) {
              refIds.add(String(rawValue));
            }
          });
          if (refIds.size > 0) {
            const params = new URLSearchParams({
              entityKey: "entities",
              ids: Array.from(refIds).join(",")
            });
            params.set("worldId", data.worldId);
            if (contextCampaignId) params.set("campaignId", contextCampaignId);
            if (contextCharacterId) params.set("characterId", contextCharacterId);
            const refResponse = await fetch(`/api/references?${params.toString()}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (refResponse.status === 401) {
              dispatchUnauthorized();
              return;
            }
            if (refResponse.ok) {
              const refs = (await refResponse.json()) as Array<{ id: string; label: string }>;
              if (!ignore) {
                const map: Record<string, string> = {};
                refs.forEach((item) => {
                  map[item.id] = item.label;
                });
                setReferenceLabels(map);
              }
            }
          } else if (!ignore) {
            setReferenceLabels({});
          }
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Unable to load entity.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [entityId, token, contextCampaignId, contextCharacterId]);

  const isOpen = Boolean(entityId);
  const valueContext = entity
    ? {
        ...(entity.fieldValues ?? {}),
        name: entity.name,
        description: entity.description ?? "",
        worldId: entity.worldId,
        entityTypeId: entity.entityTypeId
      }
    : {};
  const visibleFields = entityFields.filter((field) => {
    if (!field.conditions) return true;
    if (typeof field.conditions === "string") {
      try {
        const parsed = JSON.parse(field.conditions) as ConditionGroup;
        return evaluateGroup(parsed, valueContext);
      } catch {
        return true;
      }
    }
    return evaluateGroup(field.conditions as ConditionGroup, valueContext);
  });

  const getFieldDisplayValue = (field: EntityFieldDefinition) => {
    const rawValue = entity?.fieldValues?.[field.fieldKey];
    if (field.fieldType === "CHOICE") {
      const choice = field.choices?.find((entry) => entry.value === String(rawValue));
      return choice?.label ?? formatFieldValue(rawValue);
    }
    if (field.fieldType === "ENTITY_REFERENCE") {
      if (Array.isArray(rawValue)) {
        const labels = rawValue.map((entry) => referenceLabels[String(entry)] ?? String(entry));
        return labels.length > 0 ? labels.join(", ") : "Empty";
      }
      if (!rawValue) return "Empty";
      return referenceLabels[String(rawValue)] ?? String(rawValue);
    }
    if (field.fieldType === "BOOLEAN") {
      return rawValue ? "True" : "False";
    }
    return formatFieldValue(rawValue);
  };

  const hasDescription = Boolean(entity?.description && entity.description.trim() !== "");

  return (
    <>
      <div
        className={`entity-panel__overlay ${isOpen ? "is-visible" : ""}`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />
      <aside className={`entity-panel ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen}>
        <div className="entity-panel__header">
          <div>
            <span className="entity-panel__eyebrow">Entity</span>
            <h2 className="entity-panel__title">{entity?.name ?? "Loading..."}</h2>
            {entityTypeLabel ? (
              <div className="entity-panel__meta">{entityTypeLabel}</div>
            ) : null}
          </div>
          <div className="entity-panel__actions">
            {entity ? (
              <button
                type="button"
                className="ghost-button entity-panel__open"
                onClick={() => onOpenRecord(entity.id)}
              >
                Open record
              </button>
            ) : null}
            <button type="button" className="ghost-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="entity-panel__body">
          {loading ? <div className="entity-panel__state">Loading...</div> : null}
          {error ? <div className="entity-panel__state">{error}</div> : null}
          {!loading && !error ? (
            <>
              {hasDescription ? (
                <div className="entity-panel__section entity-panel__section--description">
                  <h3>Description</h3>
                  <p>{entity?.description}</p>
                </div>
              ) : null}
              {visibleFields.length > 0 ? (
                <div
                  className={`entity-panel__section ${
                    hasDescription ? "" : "entity-panel__section--tight"
                  }`}
                >
                  <h3>Details</h3>
                  <div className="entity-panel__fields">
                    {visibleFields.map((field) => (
                      <div className="entity-panel__field" key={field.id}>
                        <span className="entity-panel__field-label">{field.label}</span>
                        <span className="entity-panel__field-value">
                          {getFieldDisplayValue(field)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
}

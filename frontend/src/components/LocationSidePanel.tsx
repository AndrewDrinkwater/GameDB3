import { useEffect, useState } from "react";
import { dispatchUnauthorized } from "../utils/auth";

type LocationSummary = {
  id: string;
  name: string;
  description?: string | null;
  locationTypeId: string;
  worldId: string;
  status?: string | null;
  fieldValues?: Record<string, unknown>;
};

type LocationSidePanelProps = {
  token: string;
  locationId: string | null;
  contextCampaignId?: string;
  contextCharacterId?: string;
  onClose: () => void;
  onOpenRecord: (locationId: string) => void;
};

type LocationFieldDefinition = {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  required: boolean;
  formOrder: number;
  listOrder: number;
  choices?: Array<{ value: string; label: string }>;
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

export default function LocationSidePanel({
  token,
  locationId,
  contextCampaignId,
  contextCharacterId,
  onClose,
  onOpenRecord
}: LocationSidePanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationSummary | null>(null);
  const [locationTypeLabel, setLocationTypeLabel] = useState<string | null>(null);
  const [locationFields, setLocationFields] = useState<LocationFieldDefinition[]>([]);
  const [entityReferenceLabels, setEntityReferenceLabels] = useState<Record<string, string>>({});
  const [locationReferenceLabels, setLocationReferenceLabels] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    let ignore = false;
    if (!locationId) {
      setLocation(null);
      setLocationTypeLabel(null);
      setLocationFields([]);
      setEntityReferenceLabels({});
      setLocationReferenceLabels({});
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
          ? `/api/locations/${locationId}?${params.toString()}`
          : `/api/locations/${locationId}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (!response.ok) {
          throw new Error("Unable to load location.");
        }
        const data = (await response.json()) as LocationSummary;
        if (ignore) return;
        setLocation(data);

        const typeParams = new URLSearchParams({
          entityKey: "location_types",
          ids: data.locationTypeId,
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
            setLocationTypeLabel(types[0].label);
          }
        }

        const fieldResponse = await fetch(
          `/api/location-type-fields?locationTypeId=${data.locationTypeId}`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        if (fieldResponse.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (fieldResponse.ok) {
          const fields = (await fieldResponse.json()) as LocationFieldDefinition[];
          if (!ignore) {
            const sorted = [...fields].sort((a, b) => a.formOrder - b.formOrder);
            setLocationFields(sorted);
          }

          const entityRefIds = new Set<string>();
          const locationRefIds = new Set<string>();
          fields.forEach((field) => {
            if (field.fieldType !== "ENTITY_REFERENCE" && field.fieldType !== "LOCATION_REFERENCE") {
              return;
            }
            const rawValue = data.fieldValues?.[field.fieldKey];
            const targetSet = field.fieldType === "ENTITY_REFERENCE" ? entityRefIds : locationRefIds;
            if (Array.isArray(rawValue)) {
              rawValue.forEach((entry) => targetSet.add(String(entry)));
            } else if (rawValue) {
              targetSet.add(String(rawValue));
            }
          });

          if (entityRefIds.size > 0) {
            const params = new URLSearchParams({
              entityKey: "entities",
              ids: Array.from(entityRefIds).join(","),
              worldId: data.worldId
            });
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
                setEntityReferenceLabels(map);
              }
            }
          } else if (!ignore) {
            setEntityReferenceLabels({});
          }

          if (locationRefIds.size > 0) {
            const params = new URLSearchParams({
              entityKey: "locations",
              ids: Array.from(locationRefIds).join(","),
              worldId: data.worldId
            });
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
                setLocationReferenceLabels(map);
              }
            }
          } else if (!ignore) {
            setLocationReferenceLabels({});
          }
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Unable to load location.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [locationId, token, contextCampaignId, contextCharacterId]);

  const isOpen = Boolean(locationId);
  const getFieldDisplayValue = (field: LocationFieldDefinition) => {
    const rawValue = location?.fieldValues?.[field.fieldKey];
    if (field.fieldType === "CHOICE") {
      const choice = field.choices?.find((entry) => entry.value === String(rawValue));
      return choice?.label ?? formatFieldValue(rawValue);
    }
    if (field.fieldType === "ENTITY_REFERENCE") {
      if (Array.isArray(rawValue)) {
        const labels = rawValue.map(
          (entry) => entityReferenceLabels[String(entry)] ?? String(entry)
        );
        return labels.length > 0 ? labels.join(", ") : "Empty";
      }
      if (!rawValue) return "Empty";
      return entityReferenceLabels[String(rawValue)] ?? String(rawValue);
    }
    if (field.fieldType === "LOCATION_REFERENCE") {
      if (Array.isArray(rawValue)) {
        const labels = rawValue.map(
          (entry) => locationReferenceLabels[String(entry)] ?? String(entry)
        );
        return labels.length > 0 ? labels.join(", ") : "Empty";
      }
      if (!rawValue) return "Empty";
      return locationReferenceLabels[String(rawValue)] ?? String(rawValue);
    }
    if (field.fieldType === "BOOLEAN") {
      return rawValue ? "True" : "False";
    }
    return formatFieldValue(rawValue);
  };

  const hasDescription = Boolean(location?.description && location.description.trim() !== "");
  const hasFields = locationFields.length > 0;

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
            <span className="entity-panel__eyebrow">Location</span>
            <h2 className="entity-panel__title">{location?.name ?? "Loading..."}</h2>
            {locationTypeLabel ? (
              <div className="entity-panel__meta">{locationTypeLabel}</div>
            ) : null}
          </div>
          <div className="entity-panel__actions">
            {location ? (
              <button
                type="button"
                className="ghost-button entity-panel__open"
                onClick={() => onOpenRecord(location.id)}
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
                  <p>{location?.description}</p>
                </div>
              ) : null}
              {hasFields ? (
                <div
                  className={`entity-panel__section ${
                    hasDescription ? "" : "entity-panel__section--tight"
                  }`}
                >
                  <h3>Details</h3>
                  <div className="entity-panel__fields">
                    {locationFields.map((field) => (
                      <div className="entity-panel__field" key={field.id}>
                        <span className="entity-panel__field-label">{field.fieldLabel}</span>
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

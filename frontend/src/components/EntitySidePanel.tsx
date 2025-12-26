import { useEffect, useState } from "react";
import { dispatchUnauthorized } from "../utils/auth";

type EntitySummary = {
  id: string;
  name: string;
  description?: string | null;
  entityTypeId: string;
  worldId: string;
};

type EntitySidePanelProps = {
  token: string;
  entityId: string | null;
  contextCampaignId?: string;
  contextCharacterId?: string;
  onClose: () => void;
  onOpenRecord: (entityId: string) => void;
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

  useEffect(() => {
    let ignore = false;
    if (!entityId) {
      setEntity(null);
      setEntityTypeLabel(null);
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
              <div className="entity-panel__section">
                <h3>Description</h3>
                <p>{entity?.description ?? "No description yet."}</p>
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { dispatchUnauthorized } from "../utils/auth";
import EntitySidePanel from "../components/EntitySidePanel";
import LocationSidePanel from "../components/LocationSidePanel";

type LocationRecordImage = {
  id: string;
  isPrimary: boolean;
  caption?: string | null;
  thumbnailUrl: string | null;
};

type LocationNode = {
  id: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
  locationType?: { id: string; name: string } | null;
  recordImages: LocationRecordImage[];
};

type EntitySummary = {
  id: string;
  name: string;
  entityType?: { id: string; name: string } | null;
};

type LocationExplorerViewProps = {
  token: string;
  worldId?: string;
  campaignId?: string;
  characterId?: string;
  onOpenEntityRecord?: (entityId: string) => void;
  onOpenLocationRecord?: (locationId: string) => void;
};

const pickPrimaryThumbnail = (images: LocationRecordImage[]) => {
  if (images.length === 0) return null;
  return images.find((image) => image.isPrimary) ?? images[0];
};

export default function LocationExplorerView({
  token,
  worldId,
  campaignId,
  characterId,
  onOpenEntityRecord,
  onOpenLocationRecord
}: LocationExplorerViewProps) {
  const [locations, setLocations] = useState<LocationNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [entityLoading, setEntityLoading] = useState(false);
  const [entities, setEntities] = useState<EntitySummary[]>([]);
  const [entityError, setEntityError] = useState<string | null>(null);
  const [entityPanelId, setEntityPanelId] = useState<string | null>(null);
  const [locationPanelId, setLocationPanelId] = useState<string | null>(null);

  useEffect(() => {
    if (!worldId) {
      setLocations([]);
      setSelectedId(null);
      return;
    }

    let ignore = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ worldId });
        if (campaignId) params.set("campaignId", campaignId);
        if (characterId) params.set("characterId", characterId);
        const response = await fetch(`/api/locations/tree?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (!response.ok) {
          throw new Error("Unable to load locations.");
        }
        const data = (await response.json()) as { locations: LocationNode[] };
        if (ignore) return;
        setLocations(data.locations);
        if (!selectedId && data.locations.length > 0) {
          setSelectedId(data.locations[0].id);
        }
        const roots = data.locations.filter((node) => !node.parentId).map((node) => node.id);
        setExpandedIds(new Set(roots));
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Unable to load locations.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [token, worldId, campaignId, characterId]);

  const nodesById = useMemo(
    () => new Map(locations.map((node) => [node.id, node])),
    [locations]
  );

  const childrenMap = useMemo(() => {
    const map = new Map<string | null, LocationNode[]>();
    locations.forEach((node) => {
      const key = node.parentId ?? null;
      const bucket = map.get(key) ?? [];
      bucket.push(node);
      map.set(key, bucket);
    });
    map.forEach((bucket) => bucket.sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [locations]);

  const visibleNodes = useMemo(() => {
    const ordered: Array<{ node: LocationNode; depth: number }> = [];
    const walk = (parentId: string | null, depth: number) => {
      const children = childrenMap.get(parentId) ?? [];
      children.forEach((child) => {
        ordered.push({ node: child, depth });
        if (expandedIds.has(child.id)) {
          walk(child.id, depth + 1);
        }
      });
    };
    walk(null, 0);
    return ordered;
  }, [childrenMap, expandedIds]);

  const selected = selectedId ? nodesById.get(selectedId) ?? null : null;

  const breadcrumbs = useMemo(() => {
    if (!selected) return [];
    const trail: LocationNode[] = [];
    let current: LocationNode | undefined | null = selected;
    while (current) {
      trail.push(current);
      current = current.parentId ? nodesById.get(current.parentId) : null;
    }
    return trail.reverse();
  }, [selected, nodesById]);

  const selectedChildren = selected ? childrenMap.get(selected.id) ?? [] : [];

  useEffect(() => {
    if (!selected || !worldId) {
      setEntities([]);
      setEntityError(null);
      return;
    }
    let ignore = false;
    const loadEntities = async () => {
      setEntityLoading(true);
      setEntityError(null);
      try {
        const params = new URLSearchParams();
        if (campaignId) params.set("campaignId", campaignId);
        if (characterId) params.set("characterId", characterId);
        const url = params.toString()
          ? `/api/locations/${selected.id}/entities?${params.toString()}`
          : `/api/locations/${selected.id}/entities`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (!response.ok) {
          throw new Error("Unable to load location entities.");
        }
        const data = (await response.json()) as { entities: EntitySummary[] };
        if (!ignore) setEntities(data.entities);
      } catch (err) {
        if (!ignore) {
          setEntityError(err instanceof Error ? err.message : "Unable to load entities.");
        }
      } finally {
        if (!ignore) setEntityLoading(false);
      }
    };
    void loadEntities();
    return () => {
      ignore = true;
    };
  }, [selected, token, campaignId, characterId, worldId]);

  if (!worldId) {
    return (
      <section className="app__panel">
        <h1>Location Explorer</h1>
        <p>Select a world to explore its locations.</p>
      </section>
    );
  }

  return (
    <section className="app__panel app__panel--wide">
      <div className="location-explorer">
        <div className="location-explorer__tree">
          <h2>Locations</h2>
          {loading ? <div className="location-explorer__state">Loading...</div> : null}
          {error ? <div className="location-explorer__state">{error}</div> : null}
          {!loading && !error ? (
            <div className="location-explorer__nodes">
              {visibleNodes.map(({ node, depth }) => {
                const hasChildren = (childrenMap.get(node.id) ?? []).length > 0;
                const isExpanded = expandedIds.has(node.id);
                const thumbnail = pickPrimaryThumbnail(node.recordImages);
                return (
                  <div
                    key={node.id}
                    className={`location-explorer__node ${
                      selectedId === node.id ? "is-selected" : ""
                    }`}
                    style={{ paddingLeft: `${depth * 1.25}rem` }}
                  >
                    <button
                      type="button"
                      className="location-explorer__toggle"
                      onClick={() => {
                        if (!hasChildren) return;
                        setExpandedIds((current) => {
                          const next = new Set(current);
                          if (next.has(node.id)) {
                            next.delete(node.id);
                          } else {
                            next.add(node.id);
                          }
                          return next;
                        });
                      }}
                      aria-label={isExpanded ? "Collapse location" : "Expand location"}
                      disabled={!hasChildren}
                    >
                      {hasChildren ? (isExpanded ? "▾" : "▸") : "•"}
                    </button>
                    <button
                      type="button"
                      className="location-explorer__label"
                      onClick={() => setSelectedId(node.id)}
                    >
                      {thumbnail?.thumbnailUrl ? (
                        <img src={thumbnail.thumbnailUrl} alt="" aria-hidden="true" />
                      ) : (
                        <span className="location-explorer__thumb-placeholder" />
                      )}
                      <span className="location-explorer__name">{node.name}</span>
                      {node.locationType?.name ? (
                        <span className="location-explorer__type">
                          {node.locationType.name}
                        </span>
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="location-explorer__inspector">
          {selected ? (
            <>
              <div className="location-explorer__header">
                <span className="location-explorer__eyebrow">Location</span>
                <div className="location-explorer__title-row">
                  <h2>{selected.name}</h2>
                  {selected ? (
                    <button
                      type="button"
                      className="ghost-button location-explorer__open"
                      onClick={() => setLocationPanelId(selected.id)}
                    >
                      Info
                    </button>
                  ) : null}
                </div>
                {selected.locationType?.name ? (
                  <div className="location-explorer__meta">
                    {selected.locationType.name}
                  </div>
                ) : null}
              </div>
              {breadcrumbs.length > 0 ? (
                <div className="location-explorer__section">
                  <h3>Breadcrumbs</h3>
                  <div className="location-explorer__breadcrumbs">
                    {breadcrumbs.map((crumb) => (
                      <button
                        key={crumb.id}
                        type="button"
                        onClick={() => setSelectedId(crumb.id)}
                      >
                        {crumb.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {selected.description ? (
                <div className="location-explorer__section">
                  <h3>Description</h3>
                  <p>{selected.description}</p>
                </div>
              ) : null}
              {selected.recordImages.length > 0 ? (
                <div className="location-explorer__section">
                  <h3>Images</h3>
                  <div className="location-explorer__gallery">
                    {selected.recordImages.map((image) => (
                      <div key={image.id} className="location-explorer__thumb">
                        {image.thumbnailUrl ? (
                          <img src={image.thumbnailUrl} alt={image.caption ?? "Location image"} />
                        ) : (
                          <span className="location-explorer__thumb-placeholder" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedChildren.length > 0 ? (
                <div className="location-explorer__section">
                  <h3>Child locations</h3>
                  <div className="location-explorer__child-list">
                    {selectedChildren.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => setSelectedId(child.id)}
                      >
                        {child.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="location-explorer__section">
                <h3>Entities here</h3>
                {entityLoading ? (
                  <div className="location-explorer__state">Loading entities...</div>
                ) : entityError ? (
                  <div className="location-explorer__state">{entityError}</div>
                ) : entities.length > 0 ? (
                  <ul className="location-explorer__entity-list">
                    {entities.map((entity) => (
                      <li key={entity.id}>
                        <button
                          type="button"
                          className="location-explorer__entity"
                          onClick={() => setEntityPanelId(entity.id)}
                        >
                          <span>{entity.name}</span>
                          {entity.entityType?.name ? (
                            <span className="location-explorer__entity-type">
                              {entity.entityType.name}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="location-explorer__state">No entities here.</div>
                )}
              </div>
            </>
          ) : (
            <div className="location-explorer__state">Select a location to inspect.</div>
          )}
        </div>
      </div>
      <EntitySidePanel
        token={token}
        entityId={entityPanelId}
        contextCampaignId={campaignId}
        contextCharacterId={characterId}
        onClose={() => setEntityPanelId(null)}
        onOpenRecord={(entityId) => onOpenEntityRecord?.(entityId)}
      />
      <LocationSidePanel
        token={token}
        locationId={locationPanelId}
        contextCampaignId={campaignId}
        contextCharacterId={characterId}
        onClose={() => setLocationPanelId(null)}
        onOpenRecord={(locationId) => onOpenLocationRecord?.(locationId)}
      />
    </section>
  );
}

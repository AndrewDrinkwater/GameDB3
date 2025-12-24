import { useEffect, useMemo, useState } from "react";

type ViewField = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  listVisible: boolean;
  formVisible: boolean;
  listOrder: number;
  formOrder: number;
  required: boolean;
  readOnly: boolean;
  placeholder?: string | null;
  optionsListKey?: string | null;
  referenceEntityKey?: string | null;
  width?: string | null;
};

type SystemView = {
  id: string;
  key: string;
  title: string;
  entityKey: string;
  viewType: string;
  endpoint: string;
  adminOnly: boolean;
  fields: ViewField[];
};

type Choice = { value: string; label: string };

type ListViewProps = {
  token: string;
  viewKey: string;
  formViewKey: string;
  onOpenForm: (id: string | "new") => void;
  contextWorldId?: string;
  contextCampaignId?: string;
  contextCharacterId?: string;
};

const fieldSorter = (a: ViewField, b: ViewField) => a.listOrder - b.listOrder;

const filterRows = (rows: Record<string, unknown>[], fields: ViewField[], query: string) => {
  if (!query) return rows;
  const normalized = query.toLowerCase();
  const keys = fields.map((field) => field.fieldKey);

  return rows.filter((row) =>
    keys.some((key) => String(row[key] ?? "").toLowerCase().includes(normalized))
  );
};

const isStatusField = (field: ViewField) => {
  const key = field.fieldKey.toLowerCase();
  const label = field.label.toLowerCase();
  return key.includes("status") || label.includes("status");
};

const getStatusTone = (value: string) => {
  const normalized = value.toLowerCase();
  if (normalized.includes("active") || normalized.includes("alive") || normalized.includes("enabled")) {
    return "success";
  }
  if (normalized.includes("inactive") || normalized.includes("dead") || normalized.includes("disabled")) {
    return "danger";
  }
  if (normalized.includes("pending") || normalized.includes("draft")) {
    return "warning";
  }
  return "neutral";
};

export default function ListView({
  token,
  viewKey,
  formViewKey,
  onOpenForm,
  contextWorldId,
  contextCampaignId,
  contextCharacterId
}: ListViewProps) {
  const [view, setView] = useState<SystemView | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [choiceMaps, setChoiceMaps] = useState<Record<string, Record<string, string>>>({});
  const [referenceMaps, setReferenceMaps] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    let ignore = false;

    const loadView = async () => {
      setLoading(true);
      setError(null);
      try {
        const viewResponse = await fetch(`/api/views/${viewKey}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!viewResponse.ok) {
          throw new Error("Unable to load view.");
        }

        const viewData = (await viewResponse.json()) as SystemView;
        if (ignore) return;
        setView(viewData);

        const listKeys = Array.from(
          new Set(
            viewData.fields
              .filter((field) => field.listVisible && field.optionsListKey)
              .map((field) => field.optionsListKey as string)
          )
        );

        const listKeyResults = await Promise.all(
          listKeys.map(async (listKey) => {
            const choiceResponse = await fetch(`/api/choices?listKey=${listKey}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!choiceResponse.ok) return [listKey, []] as const;
            const data = (await choiceResponse.json()) as Choice[];
            return [listKey, data] as const;
          })
        );

        if (ignore) return;

        const newChoiceMaps: Record<string, Record<string, string>> = {};
        listKeyResults.forEach(([listKey, choices]) => {
          newChoiceMaps[listKey] = choices.reduce<Record<string, string>>((acc, choice) => {
            acc[choice.value] = choice.label;
            return acc;
          }, {});
        });
        setChoiceMaps(newChoiceMaps);

        const params = new URLSearchParams();
        if (viewData.entityKey === "worlds" && contextWorldId) {
          params.set("worldId", contextWorldId);
        }
        if (viewData.entityKey === "campaigns") {
          if (contextWorldId) params.set("worldId", contextWorldId);
          if (contextCampaignId) params.set("campaignId", contextCampaignId);
          if (contextCharacterId) params.set("characterId", contextCharacterId);
        }
        if (viewData.entityKey === "characters") {
          if (contextWorldId) params.set("worldId", contextWorldId);
          if (contextCampaignId) params.set("campaignId", contextCampaignId);
          if (contextCharacterId) params.set("characterId", contextCharacterId);
        }

        const dataUrl = params.toString()
          ? `${viewData.endpoint}?${params.toString()}`
          : viewData.endpoint;

        const dataResponse = await fetch(dataUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!dataResponse.ok) {
          throw new Error("Unable to load data.");
        }

        const data = (await dataResponse.json()) as Record<string, unknown>[];
        if (ignore) return;
        setRows(data);
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load view.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    void loadView();

    return () => {
      ignore = true;
    };
  }, [token, viewKey, contextWorldId, contextCampaignId, contextCharacterId]);

  useEffect(() => {
    let ignore = false;

    const loadReferences = async () => {
      if (!view) return;

      const refFields = view.fields.filter(
        (field) => field.listVisible && field.fieldType === "REFERENCE" && field.referenceEntityKey
      );

      if (refFields.length === 0 || rows.length === 0) {
        setReferenceMaps({});
        return;
      }

      const idsByEntity: Record<string, Set<string>> = {};
      refFields.forEach((field) => {
        const entityKey = field.referenceEntityKey as string;
        if (!idsByEntity[entityKey]) idsByEntity[entityKey] = new Set();
        rows.forEach((row) => {
          const value = row[field.fieldKey];
          if (value) idsByEntity[entityKey].add(String(value));
        });
      });

      const entityKeys = Object.keys(idsByEntity);
      const results = await Promise.all(
        entityKeys.map(async (entityKey) => {
          const ids = Array.from(idsByEntity[entityKey]);
          if (ids.length === 0) return [entityKey, {}] as const;
          const response = await fetch(
            `/api/references?entityKey=${entityKey}&ids=${ids.join(",")}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!response.ok) return [entityKey, {}] as const;
          const data = (await response.json()) as Array<{ id: string; label: string }>;
          const map = data.reduce<Record<string, string>>((acc, item) => {
            acc[item.id] = item.label;
            return acc;
          }, {});
          return [entityKey, map] as const;
        })
      );

      if (ignore) return;
      const nextMaps: Record<string, Record<string, string>> = {};
      results.forEach(([entityKey, map]) => {
        nextMaps[entityKey] = map;
      });
      setReferenceMaps(nextMaps);
    };

    void loadReferences();

    return () => {
      ignore = true;
    };
  }, [view, rows, token]);

  const listFields = useMemo(() => {
    if (!view) return [];
    return view.fields.filter((field) => field.listVisible).sort(fieldSorter);
  }, [view]);

  const filteredRows = useMemo(() => filterRows(rows, listFields, query), [rows, listFields, query]);
  const primaryField = listFields[0];
  const statusField = listFields.find((field) => field.fieldType === "SELECT" && isStatusField(field));
  const secondaryFields = listFields.filter((field) => field !== primaryField);

  const getDisplayValue = (field: ViewField, row: Record<string, unknown>) => {
    const rawValue = row[field.fieldKey];
    if (rawValue === null || rawValue === undefined) return "";

    if (field.fieldType === "BOOLEAN") {
      const boolValue = rawValue === true || rawValue === "true" || rawValue === 1;
      return boolValue ? "Yes" : "No";
    }

    const listKey = field.optionsListKey ?? "";
    const mapped = listKey && rawValue != null ? choiceMaps[listKey]?.[String(rawValue)] : undefined;
    const referenceEntity = field.referenceEntityKey ?? "";
    const referenceLabel =
      field.fieldType === "REFERENCE" && rawValue != null
        ? referenceMaps[referenceEntity]?.[String(rawValue)]
        : undefined;

    return mapped ?? referenceLabel ?? rawValue;
  };

  const renderCellValue = (field: ViewField, row: Record<string, unknown>) => {
    const display = getDisplayValue(field, row);
    const text = String(display ?? "");
    if (field.fieldType === "SELECT" && isStatusField(field) && text) {
      const tone = getStatusTone(text);
      return <span className={`status-badge status-badge--${tone}`}>{text}</span>;
    }
    return text;
  };

  if (loading) {
    return <div className="view-state">Loading view...</div>;
  }

  if (error || !view) {
    return <div className="view-state error">{error ?? "View unavailable."}</div>;
  }

  return (
    <div className="list-view">
      <div className="list-view__header">
        <div>
          <h1>{view.title}</h1>
          <p className="list-view__subtitle">List view</p>
        </div>
        <div className="list-view__actions">
          <input
            className="list-view__search"
            placeholder="Search records"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="primary-button" onClick={() => onOpenForm("new")}>
            New
          </button>
        </div>
      </div>

      <div className="list-view__table">
        <div className="list-view__row list-view__row--header" role="row">
          {listFields.map((field) => (
            <div
              key={field.fieldKey}
              className="list-view__cell"
              style={{ width: field.width ?? "auto" }}
            >
              {field.label}
            </div>
          ))}
          <div className="list-view__cell list-view__cell--actions">Actions</div>
        </div>
        {filteredRows.length === 0 ? (
          <div className="list-view__empty">No records yet.</div>
        ) : (
          filteredRows.map((row) => (
            <div
              key={String(row.id)}
              className="list-view__row"
              role="button"
              tabIndex={0}
              onClick={() => onOpenForm(String(row.id))}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenForm(String(row.id));
                }
              }}
            >
              {listFields.map((field) => {
                const value = renderCellValue(field, row);
                const typeClass =
                  field.fieldType === "NUMBER"
                    ? "list-view__cell--numeric"
                    : field.fieldType === "BOOLEAN"
                      ? "list-view__cell--boolean"
                      : "";

                return (
                  <div key={field.fieldKey} className={`list-view__cell ${typeClass}`}>
                    {value}
                  </div>
                );
              })}
              <div className="list-view__cell list-view__cell--actions">
                <button
                  type="button"
                  className="ghost-button list-view__row-action"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenForm(String(row.id));
                  }}
                >
                  Open
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="list-view__cards">
        {filteredRows.length === 0 ? (
          <div className="list-view__empty">No records yet.</div>
        ) : (
          filteredRows.map((row) => {
            const titleValue = primaryField ? renderCellValue(primaryField, row) : "Record";
            const statusValue = statusField ? renderCellValue(statusField, row) : null;

            return (
              <div key={String(row.id)} className="list-card">
                <div className="list-card__header">
                  <div className="list-card__title">{titleValue}</div>
                  {statusValue ? <div className="list-card__badge">{statusValue}</div> : null}
                </div>
                <div className="list-card__body">
                  {secondaryFields.map((field) => (
                    <div key={field.fieldKey} className="list-card__field">
                      <span className="list-card__label">{field.label}</span>
                      <span className="list-card__value">{renderCellValue(field, row)}</span>
                    </div>
                  ))}
                </div>
                <div className="list-card__actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => onOpenForm(String(row.id))}
                  >
                    View
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

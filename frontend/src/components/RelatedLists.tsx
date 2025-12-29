import { useEffect, useMemo, useState } from "react";
import { dispatchUnauthorized } from "../utils/auth";
import { usePopout } from "./PopoutProvider";

type RelatedListField = {
  id: string;
  fieldKey: string;
  label: string;
  source: "RELATED" | "JOIN";
  listOrder: number;
};

type RelatedListConfig = {
  id: string;
  key: string;
  title: string;
  parentEntityKey: string;
  relatedEntityKey: string;
  joinEntityKey: string;
  parentFieldKey: string;
  relatedFieldKey: string;
  listOrder: number;
  adminOnly: boolean;
  fields: RelatedListField[];
};

type RelatedListItem = {
  relatedId: string;
  relatedData: Record<string, unknown>;
  joinData: Record<string, unknown>;
};

type Choice = { value: string; label: string };

type RelatedListsProps = {
  token: string;
  parentEntityKey: string;
  parentId: string;
  disabled?: boolean;
  canManage?: boolean;
};

type AddState = {
  query: string;
  options: Choice[];
  open: boolean;
  loading: boolean;
};

const emptyAddState: AddState = { query: "", options: [], open: false, loading: false };

const entityFieldTypeOptions: Choice[] = [
  { value: "TEXT", label: "Text" },
  { value: "TEXTAREA", label: "Text Area" },
  { value: "BOOLEAN", label: "Boolean" },
  { value: "CHOICE", label: "Choice" },
  { value: "ENTITY_REFERENCE", label: "Entity Reference" },
  { value: "LOCATION_REFERENCE", label: "Location Reference" }
];

type EntityFieldCreateFormProps = {
  token: string;
  entityTypeId: string;
  onCreated: () => void;
  onClose: () => void;
};

const EntityFieldCreateForm = ({ token, entityTypeId, onCreated, onClose }: EntityFieldCreateFormProps) => {
  const [fieldKey, setFieldKey] = useState("");
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState("TEXT");
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!fieldKey.trim() || !label.trim()) {
      setError("Field key and label are required.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/entity-fields", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          entityTypeId,
          fieldKey: fieldKey.trim(),
          label: label.trim(),
          fieldType,
          required
        })
      });
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Unable to create field.");
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create field.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="related-lists__field-form" onSubmit={handleSubmit}>
      <label>
        <span>Field Key</span>
        <input
          type="text"
          value={fieldKey}
          onChange={(event) => setFieldKey(event.target.value)}
          placeholder="e.g. armor_class"
        />
      </label>
      <label>
        <span>Label</span>
        <input
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Armor Class"
        />
      </label>
      <label>
        <span>Field Type</span>
        <select value={fieldType} onChange={(event) => setFieldType(event.target.value)}>
          {entityFieldTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="related-lists__checkbox">
        <input
          type="checkbox"
          checked={required}
          onChange={(event) => setRequired(event.target.checked)}
        />
        <span>Required</span>
      </label>
      {error ? <div className="related-lists__error">{error}</div> : null}
      <div className="related-lists__field-actions">
        <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={saving}>
          {saving ? "Creating..." : "Create field"}
        </button>
      </div>
    </form>
  );
};

export default function RelatedLists({
  token,
  parentEntityKey,
  parentId,
  disabled,
  canManage = true
}: RelatedListsProps) {
  const { showPopout, closePopout } = usePopout();
  const [lists, setLists] = useState<RelatedListConfig[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [itemsByList, setItemsByList] = useState<Record<string, RelatedListItem[]>>({});
  const [addStateByList, setAddStateByList] = useState<Record<string, AddState>>({});
  const [loadingListKey, setLoadingListKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    const loadLists = async () => {
      setError(null);
      try {
        const response = await fetch(`/api/related-lists?entityKey=${parentEntityKey}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (response.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (!response.ok) {
          throw new Error("Unable to load related lists.");
        }
        const data = (await response.json()) as RelatedListConfig[];
        if (ignore) return;
        const sorted = [...data].sort((a, b) => a.listOrder - b.listOrder);
        setLists(sorted);
        if (!activeKey && sorted.length > 0) {
          setActiveKey(sorted[0].key);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Unable to load related lists.");
        }
      }
    };

    if (!disabled) {
      void loadLists();
    }

    return () => {
      ignore = true;
    };
  }, [token, parentEntityKey, disabled, activeKey]);

  const activeList = useMemo(() => lists.find((list) => list.key === activeKey) ?? null, [lists, activeKey]);
  const readOnlyJoinKeys = useMemo(
    () =>
      new Set([
        "packEntityTypeTemplate",
        "packLocationTypeTemplate",
        "packRelationshipTypeTemplate",
        "relationshipTypeRuleFrom",
        "relationshipTypeRuleTo",
        "locationTypeRuleParent",
        "locationTypeRuleChild"
      ]),
    []
  );

  const loadItems = async (listKey: string) => {
    setLoadingListKey(listKey);
    try {
      const response = await fetch(`/api/related-lists/${listKey}?parentId=${parentId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Unable to load related list.");
      }
      const data = (await response.json()) as { items: RelatedListItem[] };
      setItemsByList((current) => ({ ...current, [listKey]: data.items ?? [] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load related list.");
    } finally {
      setLoadingListKey(null);
    }
  };

  useEffect(() => {
    if (!activeList || disabled) return;
    void loadItems(activeList.key);
  }, [activeList?.key, disabled, parentId]);

  const activeItems = activeList ? itemsByList[activeList.key] ?? [] : [];
  const addState = activeList ? addStateByList[activeList.key] ?? emptyAddState : emptyAddState;
  const canCreateEntityField = activeList?.joinEntityKey === "entityField";
  const canMutate = canManage && (!activeList || !readOnlyJoinKeys.has(activeList.joinEntityKey));

  const handleSearch = async (list: RelatedListConfig, query: string) => {
    setAddStateByList((current) => ({
      ...current,
      [list.key]: { ...(current[list.key] ?? emptyAddState), query, loading: true }
    }));

    const searchParams = new URLSearchParams({
      entityKey: list.relatedEntityKey,
      query
    });
    if (list.parentEntityKey === "campaigns" && list.relatedEntityKey === "characters") {
      searchParams.set("campaignId", parentId);
    }
    const response = await fetch(`/api/references?${searchParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) {
      dispatchUnauthorized();
      setAddStateByList((current) => ({
        ...current,
        [list.key]: { ...(current[list.key] ?? emptyAddState), loading: false, options: [] }
      }));
      return;
    }

    if (!response.ok) {
      setAddStateByList((current) => ({
        ...current,
        [list.key]: { ...(current[list.key] ?? emptyAddState), loading: false, options: [] }
      }));
      return;
    }

    const data = (await response.json()) as Array<{ id: string; label: string }>;
    const options = data.map((item) => ({ value: item.id, label: item.label }));

    setAddStateByList((current) => ({
      ...current,
      [list.key]: {
        ...(current[list.key] ?? emptyAddState),
        loading: false,
        options,
        open: true
      }
    }));
  };

  const handleAdd = async (list: RelatedListConfig, option: Choice) => {
    const response = await fetch(`/api/related-lists/${list.key}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ parentId, relatedId: option.value })
      }
    );

    if (response.status === 401) {
      dispatchUnauthorized();
      return;
    }

    setAddStateByList((current) => ({
      ...current,
      [list.key]: { ...emptyAddState }
    }));

    await loadItems(list.key);
  };

  const handleRemove = async (list: RelatedListConfig, relatedId: string) => {
    const response = await fetch(`/api/related-lists/${list.key}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ parentId, relatedId })
      }
    );

    if (response.status === 401) {
      dispatchUnauthorized();
      return;
    }

    await loadItems(list.key);
  };

  if (disabled) {
    return (
      <div className="related-lists related-lists--disabled">
        <h2>Related Lists</h2>
        <p>Save this record to manage related lists.</p>
      </div>
    );
  }

  if (lists.length === 0) {
    return null;
  }

  return (
    <section className="related-lists">
      <div className="related-lists__header">
        <h2>Related Lists</h2>
        {error ? <span className="related-lists__error">{error}</span> : null}
      </div>
      <div className="related-lists__tabs">
        {lists.map((list) => (
          <button
            key={list.key}
            type="button"
            className={`ghost-button ${list.key === activeKey ? "is-active" : ""}`}
            onClick={() => setActiveKey(list.key)}
          >
            {list.title}
          </button>
        ))}
      </div>

      {activeList ? (
        <div className="related-lists__panel">
          <div className="related-lists__toolbar">
            {canCreateEntityField && canManage ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  let popoutId = "";
                  popoutId = showPopout({
                    title: "New Field",
                    message: (
                      <EntityFieldCreateForm
                        token={token}
                        entityTypeId={parentId}
                        onCreated={() => {
                          void loadItems(activeList.key);
                        }}
                        onClose={() => closePopout(popoutId)}
                      />
                    ),
                    actions: [{ label: "Close" }]
                  });
                }}
              >
                New field
              </button>
            ) : canMutate ? (
              <div className="related-lists__add" onBlur={(event) => {
                const nextTarget = event.relatedTarget as Node | null;
                if (nextTarget && event.currentTarget.contains(nextTarget)) return;
                setAddStateByList((current) => ({
                  ...current,
                  [activeList.key]: { ...(current[activeList.key] ?? emptyAddState), open: false }
                }));
              }}>
                <input
                  type="text"
                  placeholder={`Add ${activeList.title}...`}
                  value={addState.query}
                  onFocus={() => {
                    void handleSearch(activeList, addState.query);
                  }}
                  onChange={(event) => {
                    void handleSearch(activeList, event.target.value);
                  }}
                />
                {addState.open ? (
                  <div className="related-lists__options">
                    {addState.options.length > 0 ? (
                      addState.options.map((option) => (
                        <button
                          type="button"
                          key={option.value}
                          onClick={() => handleAdd(activeList, option)}
                        >
                          {option.label}
                        </button>
                      ))
                    ) : (
                      <div className="related-lists__empty">No matches.</div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="related-lists__table">
            <div className="related-lists__row related-lists__row--header">
              {activeList.fields
                .slice()
                .sort((a, b) => a.listOrder - b.listOrder)
                .map((field) => (
                  <div key={`${field.source}-${field.fieldKey}`} className="related-lists__cell">
                    {field.label}
                  </div>
                ))}
              <div className="related-lists__cell">Actions</div>
            </div>

            {loadingListKey === activeList.key ? (
              <div className="related-lists__empty">Loading...</div>
            ) : activeItems.length === 0 ? (
              <div className="related-lists__empty">No related records yet.</div>
            ) : (
              activeItems.map((item) => (
                <div key={item.relatedId} className="related-lists__row">
                  {activeList.fields
                    .slice()
                    .sort((a, b) => a.listOrder - b.listOrder)
                    .map((field) => {
                      const value =
                        field.source === "JOIN"
                          ? item.joinData[field.fieldKey]
                          : item.relatedData[field.fieldKey];
                      return (
                        <div key={`${item.relatedId}-${field.source}-${field.fieldKey}`} className="related-lists__cell">
                          {value !== undefined && value !== null ? String(value) : "-"}
                        </div>
                      );
                    })}
                  <div className="related-lists__cell">
                    {canMutate ? (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => handleRemove(activeList, item.relatedId)}
                      >
                        Remove
                      </button>
                    ) : (
                      <span className="related-lists__hint">No access</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

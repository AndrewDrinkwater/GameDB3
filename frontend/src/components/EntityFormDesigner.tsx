import { useEffect, useMemo, useRef, useState } from "react";
import ConditionBuilder from "./ConditionBuilder";
import { dispatchUnauthorized } from "../utils/auth";

type FormSection = {
  id: string;
  title: string;
  layout: "ONE_COLUMN" | "TWO_COLUMN";
  sortOrder: number;
};

type FieldDefinition = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  required: boolean;
  formOrder: number;
  formSectionId?: string | null;
  formColumn?: number | null;
  conditions?: unknown;
};

type Choice = { value: string; label: string };

type EntityFormDesignerProps = {
  token: string;
  entityTypeId: string;
};

const sortByOrder = (a: { sortOrder?: number }, b: { sortOrder?: number }) =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

const sortByFormOrder = (a: FieldDefinition, b: FieldDefinition) => a.formOrder - b.formOrder;

export default function EntityFormDesigner({ token, entityTypeId }: EntityFormDesignerProps) {
  const [sections, setSections] = useState<FormSection[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const dragFieldId = useRef<string | null>(null);

  const conditionFieldOptions = useMemo<Choice[]>(
    () => fields.map((field) => ({ value: field.fieldKey, label: field.label })),
    [fields]
  );

  const handleUnauthorized = (response: Response) => {
    if (response.status === 401) {
      dispatchUnauthorized();
      return true;
    }
    return false;
  };

  const fetchSections = async () => {
    const response = await fetch(`/api/entity-form-sections?entityTypeId=${entityTypeId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (handleUnauthorized(response)) return [];
    if (!response.ok) return [];
    return (await response.json()) as FormSection[];
  };

  const fetchFields = async () => {
    const response = await fetch(`/api/entity-fields?entityTypeId=${entityTypeId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (handleUnauthorized(response)) return [];
    if (!response.ok) return [];
    return (await response.json()) as FieldDefinition[];
  };

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      const [sectionData, fieldData] = await Promise.all([fetchSections(), fetchFields()]);
      if (ignore) return;
      const sortedSections = [...sectionData].sort(sortByOrder);
      let sortedFields = [...fieldData].sort(sortByFormOrder);
      if (sortedSections.length > 0) {
        const defaultSectionId = sortedSections[0].id;
        const unassigned = sortedFields.filter((field) => !field.formSectionId);
        if (unassigned.length > 0) {
          sortedFields = sortedFields.map((field) =>
            field.formSectionId
              ? field
              : { ...field, formSectionId: defaultSectionId, formColumn: field.formColumn ?? 1 }
          );
          await Promise.all(
            unassigned.map((field) =>
              persistFieldUpdate(field.id, {
                formSectionId: defaultSectionId,
                formColumn: field.formColumn ?? 1
              })
            )
          );
        }
      }
      setSections(sortedSections);
      setFields(sortedFields);
      setLoading(false);
    };

    void load();
    return () => {
      ignore = true;
    };
  }, [entityTypeId, token]);

  const persistFieldUpdate = async (fieldId: string, data: Partial<FieldDefinition>) => {
    const response = await fetch(`/api/entity-fields/${fieldId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    handleUnauthorized(response);
  };

  const persistSectionUpdate = async (sectionId: string, data: Partial<FormSection>) => {
    const response = await fetch(`/api/entity-form-sections/${sectionId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    handleUnauthorized(response);
  };

  const resolveConditions = (value: unknown) => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return undefined;
      }
    }
    return value;
  };

  const handleAddSection = async () => {
    const nextOrder = sections.length > 0 ? Math.max(...sections.map((s) => s.sortOrder ?? 0)) + 1 : 1;
    const response = await fetch("/api/entity-form-sections", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        entityTypeId,
        title: "New Section",
        layout: "ONE_COLUMN",
        sortOrder: nextOrder
      })
    });
    if (handleUnauthorized(response)) return;
    if (!response.ok) return;
    const created = (await response.json()) as FormSection;
    setSections((current) => [...current, created].sort(sortByOrder));
  };

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    setSections((current) => {
      const sorted = [...current].sort(sortByOrder);
      const index = sorted.findIndex((section) => section.id === sectionId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) return current;
      const reordered = [...sorted];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(targetIndex, 0, moved);
      const updated = reordered.map((section, orderIndex) => ({
        ...section,
        sortOrder: orderIndex + 1
      }));
      const changed = updated.filter((section) => {
        const previous = current.find((item) => item.id === section.id);
        return previous?.sortOrder !== section.sortOrder;
      });
      void Promise.all(
        changed.map((section) => persistSectionUpdate(section.id, { sortOrder: section.sortOrder }))
      );
      return updated;
    });
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (!window.confirm("Delete this section? Fields will be unassigned.")) return;
    const response = await fetch(`/api/entity-form-sections/${sectionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (handleUnauthorized(response)) return;
    if (!response.ok) return;
    setSections((current) => current.filter((section) => section.id !== sectionId));
    setFields((current) =>
      current.map((field) =>
        field.formSectionId === sectionId ? { ...field, formSectionId: null, formColumn: 1 } : field
      )
    );
  };

  const updateField = (fieldId: string, updater: (field: FieldDefinition) => FieldDefinition) => {
    setFields((current) => current.map((field) => (field.id === fieldId ? updater(field) : field)));
  };

  const handleDropField = (sectionId: string, column: number, index: number) => {
    const movingId = dragFieldId.current;
    if (!movingId) return;
    const moving = fields.find((field) => field.id === movingId);
    if (!moving) return;

    const remaining = fields.filter((field) => field.id !== movingId);
    const groupKey = (sectionKey: string | null, columnKey: number) =>
      `${sectionKey ?? "none"}:${columnKey}`;

    const groups = new Map<string, FieldDefinition[]>();
    remaining.forEach((field) => {
      const key = groupKey(field.formSectionId ?? null, field.formColumn ?? 1);
      const list = groups.get(key) ?? [];
      list.push(field);
      groups.set(key, list);
    });

    const targetKey = groupKey(sectionId, column);
    const targetList = (groups.get(targetKey) ?? []).sort(sortByFormOrder);
    const nextField: FieldDefinition = {
      ...moving,
      formSectionId: sectionId,
      formColumn: column
    };
    targetList.splice(index, 0, nextField);
    groups.set(targetKey, targetList);

    const updatedFields: FieldDefinition[] = [];
    groups.forEach((list, key) => {
      const sorted = list.sort(sortByFormOrder);
      sorted.forEach((field, orderIndex) => {
        const next = { ...field, formOrder: orderIndex + 1 };
        updatedFields.push(next);
      });
    });

    const previousMap = new Map(fields.map((field) => [field.id, field]));
    const changed = updatedFields.filter((field) => {
      const prev = previousMap.get(field.id);
      if (!prev) return true;
      return (
        prev.formOrder !== field.formOrder ||
        prev.formSectionId !== field.formSectionId ||
        (prev.formColumn ?? 1) !== (field.formColumn ?? 1)
      );
    });

    setFields(updatedFields);
    dragFieldId.current = null;
    void Promise.all(
      changed.map((field) =>
        persistFieldUpdate(field.id, {
          formOrder: field.formOrder,
          formSectionId: field.formSectionId ?? null,
          formColumn: field.formColumn ?? 1
        })
      )
    );
  };

  if (loading) {
    return <div className="form-designer__state">Loading form designer...</div>;
  }

  return (
    <div className="form-designer">
      <div className="form-designer__header">
        <div>
          <h3>Form Designer</h3>
          <p>Arrange fields, group them into sections, and tune visibility.</p>
        </div>
        <button type="button" className="ghost-button" onClick={handleAddSection}>
          Add section
        </button>
      </div>

      {sections.length === 0 ? (
        <div className="form-designer__state">No sections yet. Add one to start.</div>
      ) : null}

      {sections.map((section) => {
        const layout = section.layout ?? "ONE_COLUMN";
        const columns = layout === "TWO_COLUMN" ? [1, 2] : [1];
        return (
          <div key={section.id} className="form-designer__section">
            <div className="form-designer__section-header">
              <input
                className="form-designer__title-input"
                value={section.title}
                onChange={(event) => {
                  const title = event.target.value;
                  setSections((current) =>
                    current.map((item) => (item.id === section.id ? { ...item, title } : item))
                  );
                }}
                onBlur={() => persistSectionUpdate(section.id, { title: section.title })}
              />
              <div className="form-designer__section-actions">
                <div className="form-designer__section-order">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => moveSection(section.id, -1)}
                    disabled={sections.findIndex((item) => item.id === section.id) === 0}
                    aria-label="Move section up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => moveSection(section.id, 1)}
                    disabled={
                      sections.findIndex((item) => item.id === section.id) === sections.length - 1
                    }
                    aria-label="Move section down"
                  >
                    ↓
                  </button>
                </div>
                <select
                  value={layout}
                  onChange={(event) => {
                    const nextLayout = event.target.value as FormSection["layout"];
                    setSections((current) =>
                      current.map((item) =>
                        item.id === section.id ? { ...item, layout: nextLayout } : item
                      )
                    );
                    void persistSectionUpdate(section.id, { layout: nextLayout });
                  }}
                >
                  <option value="ONE_COLUMN">Single column</option>
                  <option value="TWO_COLUMN">Two columns</option>
                </select>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => handleDeleteSection(section.id)}
                >
                  Remove
                </button>
              </div>
            </div>
            <div
              className={`form-designer__columns ${
                layout === "TWO_COLUMN" ? "form-designer__columns--two" : ""
              }`}
            >
              {columns.map((column) => {
                const columnFields = fields
                  .filter(
                    (field) =>
                      (field.formSectionId ?? null) === section.id &&
                      (field.formColumn ?? 1) === column
                  )
                  .sort(sortByFormOrder);

                return (
                  <div
                    key={`${section.id}-${column}`}
                    className="form-designer__column"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDropField(section.id, column, columnFields.length)}
                  >
                    {columnFields.map((field, index) => (
                      <div
                        key={field.id}
                        className="form-designer__field"
                        draggable
                        onDragStart={() => {
                          dragFieldId.current = field.id;
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.stopPropagation();
                          handleDropField(section.id, column, index);
                        }}
                      >
                        <div className="form-designer__field-header">
                          <div className="form-designer__field-title-group">
                            <span className="form-designer__drag-handle" aria-hidden="true">
                              ⋮⋮
                            </span>
                            <div className="form-designer__field-title">{field.label}</div>
                            <div className="form-designer__field-meta">
                              {field.fieldType} · {field.fieldKey}
                            </div>
                          </div>
                          <label className="form-designer__required">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(event) => {
                                const nextRequired = event.target.checked;
                                updateField(field.id, (current) => ({
                                  ...current,
                                  required: nextRequired
                                }));
                                void persistFieldUpdate(field.id, { required: nextRequired });
                              }}
                            />
                            Required
                          </label>
                        </div>
                        <div className="form-designer__field-actions">
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() =>
                              setExpanded((current) => ({
                                ...current,
                                [field.id]: !current[field.id]
                              }))
                            }
                          >
                            Conditions
                          </button>
                        </div>
                        {expanded[field.id] ? (
                          <div className="form-designer__conditions">
                            <ConditionBuilder
                              value={resolveConditions(field.conditions) as any}
                              fieldOptions={conditionFieldOptions}
                              onChange={(next) => {
                                updateField(field.id, (current) => ({
                                  ...current,
                                  conditions: next
                                }));
                                void persistFieldUpdate(field.id, { conditions: next });
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {columnFields.length === 0 ? (
                      <div className="form-designer__empty">Drag fields here.</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

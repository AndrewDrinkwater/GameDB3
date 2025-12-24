import { useEffect, useMemo, useState } from "react";
import RelatedLists from "./RelatedLists";

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
  referenceScope?: string | null;
  allowMultiple?: boolean;
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

type FormViewProps = {
  token: string;
  viewKey: string;
  recordId: string | "new";
  onBack: () => void;
  currentUserId?: string;
  currentUserLabel?: string;
  currentUserRole?: string;
  initialValues?: Record<string, unknown>;
  initialLabels?: Record<string, string>;
};

const fieldSorter = (a: ViewField, b: ViewField) => a.formOrder - b.formOrder;

const coerceValue = (fieldType: string, value: unknown) => {
  if (fieldType === "BOOLEAN") {
    return Boolean(value);
  }
  if (value === null || value === undefined) return "";
  return String(value);
};

export default function FormView({
  token,
  viewKey,
  recordId,
  onBack,
  currentUserId,
  currentUserLabel,
  currentUserRole,
  initialValues,
  initialLabels
}: FormViewProps) {
  const [view, setView] = useState<SystemView | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [choiceMaps, setChoiceMaps] = useState<Record<string, Choice[]>>({});
  const [referenceOptions, setReferenceOptions] = useState<Record<string, Choice[]>>({});
  const [referenceLabels, setReferenceLabels] = useState<Record<string, string>>({});
  const [referenceSelections, setReferenceSelections] = useState<Record<string, Choice[]>>({});
  const [referenceOpen, setReferenceOpen] = useState<Record<string, boolean>>({});

  const isNew = recordId === "new";

  useEffect(() => {
    let ignore = false;

    const loadView = async () => {
      setLoading(true);
      setError(null);
      setReferenceOptions({});
      setReferenceLabels({});
      setReferenceSelections({});
      setReferenceOpen({});
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
              .filter((field) => field.formVisible && field.optionsListKey)
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

        const newChoiceMaps: Record<string, Choice[]> = {};
        listKeyResults.forEach(([listKey, choices]) => {
          newChoiceMaps[listKey] = choices;
        });
        setChoiceMaps(newChoiceMaps);

        if (!isNew) {
          const recordResponse = await fetch(`${viewData.endpoint}/${recordId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (!recordResponse.ok) {
            throw new Error("Unable to load record.");
          }

          const record = (await recordResponse.json()) as Record<string, unknown>;
          if (!ignore) {
            setFormData(record);
          }
        } else {
          setFormData(initialValues ?? {});
          if (initialLabels) {
            setReferenceLabels((current) => ({ ...current, ...initialLabels }));
          }
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load form.");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    void loadView();

    return () => {
      ignore = true;
    };
  }, [token, viewKey, recordId, isNew, initialValues, initialLabels]);

  useEffect(() => {
    if (!isNew || !initialValues) return;
    setFormData((current) => ({ ...initialValues, ...current }));
    if (initialLabels) {
      setReferenceLabels((current) => ({ ...current, ...initialLabels }));
    }
  }, [isNew, initialValues, initialLabels]);

  useEffect(() => {
    if (!view || !isNew) return;
    if (!currentUserId) return;

    const ownerField = view.fields.find((field) => field.fieldKey === "playerId");
    if (!ownerField) return;

    setFormData((current) => {
      if (current.playerId) return current;
      return { ...current, playerId: currentUserId };
    });

    if (currentUserLabel) {
      setReferenceLabels((current) => ({ ...current, playerId: currentUserLabel }));
    }
  }, [view, isNew, currentUserId, currentUserLabel]);

  useEffect(() => {
    let ignore = false;

    const loadReferenceLabels = async () => {
      if (!view) return;
      const refFields = view.fields.filter(
        (field) => field.formVisible && field.fieldType === "REFERENCE" && field.referenceEntityKey
      );

      if (refFields.length === 0) return;

      const labelMap: Record<string, string> = {};
      await Promise.all(
        refFields.map(async (field) => {
          const value = formData[field.fieldKey];
          if (!value) return;
          const entityKey = field.referenceEntityKey as string;
          const response = await fetch(
            `/api/references?entityKey=${entityKey}&ids=${String(value)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!response.ok) return;
          const data = (await response.json()) as Array<{ id: string; label: string }>;
          if (data.length > 0) {
            if (Array.isArray(value)) {
              setReferenceSelections((current) => ({
                ...current,
                [field.fieldKey]: data.map((item) => ({ value: item.id, label: item.label }))
              }));
            } else if (data[0]) {
              labelMap[field.fieldKey] = data[0].label;
            }
          }
        })
      );

      if (!ignore) {
        setReferenceLabels((current) => ({ ...current, ...labelMap }));
      }
    };

    void loadReferenceLabels();

    return () => {
      ignore = true;
    };
  }, [view, formData, token]);

  const formFields = useMemo(() => {
    if (!view) return [];
    return view.fields.filter((field) => field.formVisible).sort(fieldSorter);
  }, [view]);

  const handleChange = (fieldKey: string, value: unknown) => {
    setFormData((current) => ({ ...current, [fieldKey]: value }));
  };

  const handleReferenceSearch = async (field: ViewField, query: string) => {
    if (!field.referenceEntityKey) return;
    const scopeParam = field.referenceScope ? `&scope=${field.referenceScope}` : "";
    const response = await fetch(
      `/api/references?entityKey=${field.referenceEntityKey}&query=${encodeURIComponent(query)}${scopeParam}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) return;
    const data = (await response.json()) as Array<{ id: string; label: string }>;
    const options = data.map((item) => ({ value: item.id, label: item.label }));
    setReferenceOptions((current) => ({ ...current, [field.fieldKey]: options }));
  };

  const resolveReferenceSelection = (field: ViewField) => {
    if (field.allowMultiple) return;
    const options = referenceOptions[field.fieldKey] ?? [];
    const labelValue = (referenceLabels[field.fieldKey] ?? "").trim();

    if (options.length === 1) {
      handleReferenceSelect(field, options[0]);
      return;
    }

    const match = options.find(
      (option) => option.label.toLowerCase() === labelValue.toLowerCase()
    );
    if (match) {
      handleReferenceSelect(field, match);
    }
  };

  const handleReferenceSelect = (field: ViewField, option: Choice) => {
    if (field.allowMultiple) {
      setReferenceSelections((current) => {
        const existing = current[field.fieldKey] ?? [];
        if (existing.some((item) => item.value === option.value)) {
          return current;
        }
        const next = [...existing, option];
        handleChange(
          field.fieldKey,
          next.map((item) => item.value)
        );
        return { ...current, [field.fieldKey]: next };
      });
      setReferenceLabels((current) => ({ ...current, [field.fieldKey]: "" }));
    } else {
      handleChange(field.fieldKey, option.value);
      setReferenceLabels((current) => ({ ...current, [field.fieldKey]: option.label }));
    }
    setReferenceOptions((current) => ({ ...current, [field.fieldKey]: [] }));
    setReferenceOpen((current) => ({ ...current, [field.fieldKey]: false }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!view) return;
    setSaving(true);

    const payload: Record<string, unknown> = {};
    const missingFields = formFields
      .filter((field) => field.required)
      .filter((field) => {
        const value = formData[field.fieldKey];
        if (field.fieldType === "REFERENCE") {
          return field.allowMultiple ? !Array.isArray(value) || value.length === 0 : !value;
        }
        return value === undefined || value === "";
      })
      .map((field) => field.label);

    if (missingFields.length > 0) {
      setError(`Missing required fields: ${missingFields.join(", ")}`);
      setSaving(false);
      return;
    }

    formFields.forEach((field) => {
      const value = formData[field.fieldKey];
      if (field.fieldType === "PASSWORD" && !value) {
        return;
      }
      if (value !== undefined) {
        payload[field.fieldKey] = field.fieldType === "BOOLEAN" ? Boolean(value) : value;
      }
    });

    try {
      const response = await fetch(isNew ? view.endpoint : `${view.endpoint}/${recordId}`, {
        method: isNew ? "POST" : "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Save failed.");
      }

      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!view || isNew) return;
    if (!window.confirm("Delete this record?")) return;

    try {
      const response = await fetch(`${view.endpoint}/${recordId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error("Delete failed.");
      }

      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  if (loading) {
    return <div className="view-state">Loading form...</div>;
  }

  if (error || !view) {
    return <div className="view-state error">{error ?? "Form unavailable."}</div>;
  }

  return (
    <div className="form-view">
      <div className="form-view__header">
        <button type="button" className="ghost-button" onClick={onBack}>
          &lt;- Back
        </button>
        <div>
          <h1>{view.title}</h1>
          <p className="form-view__subtitle">{isNew ? "Create" : "Edit"}</p>
        </div>
        <div className="form-view__actions">
          {!isNew ? (
            <button type="button" className="danger-button" onClick={handleDelete}>
              Delete
            </button>
          ) : null}
        </div>
      </div>

      <form className="form-view__form" onSubmit={handleSubmit}>
        {formFields.map((field) => {
          const value = formData[field.fieldKey];
          const coerced = coerceValue(field.fieldType, value);
          const listKey = field.optionsListKey ?? "";
          const choices = listKey ? choiceMaps[listKey] ?? [] : [];

          if (field.fieldType === "BOOLEAN") {
            return (
              <label key={field.fieldKey} className="form-view__field form-view__field--boolean">
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) => handleChange(field.fieldKey, event.target.checked)}
                />
                <span>{field.label}</span>
              </label>
            );
          }

          if (field.fieldType === "REFERENCE") {
            const options = referenceOptions[field.fieldKey] ?? [];
            const labelValue = referenceLabels[field.fieldKey] ?? "";
            const isOpen = referenceOpen[field.fieldKey];
            const selections = referenceSelections[field.fieldKey] ?? [];
            const disabled =
              field.readOnly || (field.fieldKey === "playerId" && currentUserRole !== "ADMIN");

            return (
              <label key={field.fieldKey} className="form-view__field">
                <span className="form-view__label">
                  {field.label}
                  {field.required ? <span className="form-view__required">*</span> : null}
                </span>
                <div
                  className="reference-field"
                  onBlur={(event) => {
                    const nextTarget = event.relatedTarget as Node | null;
                    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
                    resolveReferenceSelection(field);
                    setReferenceOpen((current) => ({ ...current, [field.fieldKey]: false }));
                  }}
                >
                  {field.allowMultiple && selections.length > 0 ? (
                    <div className="reference-field__chips">
                      {selections.map((item) => (
                        <button
                          type="button"
                          key={item.value}
                          className="reference-field__chip"
                          onClick={() => {
                            const next = selections.filter((entry) => entry.value !== item.value);
                            setReferenceSelections((current) => ({
                              ...current,
                              [field.fieldKey]: next
                            }));
                            handleChange(
                              field.fieldKey,
                              next.map((entry) => entry.value)
                            );
                          }}
                          disabled={disabled}
                        >
                          {item.label} {disabled ? "" : "x"}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <input
                    type="text"
                    value={labelValue}
                    placeholder={field.placeholder ?? "Search..."}
                    onClick={() => {
                      if (disabled) return;
                      setReferenceOpen((current) => ({ ...current, [field.fieldKey]: true }));
                      void handleReferenceSearch(field, labelValue);
                    }}
                    onChange={(event) => {
                      const next = event.target.value;
                      setReferenceLabels((current) => ({ ...current, [field.fieldKey]: next }));
                      if (!field.allowMultiple) {
                        handleChange(field.fieldKey, "");
                      }
                      void handleReferenceSearch(field, next);
                    }}
                    onFocus={() => {
                      if (disabled) return;
                      setReferenceOpen((current) => ({ ...current, [field.fieldKey]: true }));
                      void handleReferenceSearch(field, labelValue);
                    }}
                    disabled={disabled}
                  />
                  {field.required &&
                  (!formData[field.fieldKey] ||
                    (field.allowMultiple &&
                      Array.isArray(formData[field.fieldKey]) &&
                      formData[field.fieldKey].length === 0)) ? (
                    <div className="form-view__hint">Select a value.</div>
                  ) : null}
                  {isOpen && options.length > 0 ? (
                    <div className="reference-field__options">
                      {options.map((option) => (
                        <button
                          type="button"
                          key={option.value}
                          onClick={() => handleReferenceSelect(field, option)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  ) : isOpen ? (
                    <div className="reference-field__options reference-field__options--empty">
                      <div className="reference-field__empty">No available options.</div>
                    </div>
                  ) : null}
                </div>
              </label>
            );
          }
          return (
            <label key={field.fieldKey} className="form-view__field">
              <span className="form-view__label">
                {field.label}
                {field.required ? <span className="form-view__required">*</span> : null}
              </span>
              {field.fieldType === "TEXTAREA" ? (
                <textarea
                  value={String(coerced)}
                  placeholder={field.placeholder ?? ""}
                  onChange={(event) => handleChange(field.fieldKey, event.target.value)}
                  required={field.required}
                />
              ) : field.fieldType === "SELECT" ? (
                <select
                  value={String(coerced)}
                  onChange={(event) => handleChange(field.fieldKey, event.target.value)}
                  required={field.required}
                >
                  <option value="">Select...</option>
                  {choices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={
                    field.fieldType === "NUMBER"
                      ? "number"
                      : field.fieldType === "EMAIL"
                        ? "email"
                        : field.fieldType === "PASSWORD"
                          ? "password"
                          : "text"
                  }
                  value={String(coerced)}
                  placeholder={field.placeholder ?? ""}
                  onChange={(event) => handleChange(field.fieldKey, event.target.value)}
                  required={field.required}
                  disabled={field.readOnly}
                />
              )}
            </label>
          );
        })}
        <div className="form-view__actions">
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
      <RelatedLists
        token={token}
        parentEntityKey={view.entityKey}
        parentId={recordId}
        disabled={isNew}
      />
    </div>
  );
}

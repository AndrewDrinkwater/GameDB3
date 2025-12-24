import { useEffect, useMemo, useState } from "react";
import ConditionBuilder from "./ConditionBuilder";
import EntityFormDesigner from "./EntityFormDesigner";
import EntityAccessEditor from "./EntityAccessEditor";
import RelatedLists from "./RelatedLists";
import { dispatchUnauthorized } from "../utils/auth";

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

type EntityFieldChoice = {
  id: string;
  value: string;
  label: string;
  sortOrder?: number | null;
};

type EntityFieldDefinition = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  required: boolean;
  formOrder: number;
  listOrder: number;
  referenceEntityTypeId?: string | null;
  formSectionId?: string | null;
  formColumn?: number | null;
  conditions?: unknown;
  choices?: EntityFieldChoice[];
};

type EntityFormSection = {
  id: string;
  title: string;
  layout: "ONE_COLUMN" | "TWO_COLUMN";
  sortOrder: number;
};

type AccessEntry = { id: string; label: string };

type EntityAccessState = {
  readGlobal: boolean;
  readCampaigns: AccessEntry[];
  readCharacters: AccessEntry[];
  writeGlobal: boolean;
  writeCampaigns: AccessEntry[];
  writeCharacters: AccessEntry[];
};

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
  contextWorldId?: string;
  contextCampaignId?: string;
  contextCharacterId?: string;
};

const fieldSorter = (a: ViewField, b: ViewField) => a.formOrder - b.formOrder;

const coerceValue = (fieldType: string, value: unknown) => {
  if (fieldType === "BOOLEAN") {
    return Boolean(value);
  }
  if (value === null || value === undefined) return "";
  return String(value);
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
  const target = rule.value ?? "";

  switch (rule.operator) {
    case "equals":
      return value === target;
    case "not_equals":
      return value !== target;
    case "contains":
      return value.toLowerCase().includes(target.toLowerCase());
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

export default function FormView({
  token,
  viewKey,
  recordId,
  onBack,
  currentUserId,
  currentUserLabel,
  currentUserRole,
  initialValues,
  initialLabels,
  contextWorldId,
  contextCampaignId,
  contextCharacterId
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
  const [entityFields, setEntityFields] = useState<EntityFieldDefinition[]>([]);
  const [entitySections, setEntitySections] = useState<EntityFormSection[]>([]);
  const [entityValues, setEntityValues] = useState<Record<string, unknown>>({});
  const [entityReferenceOptions, setEntityReferenceOptions] = useState<Record<string, Choice[]>>({});
  const [entityReferenceLabels, setEntityReferenceLabels] = useState<Record<string, string>>({});
  const [entityReferenceOpen, setEntityReferenceOpen] = useState<Record<string, boolean>>({});
  const [entityAccess, setEntityAccess] = useState<EntityAccessState | null>(null);
  const [conditionFieldOptions, setConditionFieldOptions] = useState<Choice[]>([]);
  const [entityTab, setEntityTab] = useState<"info" | "access">("info");
  const [entityTypeTab, setEntityTypeTab] = useState<"details" | "designer">("details");

  const isNew = recordId === "new";

  const handleUnauthorized = (response: Response) => {
    if (response.status === 401) {
      dispatchUnauthorized();
      return true;
    }
    return false;
  };

  useEffect(() => {
    let ignore = false;

    const loadView = async () => {
      setLoading(true);
      setError(null);
      setReferenceOptions({});
      setReferenceLabels({});
      setReferenceSelections({});
      setReferenceOpen({});
      setEntityFields([]);
      setEntityValues({});
      setEntityReferenceOptions({});
      setEntityReferenceLabels({});
      setEntityReferenceOpen({});
      setEntityAccess(null);
      setConditionFieldOptions([]);
      setEntitySections([]);
      try {
        const viewResponse = await fetch(`/api/views/${viewKey}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (handleUnauthorized(viewResponse)) {
          return;
        }

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
            if (handleUnauthorized(choiceResponse)) {
              return [listKey, []] as const;
            }
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

          if (handleUnauthorized(recordResponse)) {
            return;
          }

          if (!recordResponse.ok) {
            throw new Error("Unable to load record.");
          }

          const record = (await recordResponse.json()) as Record<string, unknown>;
          if (!ignore) {
            setFormData(record);
            if (viewData.entityKey === "entities" && record.fieldValues) {
              setEntityValues(record.fieldValues as Record<string, unknown>);
            }
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
    setEntityTab("info");
    setEntityTypeTab("details");
  }, [viewKey, recordId]);

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
          if (handleUnauthorized(response)) return;
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

  useEffect(() => {
    let ignore = false;
    if (!view || view.entityKey !== "entities") return;
    const refFields = entityFields.filter((field) => field.fieldType === "ENTITY_REFERENCE");
    if (refFields.length === 0) return;

    const loadLabels = async () => {
      const nextLabels: Record<string, string> = {};
      await Promise.all(
        refFields.map(async (field) => {
          const value = entityValues[field.fieldKey];
          if (!value || entityReferenceLabels[field.fieldKey]) return;
          const response = await fetch(`/api/references?entityKey=entities&ids=${String(value)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (handleUnauthorized(response)) return;
          if (!response.ok) return;
          const data = (await response.json()) as Array<{ id: string; label: string }>;
          if (data[0]) {
            nextLabels[field.fieldKey] = data[0].label;
          }
        })
      );

      if (!ignore && Object.keys(nextLabels).length > 0) {
        setEntityReferenceLabels((current) => ({ ...current, ...nextLabels }));
      }
    };

    void loadLabels();

    return () => {
      ignore = true;
    };
  }, [view, entityFields, entityValues, entityReferenceLabels, token]);

  useEffect(() => {
    let ignore = false;
    if (!view || view.entityKey !== "entities") return;

    const entityTypeId = formData.entityTypeId as string | undefined;
    if (!entityTypeId) {
      setEntityFields([]);
      return;
    }

    const loadEntityFields = async () => {
      const response = await fetch(`/api/entity-fields?entityTypeId=${entityTypeId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) return;
      const data = (await response.json()) as EntityFieldDefinition[];
      if (!ignore) {
        const sorted = [...data]
          .map((field) => ({
            ...field,
            choices: field.choices
              ? [...field.choices].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
              : field.choices
          }))
          .sort((a, b) => a.formOrder - b.formOrder);
        setEntityFields(sorted);
      }
    };

    void loadEntityFields();

    return () => {
      ignore = true;
    };
  }, [view, formData.entityTypeId, token]);

  useEffect(() => {
    let ignore = false;
    if (!view || view.entityKey !== "entities") return;
    const entityTypeId = formData.entityTypeId as string | undefined;
    if (!entityTypeId) {
      setEntitySections([]);
      return;
    }

    const loadSections = async () => {
      const response = await fetch(`/api/entity-form-sections?entityTypeId=${entityTypeId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) return;
      const data = (await response.json()) as EntityFormSection[];
      if (!ignore) {
        setEntitySections([...data].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      }
    };

    void loadSections();

    return () => {
      ignore = true;
    };
  }, [view, formData.entityTypeId, token]);

  useEffect(() => {
    if (!view || view.entityKey !== "entities") return;
    if (recordId !== "new") return;
    setEntityValues({});
    setEntityReferenceLabels({});
  }, [view, recordId, formData.entityTypeId]);

  useEffect(() => {
    let ignore = false;
    if (!view || view.entityKey !== "entities") return;

    const resolveLabels = async (entityKey: string, ids: string[]) => {
      if (ids.length === 0) return [];
      const response = await fetch(`/api/references?entityKey=${entityKey}&ids=${ids.join(",")}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (handleUnauthorized(response)) return [];
      if (!response.ok) return ids.map((id) => ({ id, label: id }));
      const data = (await response.json()) as Array<{ id: string; label: string }>;
      return data.map((item) => ({ id: item.id, label: item.label }));
    };

    const loadAccess = async () => {
      if (recordId === "new") {
        if (contextCampaignId) {
          const campaigns = await resolveLabels("campaigns", [contextCampaignId]);
          if (!ignore) {
            setEntityAccess({
              readGlobal: false,
              readCampaigns: campaigns,
              readCharacters: [],
              writeGlobal: false,
              writeCampaigns: campaigns,
              writeCharacters: []
            });
          }
          return;
        }

        if (!ignore) {
          setEntityAccess({
            readGlobal: true,
            readCampaigns: [],
            readCharacters: [],
            writeGlobal: true,
            writeCampaigns: [],
            writeCharacters: []
          });
        }
        return;
      }

      const response = await fetch(`/api/entities/${recordId}/access`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) return;
      const data = (await response.json()) as {
        read: { global: boolean; campaigns: string[]; characters: string[] };
        write: { global: boolean; campaigns: string[]; characters: string[] };
      };

      const [readCampaigns, readCharacters, writeCampaigns, writeCharacters] =
        await Promise.all([
          resolveLabels("campaigns", data.read.campaigns ?? []),
          resolveLabels("characters", data.read.characters ?? []),
          resolveLabels("campaigns", data.write.campaigns ?? []),
          resolveLabels("characters", data.write.characters ?? [])
        ]);

      if (!ignore) {
        setEntityAccess({
          readGlobal: data.read.global,
          readCampaigns,
          readCharacters,
          writeGlobal: data.write.global,
          writeCampaigns,
          writeCharacters
        });
      }
    };

    void loadAccess();

    return () => {
      ignore = true;
    };
  }, [view, recordId, token, contextCampaignId]);

  useEffect(() => {
    let ignore = false;
    if (!view || view.entityKey !== "entity_fields") return;
    const entityTypeId = formData.entityTypeId as string | undefined;
    if (!entityTypeId) {
      setConditionFieldOptions([]);
      return;
    }

    const loadOptions = async () => {
      const response = await fetch(`/api/entity-fields?entityTypeId=${entityTypeId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) return;
      const data = (await response.json()) as EntityFieldDefinition[];
      if (!ignore) {
        setConditionFieldOptions(
          data.map((field) => ({
            value: field.fieldKey,
            label: field.label
          }))
        );
      }
    };

    void loadOptions();

    return () => {
      ignore = true;
    };
  }, [view, formData.entityTypeId, token]);

  const formFields = useMemo(() => {
    if (!view) return [];
    let fields = view.fields.filter((field) => field.formVisible).sort(fieldSorter);
    if (view.entityKey === "entity_fields") {
      const fieldType = formData.fieldType;
      fields = fields.filter((field) => {
        if (field.fieldKey === "listOrder" || field.fieldKey === "formOrder") return false;
        if (field.fieldKey === "referenceEntityTypeId") {
          return fieldType === "ENTITY_REFERENCE";
        }
        if (field.fieldKey === "referenceLocationTypeKey") {
          return fieldType === "LOCATION_REFERENCE";
        }
        return true;
      });
    }
    return fields;
  }, [view, formData.fieldType]);

  const visibleEntityFields = useMemo(() => {
    if (!view || view.entityKey !== "entities") return [];
    const values = { ...formData, ...entityValues };
    return entityFields.filter((field) => {
      if (!field.conditions) return true;
      if (typeof field.conditions === "string") {
        try {
          const parsed = JSON.parse(field.conditions) as ConditionGroup;
          return evaluateGroup(parsed, values);
        } catch {
          return true;
        }
      }
      return evaluateGroup(field.conditions as ConditionGroup, values);
    });
  }, [view, entityFields, formData, entityValues]);

  const handleChange = (fieldKey: string, value: unknown) => {
    setFormData((current) => ({ ...current, [fieldKey]: value }));
  };

  const handleEntityValueChange = (fieldKey: string, value: unknown) => {
    setEntityValues((current) => ({ ...current, [fieldKey]: value }));
  };

  const renderEntityField = (field: EntityFieldDefinition) => {
    const value = entityValues[field.fieldKey];

    if (field.fieldType === "BOOLEAN") {
      return (
        <label key={field.fieldKey} className="form-view__field form-view__field--boolean">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => handleEntityValueChange(field.fieldKey, event.target.checked)}
          />
          <span>{field.label}</span>
        </label>
      );
    }

    if (field.fieldType === "ENTITY_REFERENCE") {
      const options = entityReferenceOptions[field.fieldKey] ?? [];
      const labelValue = entityReferenceLabels[field.fieldKey] ?? "";
      const isOpen = entityReferenceOpen[field.fieldKey];

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
              setEntityReferenceOpen((current) => ({ ...current, [field.fieldKey]: false }));
            }}
          >
            <input
              type="text"
              value={labelValue}
              placeholder="Search entities..."
              onClick={() => {
                setEntityReferenceOpen((current) => ({ ...current, [field.fieldKey]: true }));
                void handleEntityReferenceSearch(field, labelValue);
              }}
              onChange={(event) => {
                const next = event.target.value;
                setEntityReferenceLabels((current) => ({ ...current, [field.fieldKey]: next }));
                handleEntityValueChange(field.fieldKey, "");
                void handleEntityReferenceSearch(field, next);
              }}
              onFocus={() => {
                setEntityReferenceOpen((current) => ({ ...current, [field.fieldKey]: true }));
                void handleEntityReferenceSearch(field, labelValue);
              }}
            />
            {isOpen && options.length > 0 ? (
              <div className="reference-field__options">
                {options.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => {
                      handleEntityValueChange(field.fieldKey, option.value);
                      setEntityReferenceLabels((current) => ({
                        ...current,
                        [field.fieldKey]: option.label
                      }));
                      setEntityReferenceOptions((current) => ({
                        ...current,
                        [field.fieldKey]: []
                      }));
                      setEntityReferenceOpen((current) => ({
                        ...current,
                        [field.fieldKey]: false
                      }));
                    }}
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
            value={value ? String(value) : ""}
            onChange={(event) => handleEntityValueChange(field.fieldKey, event.target.value)}
          />
        ) : field.fieldType === "CHOICE" ? (
          <select
            value={value ? String(value) : ""}
            onChange={(event) => handleEntityValueChange(field.fieldKey, event.target.value)}
          >
            <option value="">Select...</option>
            {(field.choices ?? []).map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={value ? String(value) : ""}
            onChange={(event) => handleEntityValueChange(field.fieldKey, event.target.value)}
          />
        )}
      </label>
    );
  };

  const handleReferenceSearch = async (field: ViewField, query: string) => {
    if (!field.referenceEntityKey) return;
    const scopeParam = field.referenceScope ? `&scope=${field.referenceScope}` : "";
    const contextParams =
      field.referenceScope === "entity_type"
        ? formData.worldId
          ? `&worldId=${formData.worldId}`
          : contextWorldId
            ? `&worldId=${contextWorldId}`
            : ""
        : field.referenceEntityKey === "entity_fields" && contextWorldId
          ? `&worldId=${contextWorldId}`
          : "";
    const response = await fetch(
      `/api/references?entityKey=${field.referenceEntityKey}&query=${encodeURIComponent(query)}${scopeParam}${contextParams}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (handleUnauthorized(response)) return;
    if (!response.ok) return;
    const data = (await response.json()) as Array<{ id: string; label: string }>;
    const options = data.map((item) => ({ value: item.id, label: item.label }));
    setReferenceOptions((current) => ({ ...current, [field.fieldKey]: options }));
  };

  const handleEntityReferenceSearch = async (field: EntityFieldDefinition, query: string) => {
    const params = new URLSearchParams({
      entityKey: "entities",
      query
    });
    const worldId = formData.worldId as string | undefined;
    if (worldId) params.set("worldId", worldId);
    if (field.referenceEntityTypeId) params.set("entityTypeId", field.referenceEntityTypeId);

    const response = await fetch(`/api/references?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (handleUnauthorized(response)) return;
    if (!response.ok) return;
    const data = (await response.json()) as Array<{ id: string; label: string }>;
    setEntityReferenceOptions((current) => ({
      ...current,
      [field.fieldKey]: data.map((item) => ({ value: item.id, label: item.label }))
    }));
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

    if (view.entityKey === "entities") {
      visibleEntityFields
        .filter((field) => field.required)
        .forEach((field) => {
          const value = entityValues[field.fieldKey];
          if (value === undefined || value === "" || value === null) {
            missingFields.push(field.label);
          }
        });
    }

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

    if (view.entityKey === "entities") {
      payload.fieldValues = entityValues;
      if (contextCampaignId) {
        payload.contextCampaignId = contextCampaignId;
      }
      if (contextCharacterId) {
        payload.contextCharacterId = contextCharacterId;
      }
      if (entityAccess) {
        payload.access = {
          read: {
            global: entityAccess.readGlobal,
            campaigns: entityAccess.readCampaigns.map((entry) => entry.id),
            characters: entityAccess.readCharacters.map((entry) => entry.id)
          },
          write: {
            global: entityAccess.writeGlobal,
            campaigns: entityAccess.writeCampaigns.map((entry) => entry.id),
            characters: entityAccess.writeCharacters.map((entry) => entry.id)
          }
        };
      }
    }

    try {
      const response = await fetch(isNew ? view.endpoint : `${view.endpoint}/${recordId}`, {
        method: isNew ? "POST" : "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (handleUnauthorized(response)) {
        return;
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Save failed.");
      }
      let savedId = recordId;
      if (isNew) {
        const data = (await response.json().catch(() => ({}))) as { id?: string };
        if (data?.id) {
          savedId = data.id;
        }
      }

      if (view.entityKey === "entities" && entityAccess) {
        const accessResponse = await fetch(`/api/entities/${savedId}/access`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            read: {
              global: entityAccess.readGlobal,
              campaigns: entityAccess.readCampaigns.map((entry) => entry.id),
              characters: entityAccess.readCharacters.map((entry) => entry.id)
            },
            write: {
              global: entityAccess.writeGlobal,
              campaigns: entityAccess.writeCampaigns.map((entry) => entry.id),
              characters: entityAccess.writeCharacters.map((entry) => entry.id)
            }
          })
        });
        if (handleUnauthorized(accessResponse)) {
          return;
        }
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

      if (handleUnauthorized(response)) {
        return;
      }

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

  const isEntityView = view.entityKey === "entities";
  const isEntityTypeView = view.entityKey === "entity_types";
  const templateFieldKeys = new Set(["isTemplate", "sourceTypeId"]);
  const entityTypeFields =
    view.entityKey === "entity_types"
      ? formFields.filter((field) => {
          if (entityTypeTab === "details") {
            return !templateFieldKeys.has(field.fieldKey);
          }
          return false;
        })
      : formFields;

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
        {isEntityView ? (
          <div className="form-view__tabs" role="tablist">
            <button
              type="button"
              className={`form-view__tab ${entityTab === "info" ? "is-active" : ""}`}
              onClick={() => setEntityTab("info")}
              role="tab"
              aria-selected={entityTab === "info"}
            >
              Information
            </button>
            <button
              type="button"
              className={`form-view__tab ${entityTab === "access" ? "is-active" : ""}`}
              onClick={() => setEntityTab("access")}
              role="tab"
              aria-selected={entityTab === "access"}
            >
              Access
            </button>
          </div>
        ) : null}
        {isEntityTypeView ? (
          <div className="form-view__tabs" role="tablist">
            <button
              type="button"
              className={`form-view__tab ${entityTypeTab === "details" ? "is-active" : ""}`}
              onClick={() => setEntityTypeTab("details")}
              role="tab"
              aria-selected={entityTypeTab === "details"}
            >
              Details
            </button>
            <button
              type="button"
              className={`form-view__tab ${entityTypeTab === "designer" ? "is-active" : ""}`}
              onClick={() => setEntityTypeTab("designer")}
              role="tab"
              aria-selected={entityTypeTab === "designer"}
            >
              Form Designer
            </button>
          </div>
        ) : null}
        {!isEntityView || entityTab === "info" ? (
          <>
            {entityTypeTab === "designer" && isEntityTypeView ? null : entityTypeFields.map((field) => {
              const value = formData[field.fieldKey];
              const coerced = coerceValue(field.fieldType, value);
              const listKey = field.optionsListKey ?? "";
              const choices = listKey ? choiceMaps[listKey] ?? [] : [];

              if (view.entityKey === "entity_fields" && field.fieldKey === "conditions") {
                let parsedValue: ConditionGroup | null = null;
                const rawValue = formData[field.fieldKey];
                if (typeof rawValue === "string" && rawValue.trim() !== "") {
                  try {
                    parsedValue = JSON.parse(rawValue) as ConditionGroup;
                  } catch {
                    parsedValue = null;
                  }
                } else if (typeof rawValue === "object" && rawValue) {
                  parsedValue = rawValue as ConditionGroup;
                }

                return (
                  <label key={field.fieldKey} className="form-view__field">
                    <span className="form-view__label">{field.label}</span>
                    <ConditionBuilder
                      value={parsedValue ?? undefined}
                      fieldOptions={conditionFieldOptions}
                      onChange={(next) => handleChange(field.fieldKey, next)}
                    />
                  </label>
                );
              }

              if (field.fieldType === "BOOLEAN") {
                return (
                  <label
                    key={field.fieldKey}
                    className="form-view__field form-view__field--boolean"
                  >
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
            {isEntityView ? (
              <div className="form-view__section">
                <h2>Type Fields</h2>
                {visibleEntityFields.length > 0 ? (
                  entitySections.length > 0 ? (
                    <div className="entity-form-layout">
                      {entitySections.map((section) => {
                        const layout = section.layout ?? "ONE_COLUMN";
                        const columns = layout === "TWO_COLUMN" ? [1, 2] : [1];
                        return (
                          <div key={section.id} className="entity-form-layout__section">
                            <div className="entity-form-layout__title">{section.title}</div>
                            <div
                              className={`entity-form-layout__columns ${
                                layout === "TWO_COLUMN"
                                  ? "entity-form-layout__columns--two"
                                  : ""
                              }`}
                            >
                              {columns.map((column) => {
                                const columnFields = visibleEntityFields
                                  .filter(
                                    (field) =>
                                      (field.formSectionId ?? null) === section.id &&
                                      (field.formColumn ?? 1) === column
                                  )
                                  .sort((a, b) => a.formOrder - b.formOrder);
                                return (
                                  <div
                                    key={`${section.id}-${column}`}
                                    className="entity-form-layout__column"
                                  >
                                    {columnFields.map((field) => renderEntityField(field))}
                                    {columnFields.length === 0 ? (
                                      <div className="form-view__hint">
                                        No fields in this column.
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {visibleEntityFields.some(
                        (field) => !field.formSectionId && field.formSectionId !== ""
                      ) ? (
                        <div className="entity-form-layout__section">
                          <div className="entity-form-layout__title">Other fields</div>
                          <div className="entity-form-layout__columns">
                            <div className="entity-form-layout__column">
                              {visibleEntityFields
                                .filter((field) => !field.formSectionId)
                                .sort((a, b) => a.formOrder - b.formOrder)
                                .map((field) => renderEntityField(field))}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    visibleEntityFields.map((field) => renderEntityField(field))
                  )
                ) : (
                  <div className="form-view__hint">Select an entity type to see fields.</div>
                )}
              </div>
            ) : null}
            {isEntityTypeView && entityTypeTab === "designer" ? (
              <div className="form-view__section">
                <h2>Form Designer</h2>
                {isNew ? (
                  <div className="form-view__hint">
                    Save the entity type to configure its form layout.
                  </div>
                ) : (
                  <EntityFormDesigner token={token} entityTypeId={recordId} />
                )}
              </div>
            ) : null}
          </>
        ) : null}
        {isEntityView && entityTab === "access" ? (
          <div className="form-view__section">
            <h2>Access</h2>
            {entityAccess ? (
              <EntityAccessEditor
                token={token}
                worldId={formData.worldId as string | undefined}
                value={entityAccess}
                onChange={setEntityAccess}
              />
            ) : (
              <div className="form-view__hint">Access controls are unavailable.</div>
            )}
          </div>
        ) : null}
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

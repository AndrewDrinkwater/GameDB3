import { useEffect, useMemo, useRef, useState } from "react";
import ConditionBuilder from "./ConditionBuilder";
import EntityFormDesigner from "./EntityFormDesigner";
import EntityAccessEditor from "./EntityAccessEditor";
import RelatedLists from "./RelatedLists";
import { usePopout } from "./PopoutProvider";
import { useUnsavedChangesPrompt } from "../utils/unsavedChanges";
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

type ConditionFieldOption = Choice & {
  fieldType?: string;
  options?: Choice[];
  referenceEntityKey?: string;
  referenceScope?: string | null;
  referenceEntityTypeId?: string | null;
  allowMultiple?: boolean;
};

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

type EntityAuditUser = {
  id: string;
  name: string | null;
  email: string;
  readContexts: string[];
  writeContexts: string[];
};

type EntityAuditChange = {
  id: string;
  action: string;
  createdAt: string;
  actor: { id: string; name: string | null; email: string } | null;
  details?: unknown;
};

type EntityAuditPayload = {
  access: EntityAuditUser[];
  changes: EntityAuditChange[];
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
  contextWorldLabel?: string;
  contextCampaignId?: string;
  contextCharacterId?: string;
  onContextSwitch?: (next: { worldId: string; worldLabel?: string }) => void;
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

const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
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
  contextWorldLabel,
  contextCampaignId,
  contextCharacterId,
  onContextSwitch
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
  const [entityAudit, setEntityAudit] = useState<EntityAuditPayload | null>(null);
  const [entityAuditAllowed, setEntityAuditAllowed] = useState(false);
  const [entityAuditLoading, setEntityAuditLoading] = useState(false);
  const [entityAuditError, setEntityAuditError] = useState<string | null>(null);
  const [openAuditEntryId, setOpenAuditEntryId] = useState<string | null>(null);
  const [conditionFieldOptions, setConditionFieldOptions] = useState<ConditionFieldOption[]>([]);
  const [entityTab, setEntityTab] = useState<"info" | "config" | "access" | "audit">(
    "info"
  );
  const [entityTypeTab, setEntityTypeTab] = useState<"details" | "designer">("details");
  const [fieldChoices, setFieldChoices] = useState<EntityFieldChoice[]>([]);
  const [fieldChoicesLoading, setFieldChoicesLoading] = useState(false);
  const [fieldChoicesError, setFieldChoicesError] = useState<string | null>(null);
  const [newChoice, setNewChoice] = useState({ value: "", label: "", sortOrder: "" });
  const [isDirty, setIsDirty] = useState(false);
  const { showPopout } = usePopout();
  const initialSnapshotRef = useRef<string>("");
  const hasSnapshotRef = useRef(false);
  const snapshotKeyRef = useRef<string>("");
  const isDirtyRef = useRef(false);

  const isNew = recordId === "new";
  const formatAuditAction = (action: string) =>
    action
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  const formatAuditTimestamp = (value: string) => new Date(value).toLocaleString();
  const formatAuditValue = (value: unknown) => {
    if (value === null || value === undefined) return "Empty";
    if (typeof value === "boolean") return value ? "True" : "False";
    if (typeof value === "string" && value.trim() === "") return "Empty";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return "Value";
      }
    }
    return String(value);
  };
  const getUpdateChanges = (details: unknown) => {
    if (!details || typeof details !== "object") return [];
    const changes = (details as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) return [];
    return changes.filter((entry): entry is {
      fieldKey?: string;
      label?: string;
      from?: unknown;
      to?: unknown;
    } => Boolean(entry) && typeof entry === "object");
  };
  const buildSnapshot = () => stableStringify({ formData, entityValues, entityAccess });
  const clearDirty = () => {
    isDirtyRef.current = false;
    setIsDirty(false);
    window.dispatchEvent(new CustomEvent("ttrpg:form-dirty", { detail: { dirty: false } }));
  };

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
        setEntityAudit(null);
        setEntityAuditAllowed(false);
        setEntityAuditLoading(false);
        setEntityAuditError(null);
        setOpenAuditEntryId(null);
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
  }, [token, viewKey, recordId, isNew]);

  useEffect(() => {
    setEntityTab("info");
    setEntityTypeTab("details");
    hasSnapshotRef.current = false;
    snapshotKeyRef.current = "";
    initialSnapshotRef.current = "";
    setIsDirty(false);
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
    isDirtyRef.current = isDirty;
    window.dispatchEvent(
      new CustomEvent("ttrpg:form-dirty", { detail: { dirty: isDirty } })
    );
  }, [isDirty]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent("ttrpg:form-dirty", { detail: { dirty: false } }));
    };
  }, []);

  useEffect(() => {
    if (loading || !view) return;
    if (view.entityKey === "entities" && entityAccess === null) return;
    const key = `${viewKey}:${recordId}`;
    if (snapshotKeyRef.current === key) return;
    snapshotKeyRef.current = key;
    initialSnapshotRef.current = buildSnapshot();
    hasSnapshotRef.current = true;
    setIsDirty(false);
  }, [loading, view, viewKey, recordId, entityAccess]);

  useEffect(() => {
    if (!hasSnapshotRef.current) return;
    const nextSnapshot = buildSnapshot();
    setIsDirty(nextSnapshot !== initialSnapshotRef.current);
  }, [formData, entityValues, entityAccess]);

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
    if (!view || view.entityKey !== "entity_fields") return;
    if (recordId === "new" || formData.fieldType !== "CHOICE") {
      setFieldChoices([]);
      setFieldChoicesError(null);
      setNewChoice({ value: "", label: "", sortOrder: "" });
      return;
    }

    const loadChoices = async () => {
      setFieldChoicesLoading(true);
      setFieldChoicesError(null);
      try {
        const response = await fetch(`/api/entity-field-choices?entityFieldId=${recordId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (handleUnauthorized(response)) return;
        if (!response.ok) {
          throw new Error("Unable to load field choices.");
        }
        const data = (await response.json()) as EntityFieldChoice[];
        if (!ignore) {
          const sorted = [...data].sort(
            (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
          );
          setFieldChoices(sorted);
        }
      } catch (err) {
        if (!ignore) {
          setFieldChoicesError(err instanceof Error ? err.message : "Unable to load field choices.");
        }
      } finally {
        if (!ignore) setFieldChoicesLoading(false);
      }
    };

    void loadChoices();

    return () => {
      ignore = true;
    };
  }, [view, recordId, formData.fieldType, token]);

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
    if (!view || view.entityKey !== "entities" || recordId === "new") {
      setEntityAudit(null);
      setEntityAuditAllowed(false);
      setEntityAuditLoading(false);
      setEntityAuditError(null);
      return;
    }

    const loadAudit = async () => {
      setEntityAuditLoading(true);
      setEntityAuditError(null);
      setOpenAuditEntryId(null);
      try {
        const response = await fetch(`/api/entities/${recordId}/audit`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (handleUnauthorized(response)) return;
        if (response.status === 403) {
          if (!ignore) {
            setEntityAuditAllowed(false);
            setEntityAudit(null);
          }
          return;
        }
        if (!response.ok) {
          throw new Error("Unable to load audit data.");
        }
        const data = (await response.json()) as EntityAuditPayload;
        if (!ignore) {
          setEntityAudit(data);
          setEntityAuditAllowed(true);
        }
      } catch (err) {
        if (!ignore) {
          setEntityAuditAllowed(false);
          setEntityAuditError(err instanceof Error ? err.message : "Unable to load audit data.");
        }
      } finally {
        if (!ignore) setEntityAuditLoading(false);
      }
    };

    void loadAudit();

    return () => {
      ignore = true;
    };
  }, [view, recordId, token]);

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
              label: field.label,
              fieldType: field.fieldType,
              options: field.choices?.map((choice) => ({
                value: choice.value,
                label: choice.label
              })),
              referenceEntityKey:
                field.fieldType === "ENTITY_REFERENCE" ? "entities" : undefined,
              referenceEntityTypeId: field.referenceEntityTypeId ?? null
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
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      closeEntityReferenceDropdown(field.fieldKey);
                      handleEntityValueChange(field.fieldKey, option.value);
                      setEntityReferenceLabels((current) => ({
                        ...current,
                        [field.fieldKey]: option.label
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
    const gmWorldId =
      field.referenceScope === "world_gm"
        ? ((formData.worldId as string | undefined) ?? contextWorldId)
        : undefined;
    const gmWorldParam = gmWorldId ? `&worldId=${gmWorldId}` : "";
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
      `/api/references?entityKey=${field.referenceEntityKey}&query=${encodeURIComponent(query)}${scopeParam}${contextParams}${gmWorldParam}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (handleUnauthorized(response)) return;
    if (!response.ok) return;
    const data = (await response.json()) as Array<{ id: string; label: string }>;
    const options = data.map((item) => ({ value: item.id, label: item.label }));
    setReferenceOptions((current) => ({ ...current, [field.fieldKey]: options }));
  };

  const isChoiceField = view?.entityKey === "entity_fields" && formData.fieldType === "CHOICE";

  const updateChoice = (choiceId: string, updates: Partial<EntityFieldChoice>) => {
    setFieldChoices((current) =>
      current.map((choice) => (choice.id === choiceId ? { ...choice, ...updates } : choice))
    );
  };

  const saveChoice = async (choice: EntityFieldChoice) => {
    try {
      const response = await fetch(`/api/entity-field-choices/${choice.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          value: choice.value,
          label: choice.label,
          sortOrder: choice.sortOrder ?? null
        })
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Unable to save choice.");
      }
      const updated = (await response.json()) as EntityFieldChoice;
      setFieldChoices((current) =>
        [...current.map((item) => (item.id === updated.id ? updated : item))].sort(
          (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        )
      );
    } catch (err) {
      setFieldChoicesError(err instanceof Error ? err.message : "Unable to save choice.");
    }
  };

  const deleteChoice = async (choiceId: string) => {
    try {
      const response = await fetch(`/api/entity-field-choices/${choiceId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Unable to delete choice.");
      }
      setFieldChoices((current) => current.filter((choice) => choice.id !== choiceId));
    } catch (err) {
      setFieldChoicesError(err instanceof Error ? err.message : "Unable to delete choice.");
    }
  };

  const addChoice = async () => {
    if (!recordId || recordId === "new") return;
    if (!newChoice.value.trim() || !newChoice.label.trim()) {
      setFieldChoicesError("Value and label are required.");
      return;
    }
    try {
      const response = await fetch("/api/entity-field-choices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          entityFieldId: recordId,
          value: newChoice.value.trim(),
          label: newChoice.label.trim(),
          sortOrder: newChoice.sortOrder ? Number(newChoice.sortOrder) : undefined
        })
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Unable to add choice.");
      }
      const created = (await response.json()) as EntityFieldChoice;
      setFieldChoices((current) =>
        [...current, created].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      );
      setNewChoice({ value: "", label: "", sortOrder: "" });
      setFieldChoicesError(null);
    } catch (err) {
      setFieldChoicesError(err instanceof Error ? err.message : "Unable to add choice.");
    }
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

  function closeReferenceDropdown(fieldKey: string) {
    setReferenceOptions((current) => ({ ...current, [fieldKey]: [] }));
    setReferenceOpen((current) => ({ ...current, [fieldKey]: false }));
  }

  function closeEntityReferenceDropdown(fieldKey: string) {
    setEntityReferenceOptions((current) => ({ ...current, [fieldKey]: [] }));
    setEntityReferenceOpen((current) => ({ ...current, [fieldKey]: false }));
  }

  const handleReferenceSelect = (field: ViewField, option: Choice) => {
    closeReferenceDropdown(field.fieldKey);
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
  };

  const markSaved = () => {
    isDirtyRef.current = false;
    initialSnapshotRef.current = buildSnapshot();
    hasSnapshotRef.current = true;
    setIsDirty(false);
    window.dispatchEvent(
      new CustomEvent("ttrpg:form-dirty", { detail: { dirty: false } })
    );
  };

  const saveRecord = async () => {
    if (!view) return false;
    setError(null);
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
      return false;
    }

    formFields.forEach((field) => {
      const value = formData[field.fieldKey];
      if (field.fieldType === "PASSWORD" && !value) {
        return;
      }
      if (value !== undefined) {
        if (field.fieldType === "BOOLEAN") {
          payload[field.fieldKey] = Boolean(value);
        } else if (field.fieldType === "NUMBER") {
          if (value === "" || value === null) {
            payload[field.fieldKey] = null;
          } else {
            const numericValue = typeof value === "number" ? value : Number(value);
            payload[field.fieldKey] = Number.isNaN(numericValue) ? null : numericValue;
          }
        } else {
          payload[field.fieldKey] = value;
        }
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
        setSaving(false);
        return false;
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
          setSaving(false);
          return false;
        }
      }

      if (view.entityKey === "entities") {
        window.dispatchEvent(new Event("ttrpg:entities-updated"));
      }

      if (
        isNew &&
        view.entityKey === "worlds" &&
        contextWorldId &&
        contextWorldId !== savedId
      ) {
        const createdName = String(payload.name ?? formData.name ?? "the new world");
        const currentLabel = contextWorldLabel ?? "your current world";
        showPopout({
          title: "World created",
          message: `You have successfully created ${createdName}, but you are still in ${currentLabel} context. Would you like to switch context to your new world?`,
          actions: [
            {
              label: "Switch context",
              tone: "primary",
              onClick: () => onContextSwitch?.({ worldId: savedId, worldLabel: createdName })
            },
            { label: "Stay here", tone: "ghost" }
          ]
        });
      }

      markSaved();
      setSaving(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setSaving(false);
      return false;
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveRecord().then((ok) => {
      if (ok) {
        onBack();
      }
    });
  };

  const confirmUnsavedChanges = useUnsavedChangesPrompt({
    isDirtyRef,
    onSave: saveRecord,
    onDiscard: clearDirty
  });

  const handleNavigateAway = (proceed: () => void) => {
    confirmUnsavedChanges(proceed);
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

      if (view.entityKey === "entities") {
        window.dispatchEvent(new Event("ttrpg:entities-updated"));
      }

      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    const handleSaveRequest = (event: Event) => {
      const customEvent = event as CustomEvent<{ requestId?: string }>;
      const requestId = customEvent.detail?.requestId;
      if (!requestId) return;
      void saveRecord().then((ok) => {
        window.dispatchEvent(
          new CustomEvent("ttrpg:form-save-result", { detail: { requestId, ok } })
        );
      });
    };

    window.addEventListener("ttrpg:form-save-request", handleSaveRequest as EventListener);
    return () =>
      window.removeEventListener("ttrpg:form-save-request", handleSaveRequest as EventListener);
  }, [saveRecord]);

  if (loading) {
    return <div className="view-state">Loading form...</div>;
  }

  if (!view) {
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
  const configFieldKeys = new Set(isEntityView ? ["worldId"] : []);
  const canViewConfigTab =
    isEntityView && (isNew || currentUserRole === "ADMIN" || entityAccess !== null);
  const infoFields = isEntityView
    ? entityTypeFields.filter(
        (field) => !configFieldKeys.has(field.fieldKey) || !canViewConfigTab
      )
    : entityTypeFields;
  const configFields = canViewConfigTab
    ? entityTypeFields.filter((field) => configFieldKeys.has(field.fieldKey))
    : [];

  return (
    <div className="form-view">
      <div className="form-view__header">
          <button type="button" className="ghost-button" onClick={() => handleNavigateAway(onBack)}>
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
      {error ? <div className="form-view__error">{error}</div> : null}

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
              {canViewConfigTab ? (
                <button
                  type="button"
                  className={`form-view__tab ${entityTab === "config" ? "is-active" : ""}`}
                  onClick={() => setEntityTab("config")}
                  role="tab"
                  aria-selected={entityTab === "config"}
                >
                  Config
                </button>
              ) : null}
                <button
                  type="button"
                  className={`form-view__tab ${entityTab === "access" ? "is-active" : ""}`}
                  onClick={() => setEntityTab("access")}
                  role="tab"
                  aria-selected={entityTab === "access"}
                >
                  Access
                </button>
                {entityAuditAllowed ? (
                  <button
                    type="button"
                    className={`form-view__tab ${entityTab === "audit" ? "is-active" : ""}`}
                    onClick={() => setEntityTab("audit")}
                    role="tab"
                    aria-selected={entityTab === "audit"}
                  >
                    Audit
                  </button>
                ) : null}
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
            {entityTypeTab === "designer" && isEntityTypeView ? null : infoFields.map((field) => {
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
                      token={token}
                      context={{
                        worldId: contextWorldId,
                        campaignId: contextCampaignId,
                        characterId: contextCharacterId
                      }}
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
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                handleReferenceSelect(field, option);
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
            {isChoiceField && !isNew ? (
              <div className="form-view__section">
                <h2>Field choices</h2>
                {fieldChoicesError ? (
                  <div className="form-view__hint">{fieldChoicesError}</div>
                ) : null}
                {fieldChoicesLoading ? (
                  <div className="form-view__hint">Loading choices...</div>
                ) : (
                  <>
                    <div className="field-choices__row field-choices__row--header">
                      <span>Value</span>
                      <span>Label</span>
                      <span>Sort</span>
                      <span>Actions</span>
                    </div>
                    {fieldChoices.length === 0 ? (
                      <div className="form-view__hint">No choices yet.</div>
                    ) : (
                      fieldChoices.map((choice) => (
                        <div key={choice.id} className="field-choices__row">
                          <input
                            type="text"
                            value={choice.value}
                            onChange={(event) =>
                              updateChoice(choice.id, { value: event.target.value })
                            }
                          />
                          <input
                            type="text"
                            value={choice.label}
                            onChange={(event) =>
                              updateChoice(choice.id, { label: event.target.value })
                            }
                          />
                          <input
                            type="number"
                            value={choice.sortOrder ?? ""}
                            onChange={(event) =>
                              updateChoice(choice.id, {
                                sortOrder: event.target.value ? Number(event.target.value) : null
                              })
                            }
                          />
                          <div className="field-choices__actions">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => saveChoice(choice)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="danger-button"
                              onClick={() => deleteChoice(choice.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                    <div className="field-choices__row field-choices__row--new">
                      <input
                        type="text"
                        placeholder="Value"
                        value={newChoice.value}
                        onChange={(event) =>
                          setNewChoice((current) => ({ ...current, value: event.target.value }))
                        }
                      />
                      <input
                        type="text"
                        placeholder="Label"
                        value={newChoice.label}
                        onChange={(event) =>
                          setNewChoice((current) => ({ ...current, label: event.target.value }))
                        }
                      />
                      <input
                        type="number"
                        placeholder="Sort"
                        value={newChoice.sortOrder}
                        onChange={(event) =>
                          setNewChoice((current) => ({ ...current, sortOrder: event.target.value }))
                        }
                      />
                      <div className="field-choices__actions">
                        <button type="button" className="primary-button" onClick={addChoice}>
                          Add
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}
            {isEntityView ? (
              <div className="form-view__section">
                <h2>Fields</h2>
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
        {isEntityView && entityTab === "config" ? (
          <div className="form-view__section">
            <h2>Config</h2>
            {configFields.map((field) => {
              const value = formData[field.fieldKey];
              const coerced = coerceValue(field.fieldType, value);
              const listKey = field.optionsListKey ?? "";
              const choices = listKey ? choiceMaps[listKey] ?? [] : [];

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
                        setReferenceOpen((current) => ({
                          ...current,
                          [field.fieldKey]: false
                        }));
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
                                const next = selections.filter(
                                  (entry) => entry.value !== item.value
                                );
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
                          setReferenceOpen((current) => ({
                            ...current,
                            [field.fieldKey]: true
                          }));
                          void handleReferenceSearch(field, labelValue);
                        }}
                        onChange={(event) => {
                          const next = event.target.value;
                          setReferenceLabels((current) => ({
                            ...current,
                            [field.fieldKey]: next
                          }));
                          if (!field.allowMultiple) {
                            handleChange(field.fieldKey, "");
                          }
                          void handleReferenceSearch(field, next);
                        }}
                        onFocus={() => {
                          if (disabled) return;
                          setReferenceOpen((current) => ({
                            ...current,
                            [field.fieldKey]: true
                          }));
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
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                handleReferenceSelect(field, option);
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
            {configFields.length === 0 ? (
              <div className="form-view__hint">No configuration fields available.</div>
            ) : null}
          </div>
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
        {isEntityView && entityTab === "audit" ? (
          <div className="form-view__section">
            <h2>Audit</h2>
            {entityAuditLoading ? (
              <div className="form-view__hint">Loading audit data...</div>
            ) : null}
            {entityAuditError ? (
              <div className="form-view__hint">{entityAuditError}</div>
            ) : null}
            {entityAudit ? (
              <div className="audit-panel">
                <div className="audit-section">
                  <h3>Access Summary</h3>
                  {entityAudit.access.length > 0 ? (
                    <div className="audit-grid">
                      <div className="audit-grid__header">User</div>
                      <div className="audit-grid__header">Read Context</div>
                      <div className="audit-grid__header">Write Context</div>
                      {entityAudit.access.map((entry) => (
                        <div className="audit-grid__row" key={entry.id}>
                          <div className="audit-grid__cell">
                            <div className="audit-user">
                              {entry.name ?? entry.email}
                            </div>
                            {entry.name ? (
                              <div className="audit-user__meta">{entry.email}</div>
                            ) : null}
                          </div>
                          <div className="audit-grid__cell">
                            {entry.readContexts.length > 0 ? (
                              <div className="audit-chip-row">
                                {entry.readContexts.map((context) => (
                                  <span className="audit-chip" key={context}>
                                    {context}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="audit-empty">No read access</span>
                            )}
                          </div>
                          <div className="audit-grid__cell">
                            {entry.writeContexts.length > 0 ? (
                              <div className="audit-chip-row">
                                {entry.writeContexts.map((context) => (
                                  <span className="audit-chip" key={context}>
                                    {context}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="audit-empty">No write access</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="form-view__hint">No access entries found.</div>
                  )}
                </div>
                <div className="audit-section">
                  <h3>Change Log</h3>
                  {entityAudit.changes.length > 0 ? (
                    <div className="audit-log">
                      {entityAudit.changes.map((entry) => {
                        const updateChanges =
                          entry.action === "update" ? getUpdateChanges(entry.details) : [];
                        const hasDetails = updateChanges.length > 0;
                        const isOpen = openAuditEntryId === entry.id;
                        return (
                          <div className="audit-log__item" key={entry.id}>
                            <button
                              type="button"
                              className="audit-log__row"
                              onClick={() =>
                                setOpenAuditEntryId(isOpen ? null : entry.id)
                              }
                              disabled={!hasDetails}
                            >
                              <div className="audit-log__primary">
                                <span className="audit-log__action">
                                  {formatAuditAction(entry.action)}
                                </span>
                                <span className="audit-log__actor">
                                  {entry.actor?.name ??
                                    entry.actor?.email ??
                                    "Unknown"}
                                </span>
                              </div>
                              <div className="audit-log__meta">
                                {formatAuditTimestamp(entry.createdAt)}
                              </div>
                            </button>
                            {isOpen && hasDetails ? (
                              <div className="audit-log__details">
                                {updateChanges.map((change, index) => (
                                  <div
                                    className="audit-log__detail"
                                    key={`${entry.id}-${index}`}
                                  >
                                    <span className="audit-log__detail-label">
                                      {change.label ??
                                        change.fieldKey ??
                                        "Field"}
                                    </span>
                                    <span className="audit-log__detail-values">
                                      {formatAuditValue(change.from)}
                                      {" -> "}
                                      {formatAuditValue(change.to)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="form-view__hint">No audit entries yet.</div>
                  )}
                </div>
              </div>
            ) : null}
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

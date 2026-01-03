import { useEffect, useMemo, useRef, useState } from "react";
import ConditionBuilder from "../components/ConditionBuilder";
import { usePopout } from "../components/PopoutProvider";
import { useUnsavedChangesPrompt } from "../utils/unsavedChanges";
import { dispatchUnauthorized } from "../utils/auth";
import { usePermissions } from "../utils/permissions";

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

type Choice = { value: string; label: string; order?: number; sortOrder?: number };

type ConditionFieldOption = Choice & {
  fieldType?: string;
  options?: Choice[];
  referenceEntityKey?: string;
  referenceScope?: string | null;
  referenceEntityTypeId?: string | null;
  allowMultiple?: boolean;
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
  choiceList?: { id: string; name: string; options: Choice[] } | null;
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

type RecordImageVariant = {
  id: string;
  variant: string;
  width?: number | null;
  height?: number | null;
  contentType: string;
  sizeBytes: number;
  url: string | null;
};

type RecordImageAsset = {
  id: string;
  contentType: string;
  width?: number | null;
  height?: number | null;
  originalFileName?: string | null;
  variants: RecordImageVariant[];
};

type RecordImage = {
  id: string;
  imageAssetId: string;
  isPrimary: boolean;
  sortOrder: number;
  caption?: string | null;
  focalX?: number | null;
  focalY?: number | null;
  zoom?: number | null;
  asset: RecordImageAsset;
};

export type FormViewProps = {
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

export function useForm({
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
  const [deleting, setDeleting] = useState(false);
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
  const [entityAccessAllowed, setEntityAccessAllowed] = useState(false);
  const [entityAccessWarning, setEntityAccessWarning] = useState<string | null>(null);
  const [entityAudit, setEntityAudit] = useState<EntityAuditPayload | null>(null);
  const [entityAuditAllowed, setEntityAuditAllowed] = useState(false);
  const [entityAuditLoading, setEntityAuditLoading] = useState(false);
  const [entityAuditError, setEntityAuditError] = useState<string | null>(null);
  const [recordImages, setRecordImages] = useState<RecordImage[]>([]);
  const [openAuditEntryId, setOpenAuditEntryId] = useState<string | null>(null);
  const [entityTypeWorldId, setEntityTypeWorldId] = useState<string | null>(null);
  const [relationshipTypeWorldId, setRelationshipTypeWorldId] = useState<string | null>(null);
  const [entityPanelId, setEntityPanelId] = useState<string | null>(null);
  const [entityTypePromptOptions, setEntityTypePromptOptions] = useState<Choice[]>([]);
  const [locationTypePromptOptions, setLocationTypePromptOptions] = useState<Choice[]>([]);
  const [conditionFieldOptions, setConditionFieldOptions] = useState<ConditionFieldOption[]>([]);
  const [entityTab, setEntityTab] = useState<
    "info" | "config" | "relationships" | "access" | "notes" | "audit"
  >("info");
  const [entityTypeTab, setEntityTypeTab] = useState<"details" | "designer">("details");
  const [noteDirty, setNoteDirty] = useState(false);
  const [noteDiscardVersion, setNoteDiscardVersion] = useState(0);
  const [saveNotice, setSaveNotice] = useState<{ id: string; message: string } | null>(
    null
  );
  const [isDirty, setIsDirty] = useState(false);
  const { showPopout } = usePopout();
  const initialSnapshotRef = useRef<string>("");
  const hasSnapshotRef = useRef(false);
  const snapshotKeyRef = useRef<string>("");
  const loadedKeyRef = useRef<string>("");
  const isDirtyRef = useRef(false);
  const suppressDirtyRef = useRef(false);
  const entityTypePromptShownRef = useRef(false);
  const entityTypeSelectionRef = useRef<string>("");
  const locationTypePromptShownRef = useRef(false);
  const locationTypeSelectionRef = useRef<string>("");

  const isNew = recordId === "new";
  const { permissions } = usePermissions({
    token,
    entityKey: view?.entityKey,
    recordId: isNew ? undefined : recordId,
    worldId:
      (typeof formData.worldId === "string" ? formData.worldId : undefined) ?? contextWorldId,
    campaignId: contextCampaignId,
    characterId: contextCharacterId,
    entityTypeId:
      (typeof formData.entityTypeId === "string" ? formData.entityTypeId : undefined) ??
      (typeof formData.sourceTypeId === "string" ? formData.sourceTypeId : undefined),
    entityFieldId:
      typeof formData.entityFieldId === "string" ? formData.entityFieldId : undefined,
    locationTypeId:
      typeof formData.locationTypeId === "string" ? formData.locationTypeId : undefined,
    locationTypeFieldId:
      typeof formData.locationTypeFieldId === "string"
        ? formData.locationTypeFieldId
        : undefined,
    isTemplate: Boolean(formData.isTemplate),
    enabled: Boolean(view?.entityKey)
  });
  const canCreateRecord = isNew ? permissions.canCreate : true;
  const canEditRecord = isNew ? permissions.canCreate : permissions.canEdit;
  const canDeleteRecord = !isNew && permissions.canDelete;
  const isFormReadOnly = !canEditRecord;
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
  const buildSnapshot = () =>
    stableStringify({
      formData,
      entityValues,
      entityAccess:
        (view?.entityKey === "entities" || view?.entityKey === "locations") && !entityAccessAllowed
          ? null
          : entityAccess
    });
  const ensureSnapshotReady = () => {
    if (hasSnapshotRef.current) return;
    const key = `${viewKey}:${recordId}`;
    if (loadedKeyRef.current !== key || loading || !view) return;
    initialSnapshotRef.current = buildSnapshot();
    hasSnapshotRef.current = true;
    suppressDirtyRef.current = false;
    setIsDirty(false);
  };
  const clearDirty = () => {
    isDirtyRef.current = false;
    setNoteDirty(false);
    setNoteDiscardVersion((current) => current + 1);
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

  const showSaveNotice = (message: string) => {
    setSaveNotice({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, message });
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
      setEntityAccessAllowed(false);
      setEntityAccessWarning(null);
      setEntityAudit(null);
      setEntityAuditAllowed(false);
        setEntityAuditLoading(false);
        setEntityAuditError(null);
        setOpenAuditEntryId(null);
        setEntityTypeWorldId(null);
        setEntityPanelId(null);
        setConditionFieldOptions([]);
        setEntitySections([]);
        setRecordImages([]);
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
            const recordParams = new URLSearchParams();
            if (viewData.entityKey === "entities") {
              if (contextCampaignId) recordParams.set("campaignId", contextCampaignId);
              if (contextCharacterId) recordParams.set("characterId", contextCharacterId);
            }
            const recordUrl =
              recordParams.toString().length > 0
                ? `${viewData.endpoint}/${recordId}?${recordParams.toString()}`
                : `${viewData.endpoint}/${recordId}`;
            const recordResponse = await fetch(recordUrl, {
              headers: { Authorization: `Bearer ${token}` }
            });

          if (handleUnauthorized(recordResponse)) {
            return;
          }

          if (!recordResponse.ok) {
            throw new Error("Unable to load record.");
          }

          const record = (await recordResponse.json()) as Record<string, unknown>;
          if (viewData.entityKey === "relationship_type_rules") {
            const fromValue = record.fromEntityTypeId;
            const toValue = record.toEntityTypeId;
            record.fromEntityTypeId = Array.isArray(fromValue)
              ? fromValue
              : fromValue
                ? [fromValue]
                : [];
            record.toEntityTypeId = Array.isArray(toValue) ? toValue : toValue ? [toValue] : [];
          }
          if (!ignore) {
            setFormData(record);
            if (
              (viewData.entityKey === "entities" || viewData.entityKey === "locations") &&
              record.fieldValues
            ) {
              setEntityValues(record.fieldValues as Record<string, unknown>);
            }
            if (
              (viewData.entityKey === "entities" || viewData.entityKey === "locations") &&
              Array.isArray(record.recordImages)
            ) {
              setRecordImages(record.recordImages as RecordImage[]);
            }
            if (viewData.entityKey === "entities" || viewData.entityKey === "locations") {
              const accessAllowed = (record as { accessAllowed?: boolean }).accessAllowed;
              const auditAllowed = (record as { auditAllowed?: boolean }).auditAllowed;
              if (typeof accessAllowed === "boolean") {
                setEntityAccessAllowed(accessAllowed);
                if (!accessAllowed) {
                  setEntityAccessWarning("Access controls are unavailable for this record.");
                }
              }
              if (typeof auditAllowed === "boolean") {
                setEntityAuditAllowed(auditAllowed);
              }
            }
          }
        } else {
          setFormData(initialValues ?? {});
          if (initialLabels) {
            setReferenceLabels((current) => ({ ...current, ...initialLabels }));
          }
        }
        loadedKeyRef.current = `${viewKey}:${recordId}`;
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
    }, [token, viewKey, recordId, isNew, contextCampaignId, contextCharacterId]);

  useEffect(() => {
    setEntityTab("info");
    setEntityTypeTab("details");
    hasSnapshotRef.current = false;
    snapshotKeyRef.current = "";
    initialSnapshotRef.current = "";
    loadedKeyRef.current = "";
    suppressDirtyRef.current = false;
    entityTypePromptShownRef.current = false;
    entityTypeSelectionRef.current = "";
    locationTypePromptShownRef.current = false;
    locationTypeSelectionRef.current = "";
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
    if (
      (view.entityKey === "entities" || view.entityKey === "locations") &&
      entityAccessAllowed &&
      entityAccess === null
    )
      return;
    const key = `${viewKey}:${recordId}`;
    if (loadedKeyRef.current !== key) return;
    if (snapshotKeyRef.current === key) {
      if (
        !isDirtyRef.current &&
        (view.entityKey === "entities" || view.entityKey === "locations") &&
        entityAccessAllowed &&
        entityAccess !== null
      ) {
        initialSnapshotRef.current = buildSnapshot();
        hasSnapshotRef.current = true;
        suppressDirtyRef.current = false;
        setIsDirty(false);
      }
      return;
    }
    snapshotKeyRef.current = key;
    initialSnapshotRef.current = buildSnapshot();
    hasSnapshotRef.current = true;
    suppressDirtyRef.current = false;
    setIsDirty(false);
  }, [loading, view, viewKey, recordId, entityAccess, entityAccessAllowed]);

  useEffect(() => {
    if (!hasSnapshotRef.current) return;
    if (suppressDirtyRef.current) {
      setIsDirty(noteDirty);
      return;
    }
    const nextSnapshot = buildSnapshot();
    const formDirty = nextSnapshot !== initialSnapshotRef.current;
    setIsDirty(formDirty || noteDirty);
  }, [formData, entityValues, entityAccess, noteDirty]);

  useEffect(() => {
    if (!noteDirty) return;
    setIsDirty(true);
  }, [noteDirty]);

  useEffect(() => {
    if (!view || (view.entityKey !== "entities" && view.entityKey !== "locations")) return;
    if (entityAccessAllowed) return;
    if (!hasSnapshotRef.current) return;
    initialSnapshotRef.current = buildSnapshot();
    setIsDirty(false);
  }, [view, entityAccessAllowed]);

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
        if (
          value === undefined ||
          value === null ||
          (Array.isArray(value) && value.length === 0) ||
          (typeof value === "string" && value.trim() === "")
        ) {
          return;
        }
          const entityKey = field.referenceEntityKey as string;
          const params = new URLSearchParams({
            entityKey,
            ids: String(value)
          });
          const worldId =
            (typeof formData.worldId === "string" ? formData.worldId : undefined) ??
            contextWorldId;
          if (
            worldId &&
            (entityKey === "locations" ||
              entityKey === "location_types" ||
              entityKey === "location_type_fields")
          ) {
            params.set("worldId", worldId);
          }
          if (entityKey === "locations") {
            if (contextCampaignId) params.set("campaignId", contextCampaignId);
            if (contextCharacterId) params.set("characterId", contextCharacterId);
          }
          const response = await fetch(`/api/references?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
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
  }, [view, formData, token, contextWorldId, contextCampaignId, contextCharacterId]);

  useEffect(() => {
    let ignore = false;
    if (!view || (view.entityKey !== "entities" && view.entityKey !== "locations")) return;
    const refFields = entityFields.filter(
      (field) =>
        field.fieldType === "ENTITY_REFERENCE" || field.fieldType === "LOCATION_REFERENCE"
    );
    if (refFields.length === 0) return;

      const loadLabels = async () => {
        const nextLabels: Record<string, string> = {};
        await Promise.all(
          refFields.map(async (field) => {
            const value = entityValues[field.fieldKey];
            if (!value || entityReferenceLabels[field.fieldKey]) return;
            const referenceEntityKey =
              field.fieldType === "LOCATION_REFERENCE" ? "locations" : "entities";
            const params = new URLSearchParams({
              entityKey: referenceEntityKey,
              ids: String(value)
            });
            const worldId = (formData.worldId as string | undefined) ?? contextWorldId;
            if (worldId) params.set("worldId", worldId);
            if (contextCampaignId) params.set("campaignId", contextCampaignId);
            if (contextCharacterId) params.set("characterId", contextCharacterId);
            if (referenceEntityKey === "entities" && field.referenceEntityTypeId) {
              params.set("entityTypeId", field.referenceEntityTypeId);
            }
            const response = await fetch(`/api/references?${params.toString()}`, {
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
    }, [
      view,
      entityFields,
      entityValues,
      entityReferenceLabels,
      token,
      formData.worldId,
      contextWorldId,
      contextCampaignId,
      contextCharacterId
    ]);

  useEffect(() => {
    let ignore = false;
    if (!view || (view.entityKey !== "entities" && view.entityKey !== "locations")) return;

    const typeId =
      view.entityKey === "entities"
        ? (formData.entityTypeId as string | undefined)
        : (formData.locationTypeId as string | undefined);
    if (!typeId) {
      setEntityFields([]);
      return;
    }

    const loadEntityFields = async () => {
      const endpoint =
        view.entityKey === "entities"
          ? `/api/entity-fields?entityTypeId=${typeId}`
          : `/api/location-type-fields?locationTypeId=${typeId}`;
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) return;
      const data = (await response.json()) as Array<
        EntityFieldDefinition & { fieldLabel?: string }
      >;
      if (!ignore) {
          const sorted = [...data]
            .map((field) => ({
              ...field,
              label: field.label ?? field.fieldLabel ?? field.fieldKey,
              choiceList: field.choiceList
                ? {
                    ...field.choiceList,
                    options: [...field.choiceList.options].sort(
                      (a, b) => (a.order ?? a.sortOrder ?? 0) - (b.order ?? b.sortOrder ?? 0)
                    )
                  }
                : field.choiceList
            }))
            .sort((a, b) => a.formOrder - b.formOrder);
        setEntityFields(sorted);
      }
    };

    void loadEntityFields();

    return () => {
      ignore = true;
    };
  }, [view, formData.entityTypeId, formData.locationTypeId, token]);

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
    if (!view || (view.entityKey !== "entities" && view.entityKey !== "locations")) return;
    if (recordId !== "new") return;
    setEntityValues({});
    setEntityReferenceLabels({});
  }, [view, recordId, formData.entityTypeId, formData.locationTypeId]);

  useEffect(() => {
    let ignore = false;
    if (!view || (view.entityKey !== "entities" && view.entityKey !== "locations")) return;

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
      if (loading) return;
      const key = `${viewKey}:${recordId}`;
      if (recordId !== "new" && loadedKeyRef.current !== key) return;
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
        setEntityAccessAllowed(true);
        setEntityAccessWarning(null);
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
      setEntityAccessAllowed(true);
      setEntityAccessWarning(null);
    }
    return;
  }

  if ((formData as { accessAllowed?: boolean }).accessAllowed === false) {
    if (!ignore) {
      setEntityAccessAllowed(false);
      setEntityAccessWarning("Access controls are unavailable for this record.");
    }
    return;
  }

  const accessEntityKey = view.entityKey === "locations" ? "locations" : "entities";
  const response = await fetch(`/api/${accessEntityKey}/${recordId}/access`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (handleUnauthorized(response)) return;
  if (response.status === 403) {
    if (!ignore) {
      setEntityAccessAllowed(false);
      setEntityAccessWarning("Access controls are unavailable for this record.");
    }
    return;
  }
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
    setEntityAccessAllowed(true);
    setEntityAccessWarning(null);
  }
};

    void loadAccess();

    return () => {
      ignore = true;
    };
    }, [view, recordId, token, contextCampaignId, contextCharacterId, viewKey, loading]);

  useEffect(() => {
    let ignore = false;
    if (!view || view.entityKey !== "entities") return;
    if (!isNew) return;
    if (formData.entityTypeId) return;
    const worldId = (formData.worldId as string | undefined) ?? contextWorldId;
    if (!worldId) return;

    const loadEntityTypes = async () => {
      const params = new URLSearchParams({ entityKey: "entity_types" });
      params.set("worldId", worldId);
      params.set("scope", "entity_type");
      const response = await fetch(`/api/references?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) return;
      const data = (await response.json()) as Array<{ id: string; label: string }>;
      if (!ignore) {
        setEntityTypePromptOptions(data.map((item) => ({ value: item.id, label: item.label })));
      }
    };

    void loadEntityTypes();

    return () => {
      ignore = true;
    };
  }, [view, isNew, formData.entityTypeId, formData.worldId, contextWorldId, token]);

  useEffect(() => {
    if (!view || view.entityKey !== "entities") return;
    if (!isNew) return;
    if (formData.entityTypeId) return;
    if (entityTypePromptShownRef.current) return;
    if (entityTypePromptOptions.length === 0) return;

    entityTypePromptShownRef.current = true;
    entityTypeSelectionRef.current = entityTypePromptOptions[0]?.value ?? "";

    const EntityTypePrompt = () => {
      const [value, setValue] = useState(entityTypeSelectionRef.current);
      return (
        <label className="form-view__field">
          <span className="form-view__label">Entity type</span>
          <select
            value={value}
            onChange={(event) => {
              const next = event.target.value;
              setValue(next);
              entityTypeSelectionRef.current = next;
            }}
          >
            {entityTypePromptOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    };

    showPopout({
      title: "What type of Entity are you creating?",
      message: <EntityTypePrompt />,
      dismissOnBackdrop: false,
      actions: [
        {
          label: "Set type",
          tone: "primary",
          onClick: () => {
            const selected = entityTypeSelectionRef.current;
            if (!selected) return;
            const option = entityTypePromptOptions.find((item) => item.value === selected);
            setFormData((current) => ({ ...current, entityTypeId: selected }));
            if (option) {
              setReferenceLabels((current) => ({
                ...current,
                entityTypeId: option.label
              }));
            }
          }
        }
        ,
        {
          label: "Cancel",
          tone: "ghost",
          onClick: () => {
            handleNavigateAway(onBack);
          }
        }
      ]
    });
  }, [
    view,
    isNew,
    formData.entityTypeId,
    entityTypePromptOptions,
    showPopout
  ]);

  useEffect(() => {
    let ignore = false;
    if (!view || view.entityKey !== "locations") return;
    if (!isNew) return;
    if (formData.locationTypeId) return;
    const worldId = (formData.worldId as string | undefined) ?? contextWorldId;
    if (!worldId) return;

    const loadLocationTypes = async () => {
      const params = new URLSearchParams({ entityKey: "location_types" });
      params.set("worldId", worldId);
      params.set("scope", "location_type");
      const response = await fetch(`/api/references?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) return;
      const data = (await response.json()) as Array<{ id: string; label: string }>;
      if (!ignore) {
        setLocationTypePromptOptions(data.map((item) => ({ value: item.id, label: item.label })));
      }
    };

    void loadLocationTypes();

    return () => {
      ignore = true;
    };
  }, [view, isNew, formData.locationTypeId, formData.worldId, contextWorldId, token]);

  useEffect(() => {
    if (!view || view.entityKey !== "locations") return;
    if (!isNew) return;
    if (formData.locationTypeId) return;
    if (locationTypePromptShownRef.current) return;
    if (locationTypePromptOptions.length === 0) return;

    locationTypePromptShownRef.current = true;
    locationTypeSelectionRef.current = locationTypePromptOptions[0]?.value ?? "";

    const LocationTypePrompt = () => {
      const [value, setValue] = useState(locationTypeSelectionRef.current);
      return (
        <label className="form-view__field">
          <span className="form-view__label">Location type</span>
          <select
            value={value}
            onChange={(event) => {
              const next = event.target.value;
              setValue(next);
              locationTypeSelectionRef.current = next;
            }}
          >
            {locationTypePromptOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    };

    showPopout({
      title: "What type of Location are you creating?",
      message: <LocationTypePrompt />,
      dismissOnBackdrop: false,
      actions: [
        {
          label: "Set type",
          tone: "primary",
          onClick: () => {
            const selected = locationTypeSelectionRef.current;
            if (!selected) return;
            const option = locationTypePromptOptions.find((item) => item.value === selected);
            setFormData((current) => ({ ...current, locationTypeId: selected }));
            if (option) {
              setReferenceLabels((current) => ({
                ...current,
                locationTypeId: option.label
              }));
            }
          }
        },
        {
          label: "Cancel",
          tone: "ghost",
          onClick: () => {
            handleNavigateAway(onBack);
          }
        }
      ]
    });
  }, [
    view,
    isNew,
    formData.locationTypeId,
    locationTypePromptOptions,
    showPopout
  ]);

  useEffect(() => {
    let ignore = false;
    if (!view || view.entityKey !== "entity_fields") {
      setEntityTypeWorldId(null);
      return;
    }
    const entityTypeId = formData.entityTypeId as string | undefined;
    if (!entityTypeId) {
      setEntityTypeWorldId(null);
      return;
    }

    const loadEntityTypeWorld = async () => {
      const response = await fetch(`/api/entity-types/${entityTypeId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) return;
      const data = (await response.json()) as { worldId?: string | null };
      if (!ignore) {
        setEntityTypeWorldId(data.worldId ?? null);
      }
    };

    void loadEntityTypeWorld();

    return () => {
      ignore = true;
    };
  }, [view, formData.entityTypeId, token]);

  useEffect(() => {
    let ignore = false;
    if (!view || view.entityKey !== "relationship_type_rules") {
      setRelationshipTypeWorldId(null);
      return;
    }
    const relationshipTypeId = formData.relationshipTypeId as string | undefined;
    if (!relationshipTypeId) {
      setRelationshipTypeWorldId(null);
      return;
    }

    const loadRelationshipTypeWorld = async () => {
      const response = await fetch(`/api/relationship-types/${relationshipTypeId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (handleUnauthorized(response)) return;
      if (!response.ok) return;
      const data = (await response.json()) as { worldId?: string | null };
      if (!ignore) {
        setRelationshipTypeWorldId(data.worldId ?? null);
      }
    };

    void loadRelationshipTypeWorld();

    return () => {
      ignore = true;
    };
  }, [view, formData.relationshipTypeId, token]);

  useEffect(() => {
    let ignore = false;
    if (
      !view ||
      (view.entityKey !== "entities" && view.entityKey !== "locations") ||
      recordId === "new"
    ) {
      setEntityAudit(null);
      setEntityAuditAllowed(false);
      setEntityAuditLoading(false);
      setEntityAuditError(null);
      return;
    }

    const loadAudit = async () => {
      if (loading) return;
      const key = `${viewKey}:${recordId}`;
      if (loadedKeyRef.current !== key) return;
      if ((formData as { auditAllowed?: boolean }).auditAllowed === false) {
        if (!ignore) {
          setEntityAuditAllowed(false);
          setEntityAudit(null);
        }
        return;
      }
      setEntityAuditLoading(true);
      setEntityAuditError(null);
      setOpenAuditEntryId(null);
      try {
        const auditEntityKey = view.entityKey === "locations" ? "locations" : "entities";
        const response = await fetch(`/api/${auditEntityKey}/${recordId}/audit`, {
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
  }, [view, recordId, token, viewKey, loading]);

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
                options: field.choiceList?.options?.map((option) => ({
                  value: option.value,
                  label: option.label
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
    if (view.entityKey === "relationship_type_rules") {
      fields = fields.map((field) => {
        if (field.fieldKey === "fromEntityTypeId" || field.fieldKey === "toEntityTypeId") {
          return { ...field, allowMultiple: true };
        }
        return field;
      });
    }
    return fields;
  }, [view, formData.fieldType]);

  const visibleEntityFields = useMemo(() => {
    if (!view || (view.entityKey !== "entities" && view.entityKey !== "locations")) return [];
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

  const shouldShowValidationErrors =
    typeof error === "string" && error.startsWith("Missing required fields:");
  const formErrorId = error ? "form-error" : undefined;

  const isMissingFormField = (field: ViewField, value: unknown) => {
    if (!field.required) return false;
    if (field.fieldType === "REFERENCE") {
      return isMultiReferenceField(field)
        ? !Array.isArray(value) || value.length === 0
        : !value;
    }
    return value === undefined || value === "";
  };

  const isMissingEntityField = (field: EntityFieldDefinition, value: unknown) => {
    if (!field.required) return false;
    return value === undefined || value === "" || value === null;
  };

  const handleChange = (fieldKey: string, value: unknown) => {
    ensureSnapshotReady();
    setFormData((current) => ({ ...current, [fieldKey]: value }));
  };

  const isMultiReferenceField = (field: ViewField) =>
    Boolean(
      field.allowMultiple ||
        (view?.entityKey === "relationship_type_rules" &&
          (field.fieldKey === "fromEntityTypeId" || field.fieldKey === "toEntityTypeId"))
    );

  const handleEntityValueChange = (fieldKey: string, value: unknown) => {
    ensureSnapshotReady();
    setEntityValues((current) => ({ ...current, [fieldKey]: value }));
  };

  const renderEntityField = (field: EntityFieldDefinition) => {
    const value = entityValues[field.fieldKey];
    const isDisabled = isFormReadOnly;
    const isInvalid = shouldShowValidationErrors && isMissingEntityField(field, value);

    if (field.fieldType === "BOOLEAN") {
      return (
        <label key={field.fieldKey} className="form-view__field form-view__field--boolean">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => handleEntityValueChange(field.fieldKey, event.target.checked)}
            aria-required={field.required}
            aria-invalid={isInvalid || undefined}
            aria-describedby={isInvalid ? formErrorId : undefined}
            disabled={isDisabled}
          />
          <span>{field.label}</span>
        </label>
      );
    }

      if (
        field.fieldType === "ENTITY_REFERENCE" ||
        field.fieldType === "LOCATION_REFERENCE"
      ) {
        const isLocationReference = field.fieldType === "LOCATION_REFERENCE";
        const options = entityReferenceOptions[field.fieldKey] ?? [];
        const labelValue = entityReferenceLabels[field.fieldKey] ?? "";
        const isOpen = entityReferenceOpen[field.fieldKey];
        const entityRefId = getEntityReferenceId(value);

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
              <div className="reference-field__input-row">
                <input
                  type="text"
                  value={labelValue}
                  placeholder={isLocationReference ? "Search locations..." : "Search entities..."}
                  onClick={() => {
                    if (isDisabled) return;
                    setEntityReferenceOpen((current) => ({ ...current, [field.fieldKey]: true }));
                    void handleEntityReferenceSearch(field, labelValue);
                  }}
                  onChange={(event) => {
                    if (isDisabled) return;
                    const next = event.target.value;
                    setEntityReferenceLabels((current) => ({ ...current, [field.fieldKey]: next }));
                    handleEntityValueChange(field.fieldKey, "");
                    void handleEntityReferenceSearch(field, next);
                  }}
                  onFocus={() => {
                    if (isDisabled) return;
                    setEntityReferenceOpen((current) => ({ ...current, [field.fieldKey]: true }));
                    void handleEntityReferenceSearch(field, labelValue);
                  }}
                  aria-required={field.required}
                  aria-invalid={isInvalid || undefined}
                  aria-describedby={isInvalid ? formErrorId : undefined}
                  disabled={isDisabled}
                />
                {isLocationReference ? null : renderEntityInfoButton(entityRefId)}
              </div>
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
                        if (isDisabled) return;
                        closeEntityReferenceDropdown(field.fieldKey);
                        handleEntityValueChange(field.fieldKey, option.value);
                        setEntityReferenceLabels((current) => ({
                          ...current,
                          [field.fieldKey]: option.label
                        }));
                      }}
                      disabled={isDisabled}
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
            aria-required={field.required}
            aria-invalid={isInvalid || undefined}
            aria-describedby={isInvalid ? formErrorId : undefined}
            readOnly={isDisabled}
          />
        ) : field.fieldType === "CHOICE" ? (
            <select
              value={value ? String(value) : ""}
              onChange={(event) => handleEntityValueChange(field.fieldKey, event.target.value)}
              aria-required={field.required}
              aria-invalid={isInvalid || undefined}
              aria-describedby={isInvalid ? formErrorId : undefined}
              disabled={isDisabled}
            >
              <option value="">Select...</option>
              {(field.choiceList?.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
        ) : field.fieldType === "NUMBER" ? (
          <input
            type="number"
            value={value ?? ""}
            onChange={(event) =>
              handleEntityValueChange(
                field.fieldKey,
                event.target.value === "" ? "" : Number(event.target.value)
              )
            }
            aria-required={field.required}
            aria-invalid={isInvalid || undefined}
            aria-describedby={isInvalid ? formErrorId : undefined}
            disabled={isDisabled}
          />
        ) : (
          <input
            type="text"
            value={value ? String(value) : ""}
            onChange={(event) => handleEntityValueChange(field.fieldKey, event.target.value)}
            aria-required={field.required}
            aria-invalid={isInvalid || undefined}
            aria-describedby={isInvalid ? formErrorId : undefined}
            disabled={isDisabled}
          />
        )}
      </label>
    );
  };

  const handleReferenceSearch = async (field: ViewField, query: string) => {
      if (!field.referenceEntityKey) return;
      const effectiveScope =
        field.referenceScope ?? (field.fieldKey === "referenceEntityTypeId" ? "entity_type" : null);
      const scopeParam = effectiveScope ? `&scope=${effectiveScope}` : "";
      const gmWorldId =
        effectiveScope === "world_gm"
          ? ((formData.worldId as string | undefined) ?? contextWorldId)
          : undefined;
      const gmWorldParam = gmWorldId ? `&worldId=${gmWorldId}` : "";
      const worldParamValue =
        (typeof formData.worldId === "string" ? formData.worldId : undefined) ??
        contextWorldId;
      const preferredWorldId =
        (typeof formData.worldId === "string" ? formData.worldId : undefined) ??
        relationshipTypeWorldId ??
        entityTypeWorldId ??
        contextWorldId;
      const contextParams =
        effectiveScope === "entity_type" || effectiveScope === "relationship_type"
          ? preferredWorldId
            ? `&worldId=${preferredWorldId}`
            : ""
          : field.referenceEntityKey === "entity_fields" && contextWorldId
            ? `&worldId=${contextWorldId}`
            : "";
      const relationshipTypeIdValue =
        typeof formData.relationshipTypeId === "string" ? formData.relationshipTypeId : undefined;
      const relationshipTypeParam =
        field.referenceEntityKey === "entity_types" && relationshipTypeIdValue
          ? `&relationshipTypeId=${relationshipTypeIdValue}`
          : "";
      const locationScopeParams =
        effectiveScope === "location_parent"
          ? `${formData.locationTypeId ? `&locationTypeId=${formData.locationTypeId}` : ""}${
              worldParamValue ? `&worldId=${worldParamValue}` : ""
            }`
          : effectiveScope === "location_reference" ||
              effectiveScope === "location_type" ||
              field.referenceEntityKey === "locations"
            ? worldParamValue
              ? `&worldId=${worldParamValue}`
              : ""
            : field.referenceEntityKey === "location_type_fields" && worldParamValue
              ? `&worldId=${worldParamValue}`
              : "";
      const locationAccessParams =
        field.referenceEntityKey === "locations"
          ? `${contextCampaignId ? `&campaignId=${contextCampaignId}` : ""}${
              contextCharacterId ? `&characterId=${contextCharacterId}` : ""
            }`
          : "";
      const choiceListParams =
        effectiveScope === "choice_list_world"
          ? worldParamValue
            ? `&worldId=${worldParamValue}`
            : ""
          : effectiveScope === "choice_list_pack"
            ? typeof formData.packId === "string"
              ? `&packId=${formData.packId}`
              : ""
            : "";
    const response = await fetch(
      `/api/references?entityKey=${field.referenceEntityKey}&query=${encodeURIComponent(query)}${scopeParam}${contextParams}${relationshipTypeParam}${gmWorldParam}${locationScopeParams}${locationAccessParams}${choiceListParams}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (handleUnauthorized(response)) return;
    if (!response.ok) return;
    const data = (await response.json()) as Array<{ id: string; label: string }>;
    const options = data.map((item) => ({ value: item.id, label: item.label }));
    setReferenceOptions((current) => ({ ...current, [field.fieldKey]: options }));
  };

    const handleEntityReferenceSearch = async (field: EntityFieldDefinition, query: string) => {
      const referenceEntityKey =
        field.fieldType === "LOCATION_REFERENCE" ? "locations" : "entities";
      const params = new URLSearchParams({
        entityKey: referenceEntityKey,
        query
      });
      const worldId = (formData.worldId as string | undefined) ?? contextWorldId;
      if (worldId) params.set("worldId", worldId);
      if (contextCampaignId) params.set("campaignId", contextCampaignId);
      if (contextCharacterId) params.set("characterId", contextCharacterId);
      if (referenceEntityKey === "entities" && field.referenceEntityTypeId) {
        params.set("entityTypeId", field.referenceEntityTypeId);
      }

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
    if (isMultiReferenceField(field)) return;
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
    if (isMultiReferenceField(field)) {
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

  const prepareForRedirectAfterCreate = () => {
    hasSnapshotRef.current = false;
    snapshotKeyRef.current = "";
    initialSnapshotRef.current = "";
    suppressDirtyRef.current = true;
    setIsDirty(false);
    window.dispatchEvent(
      new CustomEvent("ttrpg:form-dirty", { detail: { dirty: false } })
    );
  };

  const redirectToSavedRecord = (entityKey: string, id: string) => {
    prepareForRedirectAfterCreate();
    window.location.hash = `/form/${entityKey}/${id}`;
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
          return isMultiReferenceField(field) ? !Array.isArray(value) || value.length === 0 : !value;
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

    if (view.entityKey === "entities" || view.entityKey === "locations") {
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
    let requestUrl = isNew ? view.endpoint : `${view.endpoint}/${recordId}`;
    if (!isNew && view.entityKey === "entities") {
      const params = new URLSearchParams();
      if (contextCampaignId) params.set("campaignId", contextCampaignId);
      if (contextCharacterId) params.set("characterId", contextCharacterId);
      if (params.toString()) {
        requestUrl = `${requestUrl}?${params.toString()}`;
      }
    }

    const response = await fetch(requestUrl, {
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

      if (
        !isNew &&
        (view.entityKey === "entities" || view.entityKey === "locations") &&
        entityAccessAllowed &&
        entityAccess
      ) {
        const accessEntityKey = view.entityKey === "locations" ? "locations" : "entities";
        const accessResponse = await fetch(`/api/${accessEntityKey}/${savedId}/access`, {
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
        if (!accessResponse.ok) {
          setEntityAccessWarning("Access controls could not be updated.");
        }
      }

      if (view.entityKey === "entities") {
        window.dispatchEvent(new Event("ttrpg:entities-updated"));
      }
      if (view.entityKey === "locations") {
        window.dispatchEvent(new Event("ttrpg:locations-updated"));
      }
      if (view.entityKey === "location_types") {
        window.dispatchEvent(new Event("ttrpg:location-types-updated"));
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
      showSaveNotice("Changes saved.");
      setSaving(false);
      window.dispatchEvent(
        new CustomEvent("ttrpg:form-saved", { detail: { recordId: savedId } })
      );
      const shouldRedirectAfterCreate =
        isNew &&
        savedId &&
        savedId !== recordId &&
        view.entityKey &&
        ["entities", "locations", "worlds", "campaigns", "characters"].includes(view.entityKey);
      if (shouldRedirectAfterCreate) {
        redirectToSavedRecord(view.entityKey, savedId);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setSaving(false);
      return false;
    }
  };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void saveRecord();
    };

    const handleUpdateAndBack = () => {
      void saveRecord().then((ok) => {
        if (ok) {
          onBack();
        }
    });
  };

  const logReferenceChipRemoval = (
    field: ViewField,
    removed: Choice,
    before: Choice[],
    after: Choice[]
  ) => {
    console.log("[FormView] reference chip removed", {
      fieldKey: field.fieldKey,
      fieldLabel: field.label,
      referenceEntityKey: field.referenceEntityKey,
      removed,
      beforeCount: before.length,
      afterCount: after.length,
      beforeValues: before.map((entry) => `${entry.label} (${entry.value})`),
      afterValues: after.map((entry) => `${entry.label} (${entry.value})`),
      formDataValue: formData[field.fieldKey],
      referenceSelections: referenceSelections[field.fieldKey]
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

    const openEntityRecord = (id: string) => {
      handleNavigateAway(() => {
        setEntityPanelId(null);
        window.location.hash = `/form/entities/${id}`;
      });
    };

    const openLocationRecord = (id: string) => {
      handleNavigateAway(() => {
        setEntityPanelId(null);
        window.location.hash = `/form/locations/${id}`;
      });
    };

  const handleDelete = async () => {
    if (!view || isNew || deleting) return;
    if (!window.confirm("Delete this item?")) return;
    setDeleting(true);
    setError(null);

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
      if (view.entityKey === "location_types") {
        window.dispatchEvent(new Event("ttrpg:location-types-updated"));
      }

      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
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

    const isEntityView = view?.entityKey === "entities";
    const isLocationView = view?.entityKey === "locations";
    const isEntityTypeView = view?.entityKey === "entity_types";
    const isRecordView = Boolean(isEntityView || isLocationView);
    const showFormActions =
      canEditRecord &&
      (isNew ? canCreateRecord : true) &&
      !(isEntityView && entityTab === "relationships");
  const templateFieldKeys = new Set(["isTemplate", "sourceTypeId"]);
  const entityTypeFields =
    view?.entityKey === "entity_types"
      ? formFields.filter((field) => {
          if (entityTypeTab === "details") {
            return !templateFieldKeys.has(field.fieldKey);
          }
          return false;
        })
      : formFields;
  const configFieldKeys = new Set(isEntityView ? ["worldId", "entityTypeId"] : []);
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
    const sideBySideInfoFields =
      isEntityView && entityTab === "info"
        ? infoFields.filter((field) => field.fieldKey === "worldId")
        : [];
    const remainingInfoFields =
      sideBySideInfoFields.length > 0
        ? infoFields.filter((field) => field.fieldKey !== "worldId")
        : infoFields;
    const customFieldRows: string[][] =
        view?.entityKey === "entity_fields"
          ? [
              ["entityTypeId", "fieldKey"],
              ["label", "fieldType"],
              ["required", "referenceEntityTypeId"],
              ["referenceLocationTypeKey", "choiceListId"]
            ]
          : [];
    const shouldUseCustomRows = !isEntityView && customFieldRows.length > 0;
    const customRowFields = shouldUseCustomRows
      ? customFieldRows
          .map((row) =>
            row.map((key) => infoFields.find((field) => field.fieldKey === key)).filter(Boolean)
          )
          .filter((row) => row.length > 0) as ViewField[][]
      : [];
    const customRowFieldKeys = shouldUseCustomRows
      ? new Set(customRowFields.flat().map((field) => field.fieldKey))
      : new Set<string>();
    const customRemainingFields = shouldUseCustomRows
      ? infoFields.filter((field) => !customRowFieldKeys.has(field.fieldKey))
      : infoFields;
    const shouldLockEntityField = (field: ViewField) =>
      !isNew &&
      ((isEntityView && (field.fieldKey === "worldId" || field.fieldKey === "entityTypeId")) ||
        (isLocationView &&
          (field.fieldKey === "worldId" || field.fieldKey === "locationTypeId")));
    const getEntityReferenceId = (value: unknown) => {
      if (Array.isArray(value)) {
        return value.length > 0 ? String(value[0]) : null;
      }
      if (value === null || value === undefined || value === "") return null;
      return String(value);
    };
    const renderEntityInfoButton = (entityId: string | null) =>
      entityId ? (
        <button
          type="button"
          className="reference-field__info"
          onClick={() => setEntityPanelId(entityId)}
          aria-label="Open entity info"
          title="Open entity info"
        >
          i
        </button>
      ) : null;
    const renderField = (field: ViewField) => {
      const value = formData[field.fieldKey];
      const coerced = coerceValue(field.fieldType, value);
      const listKey = field.optionsListKey ?? "";
      const choices = listKey ? choiceMaps[listKey] ?? [] : [];
      const isLocked = shouldLockEntityField(field);
      const isInvalid = shouldShowValidationErrors && isMissingFormField(field, value);

      if (view?.entityKey === "entity_fields" && field.fieldKey === "conditions") {
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
              disabled={field.readOnly || isFormReadOnly}
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
              aria-required={field.required}
              aria-invalid={isInvalid || undefined}
              aria-describedby={isInvalid ? formErrorId : undefined}
              disabled={field.readOnly || isLocked || isFormReadOnly}
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
          field.readOnly ||
          isLocked ||
          isFormReadOnly ||
          (field.fieldKey === "playerId" && currentUserRole !== "ADMIN");

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
              {isMultiReferenceField(field) && selections.length > 0 ? (
                <div className="reference-field__chips">
                  {selections.map((item) => (
                    <button
                      type="button"
                      key={item.value}
                      className="reference-field__chip"
                      onClick={() => {
                        const next = selections.filter((entry) => entry.value !== item.value);
                        logReferenceChipRemoval(field, item, selections, next);
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
              <div className="reference-field__input-row">
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
                    if (!isMultiReferenceField(field)) {
                      handleChange(field.fieldKey, "");
                    }
                    void handleReferenceSearch(field, next);
                  }}
                  onFocus={() => {
                    if (disabled) return;
                    setReferenceOpen((current) => ({ ...current, [field.fieldKey]: true }));
                    void handleReferenceSearch(field, labelValue);
                  }}
                  aria-required={field.required}
                  aria-invalid={isInvalid || undefined}
                  aria-describedby={isInvalid ? formErrorId : undefined}
                  disabled={disabled}
                />
                {field.referenceEntityKey === "entities"
                  ? renderEntityInfoButton(
                      getEntityReferenceId(formData[field.fieldKey])
                    )
                  : null}
              </div>
              {field.required &&
              (!formData[field.fieldKey] ||
                (isMultiReferenceField(field) &&
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
              aria-required={field.required}
              aria-invalid={isInvalid || undefined}
              aria-describedby={isInvalid ? formErrorId : undefined}
              required={field.required}
              readOnly={field.readOnly || isLocked || isFormReadOnly}
            />
          ) : field.fieldType === "SELECT" ? (
            <select
              value={String(coerced)}
              onChange={(event) => handleChange(field.fieldKey, event.target.value)}
              aria-required={field.required}
              aria-invalid={isInvalid || undefined}
              aria-describedby={isInvalid ? formErrorId : undefined}
              required={field.required}
              disabled={field.readOnly || isLocked || isFormReadOnly}
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
              aria-required={field.required}
              aria-invalid={isInvalid || undefined}
              aria-describedby={isInvalid ? formErrorId : undefined}
              required={field.required}
              disabled={field.readOnly || isLocked || isFormReadOnly}
            />
          )}
        </label>
      );
    };

  const savedRecordEntityLabel = (() => {
    const key = view?.entityKey;
    if (!key) return undefined;
    if (key === "worlds") return "World";
    if (key === "campaigns") return "Campaign";
    if (key === "characters") return "Character";
    return undefined;
  })();

  const savedRecordName = (() => {
    if (isNew) return undefined;
    if (typeof formData.name !== "string") return undefined;
    const trimmed = formData.name.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })();

  const formTitle =
    savedRecordName
      ? savedRecordEntityLabel
        ? `${savedRecordEntityLabel}: ${savedRecordName}`
        : isRecordView
          ? savedRecordName
          : view?.title ?? ""
      : view?.title ?? "";

    return {
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
    onContextSwitch,
    view,
    setView,
    formData,
    setFormData,
    loading,
    setLoading,
    error,
    setError,
    saving,
    deleting,
    setSaving,
    choiceMaps,
    setChoiceMaps,
    referenceOptions,
    setReferenceOptions,
    referenceLabels,
    setReferenceLabels,
    referenceSelections,
    setReferenceSelections,
    referenceOpen,
    setReferenceOpen,
    entityFields,
    setEntityFields,
    entitySections,
    setEntitySections,
    entityValues,
    setEntityValues,
    entityReferenceOptions,
    setEntityReferenceOptions,
    entityReferenceLabels,
    setEntityReferenceLabels,
    entityReferenceOpen,
    setEntityReferenceOpen,
    entityAccess,
    setEntityAccess,
    entityAccessAllowed,
    setEntityAccessAllowed,
    entityAccessWarning,
    setEntityAccessWarning,
    entityAudit,
    setEntityAudit,
    entityAuditAllowed,
    setEntityAuditAllowed,
    entityAuditLoading,
    setEntityAuditLoading,
    entityAuditError,
    setEntityAuditError,
    recordImages,
    setRecordImages,
    openAuditEntryId,
    setOpenAuditEntryId,
    entityTypeWorldId,
    setEntityTypeWorldId,
    relationshipTypeWorldId,
    setRelationshipTypeWorldId,
    entityPanelId,
    setEntityPanelId,
    entityTypePromptOptions,
    setEntityTypePromptOptions,
    conditionFieldOptions,
    setConditionFieldOptions,
    entityTab,
    setEntityTab,
    entityTypeTab,
    setEntityTypeTab,
    noteDirty,
    setNoteDirty,
    noteDiscardVersion,
    setNoteDiscardVersion,
    saveNotice,
    setSaveNotice,
    isDirty,
    setIsDirty,
    showPopout,
    initialSnapshotRef,
    hasSnapshotRef,
    snapshotKeyRef,
    loadedKeyRef,
    isDirtyRef,
    suppressDirtyRef,
    entityTypePromptShownRef,
    entityTypeSelectionRef,
    isNew,
    permissions,
    canCreateRecord,
    canEditRecord,
    canDeleteRecord,
    isFormReadOnly,
    formatAuditAction,
    formatAuditTimestamp,
    formatAuditValue,
    getUpdateChanges,
    buildSnapshot,
    ensureSnapshotReady,
    clearDirty,
    handleUnauthorized,
    showSaveNotice,
    formFields,
    visibleEntityFields,
    handleChange,
    coerceValue,
    isMultiReferenceField,
    handleEntityValueChange,
    renderEntityField,
    handleReferenceSearch,
    handleEntityReferenceSearch,
    resolveReferenceSelection,
    closeReferenceDropdown,
    closeEntityReferenceDropdown,
    handleReferenceSelect,
    markSaved,
    saveRecord,
    handleSubmit,
    handleUpdateAndBack,
    logReferenceChipRemoval,
    confirmUnsavedChanges,
    handleNavigateAway,
    openEntityRecord,
    openLocationRecord,
    handleDelete,
    isEntityView,
    isLocationView,
    isEntityTypeView,
    isRecordView,
    showFormActions,
    formTitle,
    templateFieldKeys,
    entityTypeFields,
    configFieldKeys,
    canViewConfigTab,
    infoFields,
    configFields,
    sideBySideInfoFields,
    remainingInfoFields,
    customFieldRows,
    shouldUseCustomRows,
    customRowFields,
    customRowFieldKeys,
    customRemainingFields,
    shouldLockEntityField,
    getEntityReferenceId,
    renderEntityInfoButton,
    renderField
  };
}

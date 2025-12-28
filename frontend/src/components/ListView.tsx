import { useEffect, useMemo, useState } from "react";
import { dispatchUnauthorized } from "../utils/auth";
import { usePermissions } from "../utils/permissions";
import { usePopout } from "./PopoutProvider";
import EntitySidePanel from "./EntitySidePanel";

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

type Choice = { value: string; label: string; pillColor?: string | null; textColor?: string | null };

type ListFilterRule = {
  fieldKey: string;
  operator: string;
  value?: string | string[];
};

type ListFilterGroup = {
  logic: "AND" | "OR";
  rules: ListFilterRule[];
};

type ListField = {
  fieldKey: string;
  label: string;
  fieldType: string;
  listOrder?: number;
  width?: string | null;
  referenceEntityKey?: string | null;
  referenceEntityTypeId?: string | null;
  optionsListKey?: string | null;
  choices?: Choice[];
  source: "system" | "entity";
  allowMultiple?: boolean;
};

type ListViewProps = {
  token: string;
  viewKey: string;
  formViewKey: string;
  onOpenForm: (id: string | "new") => void;
  contextWorldId?: string;
  contextCampaignId?: string;
  contextCharacterId?: string;
  extraParams?: Record<string, string | undefined>;
  titleOverride?: string;
  subtitleOverride?: string;
  currentUserRole?: string;
};

const fieldSorter = (a: ListField, b: ListField) =>
  (a.listOrder ?? 0) - (b.listOrder ?? 0);

const filterRows = (rows: Record<string, unknown>[], fields: ListField[], query: string) => {
  if (!query) return rows;
  const normalized = query.toLowerCase();

  return rows.filter((row) =>
    fields.some((field) => {
      const value =
        field.source === "entity"
          ? (row.fieldValues as Record<string, unknown> | undefined)?.[field.fieldKey]
          : row[field.fieldKey];
      return String(value ?? "").toLowerCase().includes(normalized);
    })
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
  contextCharacterId,
  extraParams,
  titleOverride,
  subtitleOverride,
  currentUserRole
}: ListViewProps) {
  const [view, setView] = useState<SystemView | null>(null);
  const [availableFields, setAvailableFields] = useState<ListField[]>([]);
  const [listColumns, setListColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<ListFilterRule[]>([]);
  const [filterLogic, setFilterLogic] = useState<"AND" | "OR">("AND");
  const { showPopout, updatePopout } = usePopout();
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [prefsVersion, setPrefsVersion] = useState(0);
  const [filterReferenceOptions, setFilterReferenceOptions] = useState<Record<string, Choice[]>>(
    {}
  );
  const [configPopoutId, setConfigPopoutId] = useState<string | null>(null);
  const [selectedAvailable, setSelectedAvailable] = useState<string | null>(null);
  const [selectedShown, setSelectedShown] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [viewLoading, setViewLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [choiceMaps, setChoiceMaps] = useState<Record<string, Record<string, Choice>>>({});
  const [referenceMaps, setReferenceMaps] = useState<Record<string, Record<string, string>>>({});
  const [entityPanelId, setEntityPanelId] = useState<string | null>(null);
  const extraParamsKey = JSON.stringify(extraParams ?? {});
  const filtersKey = JSON.stringify({ logic: filterLogic, rules: filters });
  const listColumnsKey = JSON.stringify(listColumns);
  const entityTypeId = extraParams?.entityTypeId;
  const locationTypeId = extraParams?.locationTypeId;
  const isEntityTypeList = view?.entityKey === "entities" && Boolean(entityTypeId);
  const isLocationTypeList = view?.entityKey === "locations" && Boolean(locationTypeId);
  const { permissions } = usePermissions({
    token,
    entityKey: view?.entityKey,
    worldId: contextWorldId,
    campaignId: contextCampaignId,
    characterId: contextCharacterId,
    entityTypeId,
    locationTypeId,
    enabled: Boolean(view?.entityKey)
  });
  const canCreate = permissions.canCreate;

  const normalizeFilterGroup = (input: unknown): ListFilterGroup => {
    if (Array.isArray(input)) {
      return { logic: "AND", rules: input as ListFilterRule[] };
    }
    if (input && typeof input === "object") {
      const group = input as { logic?: string; rules?: unknown };
      return {
        logic: group.logic === "OR" ? "OR" : "AND",
        rules: Array.isArray(group.rules) ? (group.rules as ListFilterRule[]) : []
      };
    }
    return { logic: "AND", rules: [] };
  };

  useEffect(() => {
    let ignore = false;

    const loadView = async () => {
      setViewLoading(true);
      setError(null);
      try {
        const viewResponse = await fetch(`/api/views/${viewKey}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (viewResponse.status === 401) {
          dispatchUnauthorized();
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
              .filter((field) => field.listVisible && field.optionsListKey)
              .map((field) => field.optionsListKey as string)
          )
        );

        const listKeyResults = await Promise.all(
          listKeys.map(async (listKey) => {
            const choiceResponse = await fetch(`/api/choices?listKey=${listKey}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (choiceResponse.status === 401) {
              dispatchUnauthorized();
              return [listKey, []] as const;
            }
            if (!choiceResponse.ok) return [listKey, []] as const;
            const data = (await choiceResponse.json()) as Choice[];
            return [listKey, data] as const;
          })
        );

        if (ignore) return;

        const newChoiceMaps: Record<string, Record<string, Choice>> = {};
        listKeyResults.forEach(([listKey, choices]) => {
          newChoiceMaps[listKey] = choices.reduce<Record<string, Choice>>((acc, choice) => {
            acc[choice.value] = choice;
            return acc;
          }, {});
        });
        setChoiceMaps(newChoiceMaps);

      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load view.");
        }
      } finally {
        if (!ignore) setViewLoading(false);
      }
    };

    void loadView();

    return () => {
      ignore = true;
    };
  }, [token, viewKey]);

  useEffect(() => {
    let ignore = false;
    if (!view) return;

    const loadData = async () => {
      setDataLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (extraParams) {
          Object.entries(extraParams).forEach(([key, value]) => {
            if (value) params.set(key, value);
          });
        }
        if (view.entityKey === "worlds" && contextWorldId) {
          params.set("worldId", contextWorldId);
        }
        if (view.entityKey === "entity_types" && contextWorldId) {
          params.set("worldId", contextWorldId);
        }
        if (view.entityKey === "entity_fields" && contextWorldId) {
          params.set("worldId", contextWorldId);
        }
        if (view.entityKey === "entity_field_choices" && contextWorldId) {
          params.set("worldId", contextWorldId);
        }
        if (view.entityKey === "relationship_types" && contextWorldId) {
          params.set("worldId", contextWorldId);
        }
        if (view.entityKey === "relationship_type_rules" && contextWorldId) {
          params.set("worldId", contextWorldId);
        }
        if (view.entityKey === "location_types" && contextWorldId) {
          params.set("worldId", contextWorldId);
        }
        if (view.entityKey === "location_type_fields" && contextWorldId) {
          params.set("worldId", contextWorldId);
        }
        if (view.entityKey === "location_type_field_choices" && contextWorldId) {
          params.set("worldId", contextWorldId);
        }
        if (view.entityKey === "location_type_rules" && contextWorldId) {
          params.set("worldId", contextWorldId);
        }
        if (view.entityKey === "campaigns") {
          if (contextWorldId) params.set("worldId", contextWorldId);
          if (contextCampaignId) params.set("campaignId", contextCampaignId);
          if (contextCharacterId) params.set("characterId", contextCharacterId);
        }
        if (view.entityKey === "characters") {
          if (contextWorldId) params.set("worldId", contextWorldId);
          if (contextCampaignId) params.set("campaignId", contextCampaignId);
          if (contextCharacterId) params.set("characterId", contextCharacterId);
        }
        if (view.entityKey === "entities") {
          if (contextWorldId) params.set("worldId", contextWorldId);
          if (contextCampaignId) params.set("campaignId", contextCampaignId);
          if (contextCharacterId) params.set("characterId", contextCharacterId);
          if (entityTypeId) {
            const entityFieldKeys = availableFields
              .filter((field) => field.source === "entity")
              .map((field) => field.fieldKey);
            const filterFieldKeys = filters
              .map((filter) => filter.fieldKey)
              .filter((key) => entityFieldKeys.includes(key));
            const columnFieldKeys = listColumns.filter((key) => entityFieldKeys.includes(key));
            const fieldKeys = Array.from(new Set([...filterFieldKeys, ...columnFieldKeys]));
            if (fieldKeys.length > 0) {
              params.set("fieldKeys", fieldKeys.join(","));
            }
            if (filters.length > 0) {
              params.set("filters", JSON.stringify({ logic: filterLogic, rules: filters }));
            }
          }
        }
        if (view.entityKey === "locations") {
          if (contextWorldId) params.set("worldId", contextWorldId);
          if (contextCampaignId) params.set("campaignId", contextCampaignId);
          if (contextCharacterId) params.set("characterId", contextCharacterId);
          if (locationTypeId) {
            const customFieldKeys = availableFields
              .filter((field) => field.source === "entity")
              .map((field) => field.fieldKey);
            const filterFieldKeys = filters
              .map((filter) => filter.fieldKey)
              .filter((key) => customFieldKeys.includes(key));
            const columnFieldKeys = listColumns.filter((key) => customFieldKeys.includes(key));
            const fieldKeys = Array.from(new Set([...filterFieldKeys, ...columnFieldKeys]));
            if (fieldKeys.length > 0) {
              params.set("fieldKeys", fieldKeys.join(","));
            }
            if (filters.length > 0) {
              params.set("filters", JSON.stringify({ logic: filterLogic, rules: filters }));
            }
          }
        }

        const dataUrl = params.toString()
          ? `${view.endpoint}?${params.toString()}`
          : view.endpoint;

        const dataResponse = await fetch(dataUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (dataResponse.status === 401) {
          dispatchUnauthorized();
          return;
        }

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
        if (!ignore) setDataLoading(false);
      }
    };

    void loadData();

    return () => {
      ignore = true;
    };
  }, [
    view,
    token,
    contextWorldId,
    contextCampaignId,
    contextCharacterId,
    extraParamsKey,
    filtersKey,
    listColumnsKey,
    availableFields
  ]);

  useEffect(() => {
    let ignore = false;

    const loadFieldsAndPrefs = async () => {
      if (!view) return;
      setPrefsLoading(true);
      setPrefsError(null);

      let fields: ListField[] = [];
      if (view.entityKey === "entities" && entityTypeId) {
        const baseFields: ListField[] = [
          {
            fieldKey: "name",
            label: "Name",
            fieldType: "TEXT",
            listOrder: 0,
            source: "system"
          },
          {
            fieldKey: "description",
            label: "Description",
            fieldType: "TEXTAREA",
            listOrder: 1,
            source: "system"
          }
        ];
        const response = await fetch(`/api/entity-fields?entityTypeId=${entityTypeId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as Array<{
            fieldKey: string;
            label: string;
            fieldType: string;
            listOrder: number;
            choices?: Choice[];
            referenceEntityTypeId?: string | null;
          }>;
          fields = [
            ...baseFields,
            ...data.map((field) => ({
              fieldKey: field.fieldKey,
              label: field.label,
              fieldType: field.fieldType,
              listOrder: field.listOrder ?? 0,
              source: "entity" as const,
              choices: field.choices?.map((choice) => ({
                value: choice.value,
                label: choice.label,
                pillColor: choice.pillColor ?? null,
                textColor: choice.textColor ?? null
              })),
              referenceEntityKey:
                field.fieldType === "ENTITY_REFERENCE"
                  ? "entities"
                  : field.fieldType === "LOCATION_REFERENCE"
                    ? "locations"
                    : undefined,
              referenceEntityTypeId: field.referenceEntityTypeId ?? null
            }))
          ];
        } else {
          fields = baseFields;
          if (response.status !== 403) {
            setPrefsError("Unable to load entity fields.");
          }
        }
      } else if (view.entityKey === "locations" && locationTypeId) {
        const baseFields: ListField[] = [
          {
            fieldKey: "name",
            label: "Name",
            fieldType: "TEXT",
            listOrder: 0,
            source: "system"
          },
          {
            fieldKey: "description",
            label: "Description",
            fieldType: "TEXTAREA",
            listOrder: 1,
            source: "system"
          },
          {
            fieldKey: "status",
            label: "Status",
            fieldType: "SELECT",
            listOrder: 2,
            source: "system"
          }
        ];
        const response = await fetch(
          `/api/location-type-fields?locationTypeId=${locationTypeId}`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        if (response.status === 401) {
          dispatchUnauthorized();
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as Array<{
            fieldKey: string;
            fieldLabel: string;
            fieldType: string;
            listOrder: number;
            choices?: Choice[];
          }>;
          fields = [
            ...baseFields,
            ...data.map((field) => ({
              fieldKey: field.fieldKey,
              label: field.fieldLabel ?? field.fieldKey,
              fieldType: field.fieldType,
              listOrder: field.listOrder ?? 0,
              source: "entity" as const,
              choices: field.choices?.map((choice) => ({
                value: choice.value,
                label: choice.label,
                pillColor: choice.pillColor ?? null,
                textColor: choice.textColor ?? null
              })),
              referenceEntityKey:
                field.fieldType === "ENTITY_REFERENCE"
                  ? "entities"
                  : field.fieldType === "LOCATION_REFERENCE"
                    ? "locations"
                    : undefined
            }))
          ];
        } else {
          fields = baseFields;
          if (response.status !== 403) {
            setPrefsError("Unable to load location fields.");
          }
        }
      } else {
        fields = view.fields.map((field) => ({
          fieldKey: field.fieldKey,
          label: field.label,
          fieldType: field.fieldType,
          listOrder: field.listOrder,
          width: field.width,
          referenceEntityKey: field.referenceEntityKey ?? null,
          optionsListKey: field.optionsListKey ?? null,
          allowMultiple: field.allowMultiple,
          source: "system" as const
        }));
      }

      if (ignore) return;
      setAvailableFields(fields);

      const prefParams = new URLSearchParams({ viewKey });
      if (entityTypeId) prefParams.set("entityTypeId", entityTypeId);
      const prefResponse = await fetch(`/api/list-view-preferences?${prefParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (prefResponse.status === 401) {
        dispatchUnauthorized();
        return;
      }
      if (!prefResponse.ok) {
        setPrefsError("Unable to load list preferences.");
        setPrefsLoading(false);
        return;
      }

      const prefData = (await prefResponse.json()) as {
        user?: { columnsJson?: unknown; filtersJson?: unknown } | null;
        defaults?: { columnsJson?: unknown; filtersJson?: unknown } | null;
      };

      const userFiltersPayload = prefData.user?.filtersJson;
      const defaultFiltersPayload = prefData.defaults?.filtersJson;
      const hasUserFilters = userFiltersPayload !== undefined && userFiltersPayload !== null;
      const hasDefaultFilters = defaultFiltersPayload !== undefined && defaultFiltersPayload !== null;

      const availableKeys = new Set(fields.map((field) => field.fieldKey));
      const userColumns = Array.isArray(prefData.user?.columnsJson)
        ? (prefData.user?.columnsJson as string[])
        : null;
      const defaultColumns = Array.isArray(prefData.defaults?.columnsJson)
        ? (prefData.defaults?.columnsJson as string[])
        : null;
      const userFilters = normalizeFilterGroup(userFiltersPayload);
      const defaultFilters = normalizeFilterGroup(defaultFiltersPayload);

      const usesCustomFields =
        (view.entityKey === "entities" && entityTypeId) ||
        (view.entityKey === "locations" && locationTypeId);
      const fallbackColumns = usesCustomFields
        ? [
            "name",
            "description",
            ...fields
              .filter((field) => field.source === "entity")
              .sort(fieldSorter)
              .slice(0, 3)
              .map((field) => field.fieldKey)
          ]
        : fields
            .filter((field) => {
              const original = view.fields.find((item) => item.fieldKey === field.fieldKey);
              return original?.listVisible ?? true;
            })
            .sort(fieldSorter)
            .map((field) => field.fieldKey);

      const nextColumns = (userColumns ?? defaultColumns ?? fallbackColumns).filter((key) =>
        availableKeys.has(key)
      );

      setListColumns(nextColumns);
      const selectedFilters = hasUserFilters
        ? userFilters
        : hasDefaultFilters
          ? defaultFilters
          : { logic: "AND", rules: [] };
      setFilterLogic(selectedFilters.logic);
      setFilters(selectedFilters.rules);
      setPrefsLoading(false);
    };

    void loadFieldsAndPrefs();

    return () => {
      ignore = true;
    };
  }, [view, token, viewKey, entityTypeId, locationTypeId, prefsVersion]);

  const listFields = useMemo(() => {
    if (!view) return [];
    const fieldMap = new Map(availableFields.map((field) => [field.fieldKey, field]));
    const ordered = listColumns
      .map((key) => fieldMap.get(key))
      .filter((field): field is ListField => Boolean(field));
    if (ordered.length > 0) return ordered;
    return availableFields
      .filter((field) => {
        if (field.source === "system") {
          const systemField = view.fields.find((item) => item.fieldKey === field.fieldKey);
          return systemField?.listVisible ?? true;
        }
        return true;
      })
      .sort(fieldSorter);
  }, [view, availableFields, listColumns]);

  useEffect(() => {
    let ignore = false;

    const loadReferences = async () => {
      if (!view) return;

      const refFields = listFields.filter((field) => field.referenceEntityKey);

      if (refFields.length === 0 || rows.length === 0) {
        setReferenceMaps({});
        return;
      }

      const idsByKey: Record<string, Set<string>> = {};
      refFields.forEach((field) => {
        const entityKey = field.referenceEntityKey as string;
        const entityTypePart = field.referenceEntityTypeId ?? "any";
        const key = `${entityKey}:${entityTypePart}`;
        if (!idsByKey[key]) idsByKey[key] = new Set();
        rows.forEach((row) => {
          const rawValue =
            field.source === "entity"
              ? (row.fieldValues as Record<string, unknown> | undefined)?.[field.fieldKey]
              : row[field.fieldKey];
          if (rawValue) idsByKey[key].add(String(rawValue));
        });
      });

      const keys = Object.keys(idsByKey);
        const results = await Promise.all(
          keys.map(async (key) => {
            const [entityKey, entityTypePart] = key.split(":");
            const ids = Array.from(idsByKey[key]);
            if (ids.length === 0) return [key, {}] as const;
            const params = new URLSearchParams({
              entityKey,
              ids: ids.join(",")
            });
            if (entityKey === "entities") {
              if (contextWorldId) params.set("worldId", contextWorldId);
              if (contextCampaignId) params.set("campaignId", contextCampaignId);
              if (contextCharacterId) params.set("characterId", contextCharacterId);
            }
            if (entityKey === "locations") {
              if (contextWorldId) params.set("worldId", contextWorldId);
              if (contextCampaignId) params.set("campaignId", contextCampaignId);
              if (contextCharacterId) params.set("characterId", contextCharacterId);
            }
            if (
              entityKey === "location_types" ||
              entityKey === "location_type_fields"
            ) {
              if (contextWorldId) params.set("worldId", contextWorldId);
            }
            if (entityTypePart && entityTypePart !== "any") {
              params.set("entityTypeId", entityTypePart);
            }
            const response = await fetch(`/api/references?${params.toString()}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
          if (response.status === 401) {
            dispatchUnauthorized();
            return [key, {}] as const;
          }
          if (!response.ok) return [key, {}] as const;
          const data = (await response.json()) as Array<{ id: string; label: string }>;
          const map = data.reduce<Record<string, string>>((acc, item) => {
            acc[item.id] = item.label;
            return acc;
          }, {});
          return [key, map] as const;
        })
      );

      if (ignore) return;
      const nextMaps: Record<string, Record<string, string>> = {};
      results.forEach(([key, map]) => {
        nextMaps[key] = map;
      });
      setReferenceMaps(nextMaps);
    };

    void loadReferences();

    return () => {
      ignore = true;
    };
    }, [view, rows, token, listFields, contextWorldId, contextCampaignId, contextCharacterId]);

  useEffect(() => {
    if (!token) return;
    const pending = filters
      .map((filter) => availableFields.find((field) => field.fieldKey === filter.fieldKey))
      .filter((field): field is ListField => Boolean(field))
      .filter((field) => field.referenceEntityKey && !filterReferenceOptions[field.fieldKey]);

    if (pending.length === 0) return;

    let ignore = false;

    const load = async () => {
      const nextOptions: Record<string, Choice[]> = {};
      await Promise.all(
        pending.map(async (field) => {
          const params = new URLSearchParams({
            entityKey: field.referenceEntityKey as string,
            query: ""
          });
          if (contextWorldId) params.set("worldId", contextWorldId);
          if (contextCampaignId) params.set("campaignId", contextCampaignId);
          if (contextCharacterId) params.set("characterId", contextCharacterId);
          if (field.referenceEntityTypeId) {
            params.set("entityTypeId", field.referenceEntityTypeId);
          }
          const response = await fetch(`/api/references?${params.toString()}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!response.ok) return;
          const data = (await response.json()) as Array<{ id: string; label: string }>;
          nextOptions[field.fieldKey] = data.map((item) => ({
            value: item.id,
            label: item.label
          }));
        })
      );
      if (ignore) return;
      if (Object.keys(nextOptions).length > 0) {
        setFilterReferenceOptions((current) => ({ ...current, ...nextOptions }));
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [
    token,
    filters,
    availableFields,
    filterReferenceOptions,
    contextWorldId,
    contextCampaignId,
    contextCharacterId
  ]);

  const filteredRows = useMemo(() => filterRows(rows, listFields, query), [rows, listFields, query]);
  const primaryField = listFields[0];
  const statusField = listFields.find(
    (field) => (field.fieldType === "SELECT" || field.fieldType === "CHOICE") && isStatusField(field)
  );
  const secondaryFields = listFields.filter((field) => field !== primaryField);
  const canConfigureList = availableFields.length > 0;
  const showEntityFilters = Boolean(isEntityTypeList || isLocationTypeList);
  const isAdmin = currentUserRole === "ADMIN";

    const updateFilter = (index: number, next: Partial<ListFilterRule>) => {
      setFilters((current) =>
        current.map((filter, i) => (i === index ? { ...filter, ...next } : filter))
      );
    };

  const addFilter = () => {
    const defaultField = availableFields[0]?.fieldKey ?? "";
    setFilters((current) => [
      ...current,
      { fieldKey: defaultField, operator: "equals", value: "" }
    ]);
  };

  const removeFilter = (index: number) => {
    setFilters((current) => current.filter((_, i) => i !== index));
  };

  const savePreferences = async () => {
    if (!viewKey) return;
    setPrefsError(null);
    const params = new URLSearchParams({ viewKey });
    if (entityTypeId) params.set("entityTypeId", entityTypeId);
    const response = await fetch(`/api/list-view-preferences?${params.toString()}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ columns: listColumns, filters: { logic: filterLogic, rules: filters } })
    });
    if (response.status === 401) {
      dispatchUnauthorized();
      return;
    }
    if (!response.ok) {
      setPrefsError("Unable to save list preferences.");
      return;
    }
    setPrefsVersion((current) => current + 1);
  };

  const resetPreferences = async () => {
    if (!viewKey) return;
    setPrefsError(null);
    const params = new URLSearchParams({ viewKey });
    if (entityTypeId) params.set("entityTypeId", entityTypeId);
    const response = await fetch(`/api/list-view-preferences?${params.toString()}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 401) {
      dispatchUnauthorized();
      return;
    }
    if (!response.ok) {
      setPrefsError("Unable to reset list preferences.");
      return;
    }
    setPrefsVersion((current) => current + 1);
  };

  const saveDefaultPreferences = async () => {
    if (!entityTypeId) return;
    setPrefsError(null);
    const params = new URLSearchParams({ entityTypeId });
    const response = await fetch(`/api/entity-type-list-defaults?${params.toString()}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ columns: listColumns, filters: { logic: filterLogic, rules: filters } })
    });
    if (response.status === 401) {
      dispatchUnauthorized();
      return;
    }
    if (!response.ok) {
      setPrefsError("Unable to save list defaults.");
      return;
    }
    setPrefsVersion((current) => current + 1);
  };

  const availableList = availableFields
    .filter((field) => !listColumns.includes(field.fieldKey))
    .sort(fieldSorter);
  const shownList = listColumns
    .map((key) => availableFields.find((field) => field.fieldKey === key))
    .filter((field): field is ListField => Boolean(field));
  const selectedShownIndex = selectedShown
    ? listColumns.findIndex((key) => key === selectedShown)
    : -1;
  const canAdd = Boolean(selectedAvailable);
  const canRemove = Boolean(selectedShown);
  const canMoveUp = selectedShownIndex > 0;
  const canMoveDown = selectedShownIndex >= 0 && selectedShownIndex < listColumns.length - 1;

  const handleAddSelected = () => {
    if (!selectedAvailable) return;
    setListColumns((current) => [...current, selectedAvailable]);
    setSelectedAvailable(null);
  };

  const handleRemoveSelected = () => {
    if (!selectedShown) return;
    setListColumns((current) => current.filter((key) => key !== selectedShown));
    setSelectedShown(null);
  };

  const handleMoveSelected = (direction: -1 | 1) => {
    if (selectedShownIndex < 0) return;
    const targetIndex = selectedShownIndex + direction;
    if (targetIndex < 0 || targetIndex >= listColumns.length) return;
    setListColumns((current) => {
      const next = [...current];
      const [moved] = next.splice(selectedShownIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const renderConfigContent = () => (
    <div className="list-view__config">
      <div className="list-view__config-header">
        <span>List configuration</span>
        {prefsLoading ? <span className="list-view__config-status">Loading...</span> : null}
        {prefsError ? <span className="list-view__config-error">{prefsError}</span> : null}
      </div>
      <div className="list-view__config-body">
        <div className="list-view__config-section">
          <div className="list-view__config-title">Columns</div>
          <div className="list-view__config-panels">
            <div className="list-view__config-panel">
              <div className="list-view__config-panel-title">Available fields</div>
              <div className="list-view__config-list">
                {availableList.map((field) => (
                  <button
                    key={field.fieldKey}
                    type="button"
                    className={`list-view__config-item ${
                      selectedAvailable === field.fieldKey ? "is-selected" : ""
                    }`}
                    onClick={() => {
                      setSelectedAvailable(field.fieldKey);
                      setSelectedShown(null);
                    }}
                  >
                    <span>{field.label}</span>
                  </button>
                ))}
                {availableList.length === 0 ? (
                  <div className="list-view__filters-empty">All fields are visible.</div>
                ) : null}
              </div>
            </div>
            <div className="list-view__config-controls">
              <button
                type="button"
                className="ghost-button"
                disabled={!canAdd}
                onClick={handleAddSelected}
              >
                Add
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={!canRemove}
                onClick={handleRemoveSelected}
              >
                Remove
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={!canMoveUp}
                onClick={() => handleMoveSelected(-1)}
              >
                Move up
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={!canMoveDown}
                onClick={() => handleMoveSelected(1)}
              >
                Move down
              </button>
            </div>
            <div className="list-view__config-panel">
              <div className="list-view__config-panel-title">Shown fields</div>
              <div className="list-view__config-list">
                {shownList.map((field) => (
                  <button
                    key={field.fieldKey}
                    type="button"
                    className={`list-view__config-item ${
                      selectedShown === field.fieldKey ? "is-selected" : ""
                    }`}
                    onClick={() => {
                      setSelectedShown(field.fieldKey);
                      setSelectedAvailable(null);
                    }}
                  >
                    <span>{field.label}</span>
                  </button>
                ))}
                {shownList.length === 0 ? (
                  <div className="list-view__filters-empty">No fields selected.</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const popoutActions = [
    {
      label: "Reset to default",
      onClick: () => {
        void resetPreferences();
      },
      closeOnClick: false
    },
    {
      label: "Save view",
      onClick: () => {
        void savePreferences();
      },
      closeOnClick: false
    },
    ...(isAdmin && isEntityTypeList
      ? [
          {
            label: "Set as default",
            tone: "primary" as const,
            onClick: () => {
              void saveDefaultPreferences();
            },
            closeOnClick: false
          }
        ]
      : []),
    { label: "Close" }
  ];

  const openConfigPopout = () => {
    const id = showPopout({
      title: "List configuration",
      message: renderConfigContent(),
      actions: popoutActions
    });
    setConfigPopoutId(id);
  };

  useEffect(() => {
    if (!configPopoutId) return;
    updatePopout(configPopoutId, {
      title: "List configuration",
      message: renderConfigContent(),
      actions: popoutActions
    });
  }, [
    configPopoutId,
    availableList,
    shownList,
    selectedAvailable,
    selectedShown,
    listColumns,
    prefsLoading,
    prefsError,
    updatePopout
  ]);

  const getRawValue = (field: ListField, row: Record<string, unknown>) =>
    field.source === "entity"
      ? (row.fieldValues as Record<string, unknown> | undefined)?.[field.fieldKey]
      : row[field.fieldKey];

  const getDisplayValue = (field: ListField, row: Record<string, unknown>) => {
    const rawValue = getRawValue(field, row);
    if (rawValue === null || rawValue === undefined) return "";

    if (field.fieldType === "BOOLEAN") {
      const boolValue = rawValue === true || rawValue === "true" || rawValue === 1;
      return boolValue ? "Yes" : "No";
    }

    const listKey = field.optionsListKey ?? "";
    const mapped = listKey && rawValue != null ? choiceMaps[listKey]?.[String(rawValue)] : undefined;
    const choiceMapped =
      field.choices?.find((choice) => choice.value === String(rawValue))?.label ?? undefined;
    const referenceEntity = field.referenceEntityKey ?? "";
    const referenceKey = `${referenceEntity}:${field.referenceEntityTypeId ?? "any"}`;
    const referenceLabel =
      field.referenceEntityKey && rawValue != null
        ? referenceMaps[referenceKey]?.[String(rawValue)]
        : undefined;

    return mapped?.label ?? choiceMapped ?? referenceLabel ?? rawValue;
  };

    const getChoiceFormat = (field: ListField, rawValue: unknown) => {
      if (rawValue === null || rawValue === undefined) return null;
      const value = String(rawValue);
      const fromField = field.choices?.find((choice) => choice.value === value);
      const listKey = field.optionsListKey ?? "";
      const fromList = listKey ? choiceMaps[listKey]?.[value] : undefined;
      const choice = fromField ?? fromList;
      if (!choice) return null;
      return {
        label: choice.label,
        pillColor: choice.pillColor ?? null,
        textColor: choice.textColor ?? null
      };
    };

    const renderCellValue = (field: ListField, row: Record<string, unknown>) => {
      const rawValue = getRawValue(field, row);
      const display = getDisplayValue(field, row);
      const text = String(display ?? "");
      if (text) {
        const format = getChoiceFormat(field, rawValue);
        if (format && (format.pillColor || format.textColor)) {
          return (
            <span
              className="choice-badge"
              style={{
                backgroundColor: format.pillColor ?? undefined,
                color: format.textColor ?? undefined
              }}
            >
              {format.label ?? text}
            </span>
          );
        }
        if (
          (field.fieldType === "SELECT" || field.fieldType === "CHOICE") &&
          isStatusField(field)
        ) {
          const tone = getStatusTone(text);
          return <span className={`status-badge status-badge--${tone}`}>{text}</span>;
        }
      }
      return text;
    };

    const operatorLabelMap: Record<string, string> = {
      equals: "is",
      not_equals: "is not",
      contains: "contains",
      contains_any: "contains any",
      is_set: "is set",
      is_not_set: "is not set"
    };
    const getFilterLabel = (filter: ListFilterRule) => {
      const fieldMeta = availableFields.find((field) => field.fieldKey === filter.fieldKey);
      const label = fieldMeta?.label ?? filter.fieldKey;
      const operatorLabel = operatorLabelMap[filter.operator] ?? filter.operator;
      if (filter.operator === "is_set" || filter.operator === "is_not_set") {
        return `${label} ${operatorLabel}`;
      }
      if (fieldMeta?.choices?.length) {
        const choice = fieldMeta.choices.find(
          (entry) => entry.value === String(filter.value ?? "")
        );
        return `${label} ${operatorLabel} ${choice?.label ?? filter.value ?? ""}`;
      }
      if (fieldMeta?.optionsListKey) {
        const mapped = choiceMaps[fieldMeta.optionsListKey]?.[String(filter.value ?? "")];
        return `${label} ${operatorLabel} ${mapped?.label ?? filter.value ?? ""}`;
      }
      if (fieldMeta?.referenceEntityKey) {
        const referenceEntity = fieldMeta.referenceEntityKey ?? "";
        const referenceKey = `${referenceEntity}:${fieldMeta.referenceEntityTypeId ?? "any"}`;
        const referenceLabel = filter.value
          ? referenceMaps[referenceKey]?.[String(filter.value)]
          : undefined;
        return `${label} ${operatorLabel} ${referenceLabel ?? filter.value ?? ""}`;
      }
      return `${label} ${operatorLabel} ${filter.value ?? ""}`;
    };

    const renderEntityNameCell = (row: Record<string, unknown>) => {
      const name = primaryField ? renderCellValue(primaryField, row) : "";
      return (
        <span className="list-view__entity-name">
          <span>{name}</span>
          <button
            type="button"
            className="list-view__info"
            onClick={(event) => {
              event.stopPropagation();
              setEntityPanelId(String(row.id));
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
            aria-label="Open entity info"
            title="Open entity info"
          >
            i
          </button>
        </span>
      );
    };

  if (viewLoading || dataLoading) {
    return (
      <div className="view-state view-state--skeleton">
        <div className="view-skeleton">
          <div className="view-skeleton__title"></div>
          <div className="view-skeleton__line"></div>
          <div className="view-skeleton__line view-skeleton__line--short"></div>
          <div className="view-skeleton__row"></div>
          <div className="view-skeleton__row"></div>
          <div className="view-skeleton__row"></div>
          <div className="view-skeleton__row"></div>
          <div className="view-skeleton__row"></div>
        </div>
      </div>
    );
  }

  if (error || !view) {
    return <div className="view-state error">{error ?? "View unavailable."}</div>;
  }

  return (
    <div className="list-view">
        <div className="list-view__header">
          <div className="list-view__heading">
            <h1>{titleOverride ?? view.title}</h1>
            <p className="list-view__subtitle">{subtitleOverride ?? "List view"}</p>
          </div>
        </div>
        <div className="list-view__toolbar">
          <div className="list-view__toolbar-left">
            <input
              className="list-view__search"
              placeholder="Search records"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {showEntityFilters ? (
              <>
                <label className="list-view__filters-logic">
                  Match
                  <select
                    value={filterLogic}
                    onChange={(event) => setFilterLogic(event.target.value as "AND" | "OR")}
                  >
                    <option value="AND">All</option>
                    <option value="OR">Any</option>
                  </select>
                </label>
                <button type="button" className="ghost-button" onClick={addFilter}>
                  Add filter
                </button>
              </>
            ) : null}
          </div>
          <div className="list-view__toolbar-center">
            {showEntityFilters && filters.length > 0 ? (
              <div className="list-view__filter-chips">
                {filters.map((filter, index) => (
                  <button
                    key={`${filter.fieldKey}-${index}`}
                    type="button"
                    className="list-view__filter-chip"
                    onClick={() => removeFilter(index)}
                    title="Remove filter"
                  >
                    <span>{getFilterLabel(filter)}</span>
                    <span aria-hidden="true"></span>
                  </button>
                ))}
              </div>
            ) : showEntityFilters ? (
              <span className="list-view__filters-hint">No filters applied.</span>
            ) : null}
          </div>
          <div className="list-view__toolbar-right">
            {canCreate ? (
              <button type="button" className="primary-button" onClick={() => onOpenForm("new")}>
                New
              </button>
            ) : null}
            {canConfigureList ? (
              <button
                type="button"
                className="list-view__icon-button"
                onClick={openConfigPopout}
                aria-label="List configuration"
                title="List configuration"
              >
                ⚙
              </button>
            ) : null}
          </div>
        </div>
        {showEntityFilters && filters.length > 0 ? (
          <div className="list-view__filters list-view__filters--open">
            <div className="list-view__filters-body">
              {filters.map((filter, index) => {
                const fieldMeta = availableFields.find(
                  (field) => field.fieldKey === filter.fieldKey
                );
                const operatorOptions = [
                  { value: "equals", label: "Equals" },
                  { value: "not_equals", label: "Not equals" },
                  { value: "contains", label: "Contains" },
                  { value: "is_set", label: "Is set" },
                  { value: "is_not_set", label: "Is not set" }
                ];
                if (fieldMeta?.allowMultiple) {
                  operatorOptions.push({ value: "contains_any", label: "Contains any of" });
                }

                const valueInput =
                  filter.operator === "is_set" || filter.operator === "is_not_set" ? null : fieldMeta?.choices &&
                    fieldMeta.choices.length > 0 ? (
                      <select
                        value={String(filter.value ?? "")}
                        onChange={(event) =>
                          updateFilter(index, { value: event.target.value })
                        }
                      >
                        <option value="">Select value...</option>
                        {fieldMeta.choices.map((choice) => (
                          <option key={choice.value} value={choice.value}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                    ) : fieldMeta?.optionsListKey ? (
                      <select
                        value={String(filter.value ?? "")}
                        onChange={(event) =>
                          updateFilter(index, { value: event.target.value })
                        }
                      >
                        <option value="">Select value...</option>
                        {Object.entries(choiceMaps[fieldMeta.optionsListKey] ?? {}).map(
                          ([value, choice]) => (
                            <option key={value} value={value}>
                              {choice.label}
                            </option>
                          )
                        )}
                      </select>
                    ) : fieldMeta?.referenceEntityKey ? (
                      <select
                        value={String(filter.value ?? "")}
                        onChange={(event) =>
                          updateFilter(index, { value: event.target.value })
                        }
                      >
                        <option value="">Select value...</option>
                        {(filterReferenceOptions[fieldMeta.fieldKey] ?? []).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={String(filter.value ?? "")}
                        onChange={(event) =>
                          updateFilter(index, { value: event.target.value })
                        }
                      />
                    );

                return (
                  <div key={`${filter.fieldKey}-${index}`} className="list-view__filter-row">
                    <select
                      value={filter.fieldKey}
                      onChange={(event) =>
                        updateFilter(index, {
                          fieldKey: event.target.value,
                          operator: "equals",
                          value: ""
                        })
                      }
                    >
                      <option value="">Select field...</option>
                      {availableFields.map((field) => (
                        <option key={field.fieldKey} value={field.fieldKey}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={filter.operator}
                      onChange={(event) =>
                        updateFilter(index, { operator: event.target.value })
                      }
                    >
                      {operatorOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {valueInput}
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => removeFilter(index)}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

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
            <div className="list-view__cell list-view__cell--actions" aria-hidden="true" />
          </div>
          {filteredRows.length === 0 ? (
            <div className="list-view__empty">
              <div className="list-view__empty-title">
                {`No ${titleOverride ?? view.title} yet`}
              </div>
              <div className="list-view__empty-text">
                {`This list contains ${String(titleOverride ?? view.title).toLowerCase()}.`}
              </div>
              {canCreate ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => onOpenForm("new")}
                >
                  {`Create ${String(titleOverride ?? view.title).replace(/s$/, "")}`}
                </button>
              ) : null}
            </div>
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
                    const descriptionClass =
                      field.fieldKey === "description" ? "list-view__cell--description" : "";
                    const statusClass =
                      field.fieldType === "SELECT" && isStatusField(field)
                        ? "list-view__cell--status"
                        : "";
    
                    return (
                      <div
                        key={field.fieldKey}
                        className={`list-view__cell ${typeClass} ${descriptionClass} ${statusClass}`}
                      >
                        {view.entityKey === "entities" && field.fieldKey === "name"
                          ? renderEntityNameCell(row)
                          : value}
                      </div>
                    );
                  })}
                <div className="list-view__cell list-view__cell--actions">
                  <button
                    type="button"
                    className="list-view__row-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenForm(String(row.id));
                    }}
                    aria-label="Row actions"
                  >
                    ...
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
                <div className="list-card__title">
                  {view.entityKey === "entities" ? renderEntityNameCell(row) : titleValue}
                </div>
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
      <EntitySidePanel
        token={token}
        entityId={entityPanelId}
        contextCampaignId={contextCampaignId}
        contextCharacterId={contextCharacterId}
        onClose={() => setEntityPanelId(null)}
        onOpenRecord={(id) => {
          setEntityPanelId(null);
          onOpenForm(id);
        }}
      />
    </div>
  );
}



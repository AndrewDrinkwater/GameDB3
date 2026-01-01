import { useEffect, useMemo, useState } from "react";
import { dispatchUnauthorized } from "../utils/auth";

export type ViewField = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  listVisible: boolean;
  endpoint?: string;
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

export type SystemView = {
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

export type ListViewProps = {
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

type UseListViewStateProps = Pick<
  ListViewProps,
  | "token"
  | "viewKey"
  | "contextWorldId"
  | "contextCampaignId"
  | "contextCharacterId"
  | "extraParams"
>;

const fieldSorter = (a: ListField, b: ListField) => (a.listOrder ?? 0) - (b.listOrder ?? 0);

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

export function useList({
  token,
  viewKey,
  contextWorldId,
  contextCampaignId,
  contextCharacterId,
  extraParams
}: UseListViewStateProps) {
  const [view, setView] = useState<SystemView | null>(null);
  const [availableFields, setAvailableFields] = useState<ListField[]>([]);
  const [listColumns, setListColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<ListFilterRule[]>([]);
  const [filterLogic, setFilterLogic] = useState<"AND" | "OR">("AND");
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
        if (view.entityKey === "choice_lists" && contextWorldId) {
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
    if (!view) return;

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
              source: "entity",
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
              source: "entity",
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
          source: "system"
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
          if (entityKey === "location_types" || entityKey === "location_type_fields") {
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

  return {
    view,
    viewLoading,
    dataLoading,
    error,
    query,
    setQuery,
    filters,
    filterLogic,
    setFilterLogic,
    availableFields,
    listColumns,
    choiceMaps,
    referenceMaps,
    filterReferenceOptions,
    prefsLoading,
    prefsError,
    configPopoutId,
    setConfigPopoutId,
    selectedAvailable,
    selectedShown,
    availableList,
    shownList,
    selectedShownIndex,
    canAdd,
    canRemove,
    canMoveUp,
    canMoveDown,
    setSelectedAvailable,
    setSelectedShown,
    addFilter,
    removeFilter,
    updateFilter,
    savePreferences,
    resetPreferences,
    saveDefaultPreferences,
    listFields,
    filteredRows,
    primaryField,
    secondaryFields,
    statusField,
    canConfigureList,
    showEntityFilters,
    handleAddSelected,
    handleRemoveSelected,
    handleMoveSelected,
    entityPanelId,
    setEntityPanelId
  };
}

const isStatusField = (field: ListField) => {
  const key = field.fieldKey.toLowerCase();
  const label = field.label.toLowerCase();
  return key.includes("status") || label.includes("status");
};

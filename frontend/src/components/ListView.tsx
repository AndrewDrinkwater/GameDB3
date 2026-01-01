import { useEffect } from "react";
import { useList, type ListViewProps } from "../hooks/useList";
import { usePermissions } from "../utils/permissions";
import { usePopout } from "./PopoutProvider";
import EntitySidePanel from "./EntitySidePanel";
import EmptyState from "./ui/EmptyState";
import ErrorState from "./ui/ErrorState";
import LoadingState from "./ui/LoadingState";

type Choice = { value: string; label: string; pillColor?: string | null; textColor?: string | null };

type ListFilterRule = {
  fieldKey: string;
  operator: string;
  value?: string | string[];
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

const toSingular = (label: string) => {
  if (!label) return label;
  if (label.endsWith("ies")) {
    return `${label.slice(0, -3)}y`;
  }
  if (label.endsWith("s")) {
    return label.slice(0, -1);
  }
  return label;
};

const isStatusField = (field: { fieldKey: string; label: string }) => {
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
  const {
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
  } = useList({
    token,
    viewKey,
    contextWorldId,
    contextCampaignId,
    contextCharacterId,
    extraParams
  });

  const { showPopout, updatePopout } = usePopout();
  const entityTypeId = extraParams?.entityTypeId;
  const locationTypeId = extraParams?.locationTypeId;
  const isEntityTypeList = view?.entityKey === "entities" && Boolean(entityTypeId);
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
  const isAdmin = currentUserRole === "ADMIN";

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
      if ((field.fieldType === "SELECT" || field.fieldType === "CHOICE") && isStatusField(field)) {
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
      const choice = fieldMeta.choices.find((entry) => entry.value === String(filter.value ?? ""));
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
    const name = primaryField ? renderCellValue(primaryField as ListField, row) : "";
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
      <LoadingState>
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
      </LoadingState>
    );
  }

  if (error || !view) {
    return (
      <div className="view-state error">
        <ErrorState message={error ?? "View unavailable."} />
      </div>
    );
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
            aria-label="Search records"
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
              ?
            </button>
          ) : null}
        </div>
      </div>
      {showEntityFilters && filters.length > 0 ? (
        <div className="list-view__filters list-view__filters--open">
          <div className="list-view__filters-body">
            {filters.map((filter, index) => {
              const fieldMeta = availableFields.find((field) => field.fieldKey === filter.fieldKey);
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
                filter.operator === "is_set" || filter.operator === "is_not_set" ? null : fieldMeta
                  ?.choices && fieldMeta.choices.length > 0 ? (
                    <select
                      value={String(filter.value ?? "")}
                      aria-label="Filter value"
                      onChange={(event) => updateFilter(index, { value: event.target.value })}
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
                      aria-label="Filter value"
                      onChange={(event) => updateFilter(index, { value: event.target.value })}
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
                      aria-label="Filter value"
                      onChange={(event) => updateFilter(index, { value: event.target.value })}
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
                      aria-label="Filter value"
                      value={String(filter.value ?? "")}
                      onChange={(event) => updateFilter(index, { value: event.target.value })}
                    />
                  );

              return (
                <div key={`${filter.fieldKey}-${index}`} className="list-view__filter-row">
                  <select
                    value={filter.fieldKey}
                    aria-label="Filter field"
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
                    aria-label="Filter operator"
                    onChange={(event) => updateFilter(index, { operator: event.target.value })}
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
              <EmptyState message={`No ${titleOverride ?? view.title} yet`} />
            </div>
            <div className="list-view__empty-text">
              {`This list contains ${String(titleOverride ?? view.title).toLowerCase()}.`}
            </div>
            {canCreate ? (
              <button type="button" className="primary-button" onClick={() => onOpenForm("new")}>
                {`Create ${toSingular(String(titleOverride ?? view.title))}`}
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
                const value = renderCellValue(field as ListField, row);
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
          <div className="list-view__empty">
            <EmptyState message="No records yet." />
          </div>
        ) : (
          filteredRows.map((row) => {
            const titleValue = primaryField ? renderCellValue(primaryField as ListField, row) : "Record";
            const statusValue = statusField ? renderCellValue(statusField as ListField, row) : null;

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
                      <span className="list-card__value">
                        {renderCellValue(field as ListField, row)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="list-card__actions">
                  <button type="button" className="primary-button" onClick={() => onOpenForm(String(row.id))}>
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

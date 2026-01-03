import { useEffect, useRef } from "react";
import EntityFormDesigner from "./EntityFormDesigner";
import EntityAccessEditor from "./EntityAccessEditor";
import EntitySidePanel from "./EntitySidePanel";
import EntityNotes from "./EntityNotes";
import EntityRelationships from "./EntityRelationships";
import RelatedLists from "./RelatedLists";
import RecordImages from "./RecordImages";
import Toast from "./Toast";
import ErrorState from "./ui/ErrorState";
import LoadingState from "./ui/LoadingState";
import { useForm, type FormViewProps } from "../hooks/useForm";

export default function FormView(props: FormViewProps) {
  const {
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
    renderField,
  } = useForm(props);

  const errorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
    }
  }, [error]);

  const shouldShowValidationErrors =
    typeof error === "string" && error.startsWith("Missing required fields:");
  const formErrorId = error ? "form-error" : undefined;

  if (loading) {
    return (
      <LoadingState>
        <div className="view-state view-state--skeleton">
          <div className="view-skeleton">
            <div className="view-skeleton__title"></div>
            <div className="view-skeleton__line"></div>
            <div className="view-skeleton__line"></div>
            <div className="view-skeleton__line view-skeleton__line--short"></div>
            <div className="view-skeleton__block"></div>
            <div className="view-skeleton__block"></div>
            <div className="view-skeleton__block view-skeleton__block--tall"></div>
          </div>
        </div>
      </LoadingState>
    );
  }

  if (!view) {
    return (
      <div className="view-state error">
        <ErrorState message={error ?? "Form unavailable."} />
      </div>
    );
  }

  return (
    <div className="form-view">
      <div className="form-view__header">
          <button type="button" className="ghost-button" onClick={() => handleNavigateAway(onBack)}>
            &lt;- Back
          </button>
        <div>
          <h1>{formTitle}</h1>
          <p className="form-view__subtitle">{isNew ? "Create" : "Edit"}</p>
        </div>
        <div className="form-view__actions">
          {isDirty ? (
            <div className="form-view__dirty" role="status" aria-live="polite">
              Unsaved changes
            </div>
          ) : null}
          {canDeleteRecord ? (
            <button
              type="button"
              className="danger-button"
              onClick={handleDelete}
              disabled={saving || deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <div
          className="form-view__error"
          id={formErrorId}
          tabIndex={-1}
          ref={errorRef}
        >
          <ErrorState message={error} />
        </div>
      ) : null}

        <form className="form-view__form" onSubmit={handleSubmit}>
          {isRecordView ? (
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
              {isEntityView ? (
                <button
                  type="button"
                  className={`form-view__tab ${entityTab === "relationships" ? "is-active" : ""}`}
                  onClick={() => setEntityTab("relationships")}
                  role="tab"
                  aria-selected={entityTab === "relationships"}
                >
                  Relationships
                </button>
              ) : null}
                {entityAccessAllowed || isNew ? (
                  <button
                    type="button"
                    className={`form-view__tab ${entityTab === "access" ? "is-active" : ""}`}
                    onClick={() => setEntityTab("access")}
                    role="tab"
                    aria-selected={entityTab === "access"}
                  >
                    Access
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`form-view__tab ${entityTab === "notes" ? "is-active" : ""}`}
                  onClick={() => setEntityTab("notes")}
                  role="tab"
                  aria-selected={entityTab === "notes"}
                >
                  Notes
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
          {!isRecordView || entityTab === "info" ? (
            <>
              {entityTypeTab === "designer" && isEntityTypeView ? null : (
                <>
                  {sideBySideInfoFields.length > 0 ? (
                    <div className="form-view__field-row">
                      {sideBySideInfoFields.map(renderField)}
                    </div>
                  ) : null}
                  {shouldUseCustomRows
                    ? customRowFields.map((row, index) => (
                        <div key={`custom-row-${index}`} className="form-view__field-row">
                          {row.map(renderField)}
                        </div>
                      ))
                    : remainingInfoFields.map(renderField)}
                  {shouldUseCustomRows ? customRemainingFields.map(renderField) : null}
                </>
              )}
            {isRecordView && !isNew ? (
              <div className="form-view__section">
                <h2>Images</h2>
                <RecordImages
                  recordType={isEntityView ? "entities" : "locations"}
                  recordId={recordId as string}
                  worldId={
                    typeof formData.worldId === "string" ? formData.worldId : contextWorldId
                  }
                  images={recordImages}
                  onImagesChange={setRecordImages}
                  canEdit={canEditRecord}
                />
              </div>
            ) : null}
            {isRecordView ? (
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
                  <div className="form-view__hint">
                    {isLocationView ? "Select a location type to see fields." : "Select an entity type to see fields."}
                  </div>
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
                  <EntityFormDesigner
                    token={token}
                    entityTypeId={recordId}
                    readOnly={!canEditRecord}
                  />
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
          field.readOnly ||
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
                        setReferenceOpen((current) => ({
                          ...current,
                          [field.fieldKey]: false
                        }));
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
                                const next = selections.filter(
                                  (entry) => entry.value !== item.value
                                );
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
                          if (!isMultiReferenceField(field)) {
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
        {isEntityView && entityTab === "relationships" ? (
          <div className="form-view__section">
            <EntityRelationships
              token={token}
              entityId={recordId}
              worldId={(formData.worldId as string | undefined) ?? contextWorldId}
              entityTypeId={formData.entityTypeId as string | undefined}
              entityName={formData.name as string | undefined}
              contextCampaignId={contextCampaignId}
              contextCharacterId={contextCharacterId}
              onOpenEntity={(entityId) => setEntityPanelId(entityId)}
            />
          </div>
        ) : null}
        {isRecordView && entityTab === "access" ? (
          <div className="form-view__section">
            <h2>Access</h2>
            {entityAccessWarning ? (
              <div className="form-view__hint">{entityAccessWarning}</div>
            ) : null}
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
        {isRecordView && entityTab === "notes" ? (
          <div className="form-view__section">
            <EntityNotes
              token={token}
              recordId={recordId}
              recordType={isLocationView ? "location" : "entity"}
              worldId={(formData.worldId as string | undefined) ?? contextWorldId}
              contextCampaignId={contextCampaignId}
              contextCharacterId={contextCharacterId}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole as "ADMIN" | "USER" | undefined}
              onOpenEntity={(entityId) => setEntityPanelId(entityId)}
              onOpenLocation={openLocationRecord}
              onDirtyChange={setNoteDirty}
              discardVersion={noteDiscardVersion}
            />
          </div>
        ) : null}
        {isRecordView && entityTab === "audit" ? (
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
        {showFormActions ? (
          <div className="form-view__actions">
            <button
              type="button"
              className="ghost-button"
              onClick={handleUpdateAndBack}
              disabled={saving}
            >
              {saving ? "Saving..." : "Update"}
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        ) : null}
      </form>
        <RelatedLists
          token={token}
          parentEntityKey={view.entityKey}
          parentId={recordId}
          disabled={isNew}
          canManage={canEditRecord}
        />
        <EntitySidePanel
          token={token}
          entityId={entityPanelId}
          contextCampaignId={contextCampaignId}
          contextCharacterId={contextCharacterId}
          onClose={() => setEntityPanelId(null)}
          onOpenRecord={openEntityRecord}
        />
        {saveNotice ? (
          <Toast
            key={saveNotice.id}
            message={saveNotice.message}
            onDismiss={() => setSaveNotice(null)}
          />
        ) : null}
      </div>
    );
  }

